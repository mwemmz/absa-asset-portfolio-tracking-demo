import { Router } from 'express';
import { db } from '../db.js';
import { handler, monthParam } from '../lib/validate.js';
import { ALERT_TYPES, uptimePercentage } from '../lib/serialize.js';

export const reportsRouter = Router();

/**
 * Africa/Lusaka is UTC+2 all year (no DST), so month boundaries can be derived
 * without a timezone library. Day counts still come from UTC arithmetic on the
 * calendar date itself, which is what we want.
 */
const LUSAKA_OFFSET_MINUTES = 120;
const MS_MINUTE = 60000;

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) - LUSAKA_OFFSET_MINUTES * MS_MINUTE;
  const end = Date.UTC(y, m, 1) - LUSAKA_OFFSET_MINUTES * MS_MINUTE;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function labelFor(month) {
  const [y, m] = month.split('-').map(Number);
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1)));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

function aggregate(month) {
  const { start, end } = monthBounds(month);
  const totalDays = daysInMonth(month);

  const created = db
    .prepare(
      `SELECT a.*, v.reg AS reg, v.driver AS driver, v.make_model AS make_model,
              v.route_id AS route_id, v.agreement_ref AS agreement_ref,
              v.asset_value_zmw AS asset_value_zmw
         FROM alerts a JOIN vehicles v ON v.id = a.vehicle_id
        WHERE a.created_at >= ? AND a.created_at < ?`,
    )
    .all(start, end);

  const byType = ALERT_TYPES.map((type) => {
    const rows = created.filter((a) => a.type === type);
    const resolved = rows.filter((a) => a.status === 'resolved');
    return {
      type,
      count: rows.length,
      resolved: resolved.length,
      open: rows.length - resolved.length,
      escalated: rows.filter((a) => a.severity === 'critical' || a.status === 'escalated').length,
      pct: created.length ? round1((rows.length / created.length) * 100) : 0,
    };
  }).sort((a, b) => b.count - a.count);

  const bySeverity = ['low', 'medium', 'high', 'critical'].map((severity) => ({
    severity,
    count: created.filter((a) => a.severity === severity).length,
  }));

  const byStatus = ['new', 'verified', 'escalated', 'resolved'].map((status) => ({
    status,
    count: created.filter((a) => a.status === status).length,
  }));

  const resolutionHours = created
    .filter((a) => a.status === 'resolved' && a.resolved_at)
    .map((a) => (new Date(a.resolved_at) - new Date(a.created_at)) / 3600000);

  const verifyMinutes = created
    .filter((a) => a.verified_at)
    .map((a) => (new Date(a.verified_at) - new Date(a.created_at)) / MS_MINUTE);

  const resolvedCount = resolutionHours.length;
  const within24h = resolutionHours.filter((h) => h <= 24).length;
  const within4h = resolutionHours.filter((h) => h <= 4).length;

  // Daily trend, bucketed by the Africa/Lusaka calendar date.
  const trend = [];
  const todayUtc = new Date();
  const isCurrentMonth = month === todayUtc.toISOString().slice(0, 7);
  const lastDay = isCurrentMonth ? Number(todayUtc.toISOString().slice(8, 10)) : totalDays;
  const trendByDay = new Map();
  for (const a of created) {
    const local = new Date(new Date(a.created_at).getTime() + LUSAKA_OFFSET_MINUTES * MS_MINUTE);
    const day = local.getUTCDate();
    trendByDay.set(day, (trendByDay.get(day) ?? 0) + 1);
  }
  for (let day = 1; day <= lastDay; day += 1) trend.push({ day, count: trendByDay.get(day) ?? 0 });

  const vehicleIds = [...new Set(created.map((a) => a.vehicle_id))];
  const vehicles = vehicleIds
    .map((id) => {
      const v = db
        .prepare(
          `SELECT v.*, r.corridor AS route_corridor FROM vehicles v
             LEFT JOIN routes r ON r.id = v.route_id WHERE v.id = ?`,
        )
        .get(id);
      if (!v) return null;
      const mine = created.filter((a) => a.vehicle_id === id);
      const resolved = mine.filter((a) => a.status === 'resolved');
      const mineHours = resolved.map((a) => (new Date(a.resolved_at) - new Date(a.created_at)) / 3600000);
      return {
        id: v.id,
        reg: v.reg,
        driver: v.driver,
        makeModel: v.make_model,
        category: v.category,
        customer: v.customer,
        agreementRef: v.agreement_ref,
        assetValueZmw: v.asset_value_zmw,
        routeCorridor: v.route_corridor,
        status: v.status,
        deviceStatus: v.device_status,
        uptimePct: uptimePercentage(v),
        odometerKm: Math.round(v.odometer_km ?? 0),
        alerts: mine.length,
        resolved: resolved.length,
        open: mine.length - resolved.length,
        escalated: mine.filter((a) => a.status === 'escalated').length,
        avgResolutionHours: mineHours.length ? round1(mineHours.reduce((s, h) => s + h, 0) / mineHours.length) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.alerts - a.alerts || b.uptimePct - a.uptimePct);

  const fleet = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(asset_value_zmw), 0) AS value,
              COALESCE(AVG(MIN(MAX(uptime_seconds, 0), 1)), 0) AS uptime
         FROM vehicles`,
    )
    .get();

  const openAtEnd = created.filter((a) => a.status !== 'resolved').length;

  return {
    month,
    label: labelFor(month),
    range: { start, end },
    daysInMonth: totalDays,
    daysElapsed: lastDay,
    isPartial: isCurrentMonth,
    summary: {
      totalAlerts: created.length,
      resolved: byStatus.find((s) => s.status === 'resolved').count,
      open: openAtEnd,
      escalated: byStatus.find((s) => s.status === 'escalated').count,
      resolutionRatePct: created.length
        ? round1((byStatus.find((s) => s.status === 'resolved').count / created.length) * 100)
        : 0,
      alertsPerDay: lastDay ? round1(created.length / lastDay) : 0,
    },
    performance: {
      avgResolutionHours: round1(
        resolutionHours.length ? resolutionHours.reduce((s, h) => s + h, 0) / resolutionHours.length : null,
      ),
      medianResolutionHours: round1(median(resolutionHours)),
      avgTimeToVerifyMinutes: round1(
        verifyMinutes.length ? verifyMinutes.reduce((s, m) => s + m, 0) / verifyMinutes.length : null,
      ),
      resolvedWithin4hPct: resolvedCount ? round1((within4h / resolvedCount) * 100) : null,
      resolvedWithin24hPct: resolvedCount ? round1((within24h / resolvedCount) * 100) : null,
      sampleSize: resolvedCount,
    },
    byType,
    bySeverity,
    byStatus,
    trend,
    vehicles,
    topVehicles: vehicles.slice(0, 5),
    fleet: {
      vehicles: fleet.n,
      assetValueZmw: Math.round(fleet.value),
      avgUptimePct: round1((fleet.uptime ?? 0) * 100),
    },
  };
}

reportsRouter.get(
  '/monthly',
  handler((req, res) => {
    const month = monthParam(req.query.month, new Date().toISOString().slice(0, 7));
    const current = aggregate(month);
    const previous = aggregate(shiftMonth(month, -1));

    const delta = (a, b) => (b === 0 ? (a === 0 ? 0 : null) : round1(((a - b) / b) * 100));

    res.json({
      ...current,
      comparison: {
        month: previous.month,
        label: previous.label,
        totalAlerts: previous.summary.totalAlerts,
        resolved: previous.summary.resolved,
        alertsChangePct: delta(current.summary.totalAlerts, previous.summary.totalAlerts),
        resolutionRateChangePct: delta(current.summary.resolutionRatePct, previous.summary.resolutionRatePct),
        avgResolutionHours: previous.performance.avgResolutionHours,
        avgResolutionChangePct: delta(
          current.performance.avgResolutionHours ?? 0,
          previous.performance.avgResolutionHours ?? 0,
        ),
      },
    });
  }),
);

/** Months that actually contain data, for the report page's month picker. */
reportsRouter.get(
  '/months',
  handler((_req, res) => {
    const rows = db
      .prepare(
        `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n
           FROM alerts GROUP BY month ORDER BY month DESC`,
      )
      .all();
    res.json(rows);
  }),
);