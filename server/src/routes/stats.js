import { Router } from 'express';
import { db } from '../db.js';
import { handler } from '../lib/validate.js';

export const statsRouter = Router();

/**
 * GET /api/stats -> { total, active, stopped, offline, alertsToday }
 *
 * `active` mirrors `moving`: the contract's three status values are
 * moving | stopped | offline.
 */
statsRouter.get(
  '/',
  handler(async (_req, res) => {
    const statuses = await db
      .prepare('SELECT status, COUNT(*) AS n FROM vehicles GROUP BY status')
      .all();
    const byStatus = Object.fromEntries(statuses.map((r) => [r.status, r.n]));
    const total = statuses.reduce((sum, r) => sum + r.n, 0);

    const devices = await db
      .prepare(`SELECT device_status, COUNT(*) AS n FROM vehicles GROUP BY device_status`)
      .all();
    const byDevice = Object.fromEntries(devices.map((r) => [r.device_status, r.n]));

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const countAlertsSince = db.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE created_at >= ?`);
    const alertsToday = (await countAlertsSince.get([startOfDay.toISOString()])).n;

    const countOpen = db.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE status <> 'resolved'`);
    const openAlerts = (await countOpen.get()).n;

    const openBySeverity = await db
      .prepare(
        `SELECT severity, COUNT(*) AS n FROM alerts
          WHERE status <> 'resolved' GROUP BY severity`,
      )
      .all();

    const countTampered = db.prepare(
      `SELECT COUNT(*) AS n FROM vehicles WHERE device_status = 'tampered'`,
    );
    const tampered = (await countTampered.get()).n;

    const sumValue = db.prepare('SELECT SUM(asset_value_zmw) AS v FROM vehicles');
    const fleetValue = (await sumValue.get()).v ?? 0;

    res.json({
      total,
      active: byStatus.moving ?? 0,
      stopped: byStatus.stopped ?? 0,
      offline: byStatus.offline ?? 0,
      alertsToday,
      byStatus,
      devices: byDevice,
      offlineDevices: byDevice.offline ?? 0,
      tamperedDevices: tampered,
      openAlerts,
      openBySeverity: Object.fromEntries(openBySeverity.map((r) => [r.severity, r.n])),
      fleetValueZmw: Math.round(fleetValue),
      asOf: new Date().toISOString(),
    });
  }),
);

/** Per-type counts for the dashboard donut and the report page. */
statsRouter.get(
  '/by-type',
  handler(async (_req, res) => {
    const open = await db
      .prepare(
        `SELECT type, COUNT(*) AS n FROM alerts
          WHERE status <> 'resolved' GROUP BY type ORDER BY n DESC`,
      )
      .all();
    const all = await db
      .prepare('SELECT type, COUNT(*) AS n FROM alerts GROUP BY type ORDER BY n DESC')
      .all();
    res.json({ open, all });
  }),
);