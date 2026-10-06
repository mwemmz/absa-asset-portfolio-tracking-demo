import { Router } from 'express';
import { db } from '../db.js';
import { boundsOf, centroid } from '../lib/geo.js';
import { handler, idParam, notFound, oneOf, boundedInt } from '../lib/validate.js';
import { DEVICE_STATUSES, VEHICLE_STATUSES, serialiseAlert, serialiseVehicle } from '../lib/serialize.js';

export const vehiclesRouter = Router();

const VEHICLE_SELECT = `
  SELECT v.*, r.name AS route_name, r.corridor AS route_corridor
    FROM vehicles v
    LEFT JOIN routes r ON r.id = v.route_id
`;

vehiclesRouter.get(
  '/',
  handler(async (req, res) => {
    const status = oneOf(req.query.status, VEHICLE_STATUSES, 'status');
    const deviceStatus = oneOf(req.query.deviceStatus, DEVICE_STATUSES, 'deviceStatus');
    const routeId = req.query.routeId ? String(req.query.routeId) : null;
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : null;

    const where = [];
    const params = {};
    if (status) {
      where.push('v.status = @status');
      params.status = status;
    }
    if (deviceStatus) {
      where.push('v.device_status = @deviceStatus');
      params.deviceStatus = deviceStatus;
    }
    if (routeId) {
      where.push('v.route_id = @routeId');
      params.routeId = routeId;
    }
    if (q) {
      where.push(
        '(LOWER(v.reg) LIKE @q OR LOWER(v.driver) LIKE @q OR LOWER(v.customer) LIKE @q OR LOWER(v.agreement_ref) LIKE @q OR LOWER(v.make_model) LIKE @q)',
      );
      params.q = `%${q}%`;
    }

    const sql = `${VEHICLE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY v.reg`;
    const rows = await db.prepare(sql).all(params);
    res.json(rows.map(serialiseVehicle));
  }),
);

vehiclesRouter.get(
  '/:id',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'vehicle id');
    const row = await db.prepare(`${VEHICLE_SELECT} WHERE v.id = ?`).get([id]);
    if (!row) throw notFound(`Vehicle ${id} not found`);

    const alertLimit = boundedInt(req.query.alertLimit, { min: 1, max: 100, fallback: 12, label: 'alertLimit' });
    const alerts = await db
      .prepare(
        `SELECT * FROM alerts WHERE vehicle_id = ?
          ORDER BY created_at DESC LIMIT ?`,
      )
      .all([id, alertLimit]);

    // Same camelCase shape as GET /api/alerts so the detail page can render the
    // vehicle summary and its alerts with one set of field names.
    const recentAlerts = alerts.map((a) =>
      serialiseAlert({
        ...a,
        reg: row.reg,
        driver: row.driver,
      }),
    );

    const counts = await db
      .prepare(
        `SELECT status, COUNT(*) AS n FROM alerts
          WHERE vehicle_id = ? GROUP BY status`,
      )
      .all([id]);

    res.json({
      ...serialiseVehicle(row),
      recentAlerts,
      alertCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  }),
);

vehiclesRouter.get(
  '/:id/history',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'vehicle id');
    const vehicle = await db.prepare('SELECT id, route_id FROM vehicles WHERE id = ?').get([id]);
    if (!vehicle) throw notFound(`Vehicle ${id} not found`);

    const hours = boundedInt(req.query.hours, { min: 1, max: 168, fallback: 6, label: 'hours' });
    const limit = boundedInt(req.query.limit, { min: 1, max: 5000, fallback: 1200, label: 'limit' });
    const since = new Date(Date.now() - hours * 3600000).toISOString();

    const rows = await db
      .prepare(
        `SELECT lat, lng, ts, speed_kph AS speed, heading, status, deviation_m, geofence_id
           FROM positions
          WHERE vehicle_id = ? AND ts >= ?
          ORDER BY ts DESC
          LIMIT ?`,
      )
      .all([id, since, limit]);

    // Contract order is oldest -> newest so the client can draw straight to the map.
    const points = rows.reverse().map((r) => ({
      lat: r.lat,
      lng: r.lng,
      ts: r.ts,
      speed: Math.round(r.speed * 10) / 10,
      heading: r.heading,
      status: r.status,
      deviationM: r.deviation_m,
      geofenceId: r.geofence_id,
    }));

    res.json(points);
  }),
);

vehiclesRouter.get(
  '/:id/route',
  handler(async (req, res) => {
    const id = idParam(req.params.id, 'vehicle id');
    const row = await db
      .prepare('SELECT route_id FROM vehicles WHERE id = ?')
      .get([id]);
    if (!row?.route_id) throw notFound(`Vehicle ${id} has no assigned route`);
    const route = await db
      .prepare(
        'SELECT id, name, corridor, via, distance_meters, avg_speed_kph, bounds, points FROM routes WHERE id = ?',
      )
      .get([row.route_id]);
    if (!route) throw notFound('Route not found');
    res.json({
      id: route.id,
      name: route.name,
      corridor: route.corridor,
      via: route.via,
      distanceMeters: route.distance_meters,
      avgSpeedKph: route.avg_speed_kph,
      bounds: JSON.parse(route.bounds),
      points: JSON.parse(route.points),
    });
  }),
);

export const geofencesRouter = Router();

geofencesRouter.get(
  '/',
  handler(async (_req, res) => {
    const rows = await db.prepare('SELECT * FROM geofences ORDER BY id').all();
    res.json(
      rows.map((g) => {
        const polygon = JSON.parse(g.polygon);
        return {
          id: g.id,
          name: g.name,
          type: g.type,
          severity: g.severity,
          description: g.description,
          polygon,
          center: centroid(polygon),
          bounds: boundsOf(polygon),
        };
      }),
    );
  }),
);