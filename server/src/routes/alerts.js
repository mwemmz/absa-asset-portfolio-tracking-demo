import { Router } from 'express';
import { db } from '../db.js';
import { handler, idParam, notFound, oneOf, boundedInt, isoDateParam, text, HttpError, badRequest } from '../lib/validate.js';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
  ALLOWED_TRANSITIONS,
  RESPONSE_STATUSES,
  RESPONSE_TRANSITIONS,
  serialiseAlert,
  serialiseEvent,
} from '../lib/serialize.js';

export const alertsRouter = Router();

const ALERT_SELECT = `
  SELECT a.*, v.reg AS reg, v.driver AS driver
    FROM alerts a
    JOIN vehicles v ON v.id = a.vehicle_id
`;

/* ------------------------------------------------------------- audit log */
const insertEvent = db.prepare(
  `INSERT INTO alert_events (alert_id, vehicle_id, action, from_status, to_status,
     from_response, to_response, note, actor, actor_role, ts)
   VALUES (@alert_id, @vehicle_id, @action, @from_status, @to_status,
     @from_response, @to_response, @note, @actor, @actor_role, @ts)`,
);

const updateAlert = db.prepare(
  `UPDATE alerts SET
     status = @status,
     response_status = @response_status,
     updated_at = @updated_at,
     verified_at = CASE WHEN @verified_at THEN @updated_at ELSE verified_at END,
     escalated_at = CASE WHEN @escalated_at THEN @updated_at ELSE escalated_at END,
     resolved_at  = CASE WHEN @resolved_at  THEN @updated_at ELSE resolved_at END,
     resolved_by  = CASE WHEN @resolved_at  THEN @resolved_by ELSE resolved_by END
   WHERE id = @id`,
);

export async function eventsFor(alertId) {
  const rows = await db
    .prepare('SELECT * FROM alert_events WHERE alert_id = ? ORDER BY ts ASC, id ASC')
    .all([alertId]);
  return rows.map(serialiseEvent);
}

/* ----------------------------------------------------------------- reads */
alertsRouter.get(
  '/',
  handler(async (req, res) => {
    const status = oneOf(req.query.status, ALERT_STATUSES, 'status');
    const type = oneOf(req.query.type, ALERT_TYPES, 'type');
    const severity = oneOf(req.query.severity, ALERT_SEVERITIES, 'severity');
    const vehicleId = req.query.vehicleId ? idParam(req.query.vehicleId, 'vehicleId') : null;
    const from = isoDateParam(req.query.from, 'from');
    const to = isoDateParam(req.query.to, 'to');
    const limit = boundedInt(req.query.limit, { min: 1, max: 500, fallback: 100, label: 'limit' });

    const where = [];
    const params = { limit };
    if (status) {
      where.push('a.status = @status');
      params.status = status;
    }
    if (type) {
      where.push('a.type = @type');
      params.type = type;
    }
    if (severity) {
      where.push('a.severity = @severity');
      params.severity = severity;
    }
    if (vehicleId) {
      where.push('a.vehicle_id = @vehicleId');
      params.vehicleId = vehicleId;
    }
    if (from) {
      where.push('a.created_at >= @from');
      params.from = from;
    }
    if (to) {
      where.push('a.created_at <= @to');
      params.to = to;
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db
      .prepare(`${ALERT_SELECT} ${clause} ORDER BY a.created_at DESC, a.id DESC LIMIT @limit`)
      .all(params);
    // The count has no LIMIT placeholder, so it must not be bound with `limit`:
    // libSQL rejects a statement given an argument it does not reference.
    const { limit: _limit, ...filters } = params;
    const total = (await db.prepare(`SELECT COUNT(*) AS n FROM alerts a ${clause}`).get(filters)).n;

    res.set('X-Total-Count', String(total));
    res.json(rows.map(serialiseAlert));
  }),
);

/** Counts by status / type / severity. Drives the filter chips on the alerts page. */
alertsRouter.get(
  '/summary',
  handler(async (_req, res) => {
    const byStatus = await db
      .prepare('SELECT status, COUNT(*) AS n FROM alerts GROUP BY status')
      .all();
    const byType = await db.prepare('SELECT type, COUNT(*) AS n FROM alerts GROUP BY type').all();
    const openBySeverity = await db
      .prepare(`SELECT severity, COUNT(*) AS n FROM alerts WHERE status <> 'resolved' GROUP BY severity`)
      .all();
    const open = (
      await db.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE status <> 'resolved'`).get()
    ).n;

    res.json({
      open,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      byType: Object.fromEntries(byType.map((r) => [r.type, r.n])),
      openBySeverity: Object.fromEntries(openBySeverity.map((r) => [r.severity, r.n])),
    });
  }),
);

/** Full audit trail across every alert, newest first. */
alertsRouter.get(
  '/audit/recent',
  handler(async (req, res) => {
    const limit = boundedInt(req.query.limit, { min: 1, max: 500, fallback: 100, label: 'limit' });
    const rows = await db
      .prepare(
        `SELECT e.*, v.reg AS reg FROM alert_events e
           JOIN vehicles v ON v.id = e.vehicle_id
          ORDER BY e.ts DESC, e.id DESC LIMIT ?`,
      )
      .all([limit]);
    res.json(rows.map(serialiseEvent));
  }),
);

alertsRouter.get(
  '/:id',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'alert id');
    const row = await db.prepare(`${ALERT_SELECT} WHERE a.id = ?`).get([id]);
    if (!row) throw notFound(`Alert ${id} not found`);
    res.json({ ...serialiseAlert(row), events: await eventsFor(id) });
  }),
);

/* ---------------------------------------------------------------- writes */
/**
 * PATCH /api/alerts/:id   body { status?, responseStatus?, note? }
 *
 * `status` is the agreed contract field: new | verified | escalated | resolved.
 * `responseStatus` is an additive field for the Response step of the incident
 * workflow; it moves independently of the alert status.
 * `note` is appended to the audit trail and is required by nothing, but is
 * strongly encouraged - every state change is recorded with actor and time.
 */
alertsRouter.patch(
  '/:id',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'alert id');
    const body = req.body ?? {};

    const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get([id]);
    if (!alert) throw notFound(`Alert ${id} not found`);

    const nextStatus = oneOf(body.status, ALERT_STATUSES, 'status');
    const nextResponse = oneOf(body.responseStatus, RESPONSE_STATUSES, 'responseStatus');
    const note = text(body.note, { max: 1000, label: 'note' });

    if (nextStatus == null && nextResponse == null && note === '') {
      throw badRequest('Provide at least one of: status, responseStatus, note');
    }

    const fromStatus = alert.status;
    const fromResponse = alert.response_status;
    const ts = new Date().toISOString();
    const events = [];

    /* ---- status transition ------------------------------------------- */
    if (nextStatus != null && nextStatus !== fromStatus) {
      const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
      if (!allowed.includes(nextStatus)) {
        throw new HttpError(
          409,
          allowed.length
            ? `Cannot move an alert from "${fromStatus}" to "${nextStatus}". Allowed next: ${allowed.join(', ')}.`
            : `Alert ${id} is already resolved and its status cannot change.`,
          { from: fromStatus, to: nextStatus, allowed },
        );
      }
      events.push({
        action: nextStatus,
        from_status: fromStatus,
        to_status: nextStatus,
        from_response: null,
        to_response: null,
      });
    }

    /* ---- response transition ------------------------------------------ */
    if (nextResponse != null && nextResponse !== fromResponse) {
      const allowed = RESPONSE_TRANSITIONS[fromResponse] ?? [];
      if (!allowed.includes(nextResponse)) {
        throw new HttpError(
          409,
          allowed.length
            ? `Cannot move the response from "${fromResponse}" to "${nextResponse}". Allowed next: ${allowed.join(', ')}.`
            : `The response for alert ${id} is already closed.`,
          { from: fromResponse, to: nextResponse, allowed },
        );
      }
      events.push({
        action: 'response',
        from_status: null,
        to_status: null,
        from_response: fromResponse,
        to_response: nextResponse,
      });
    }

    /* ---- note only ---------------------------------------------------- */
    if (!events.length) {
      if (note === '') throw badRequest(`Alert ${id} is already in that state`);
      events.push({
        action: 'note',
        from_status: fromStatus,
        to_status: fromStatus,
        from_response: fromResponse,
        to_response: fromResponse,
      });
    }

    const finalStatus = nextStatus ?? fromStatus;
    const finalResponse = nextResponse ?? fromResponse;

    await db.transaction(async () => {
      await updateAlert.run({
        id,
        status: finalStatus,
        response_status: finalResponse,
        updated_at: ts,
        // SQLite has no boolean bind, so these flags are 1/0 and tell the CASE
        // expressions whether this transition should stamp a new timestamp.
        verified_at: Number(nextStatus != null && nextStatus !== 'new' && alert.verified_at == null),
        escalated_at: Number(nextStatus === 'escalated'),
        resolved_at: Number(nextStatus === 'resolved'),
        resolved_by: req.user.name,
      });
      for (const e of events) {
        await insertEvent.run({
          alert_id: id,
          vehicle_id: alert.vehicle_id,
          ...e,
          note,
          actor: req.user.name,
          actor_role: req.user.role,
          ts,
        });
      }
    })();

    const row = await db.prepare(`${ALERT_SELECT} WHERE a.id = ?`).get([id]);
    res.json({ ...serialiseAlert(row), events: await eventsFor(id) });
  }),
);

/** Append a note without changing status. */
alertsRouter.post(
  '/:id/notes',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'alert id');
    const note = text(req.body?.note, { max: 1000, label: 'note', required: true });
    const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get([id]);
    if (!alert) throw notFound(`Alert ${id} not found`);

    const ts = new Date().toISOString();
    await insertEvent.run({
      alert_id: id,
      vehicle_id: alert.vehicle_id,
      action: 'note',
      from_status: alert.status,
      to_status: alert.status,
      from_response: alert.response_status,
      to_response: alert.response_status,
      note,
      actor: req.user.name,
      actor_role: req.user.role,
      ts,
    });
    await db.prepare('UPDATE alerts SET updated_at = ? WHERE id = ?').run([ts, id]);

    const row = await db.prepare(`${ALERT_SELECT} WHERE a.id = ?`).get([id]);
    res.status(201).json({
      ...serialiseAlert(row),
      events: await eventsFor(id),
    });
  }),
);