/**
 * Seed / reset script.
 *
 *   node src/seed.js            seed only if the database is empty
 *   node src/seed.js --force    wipe and reseed (the pre-demo reset)
 *
 * Everything written here is invented. No Absa customer data is used.
 */
import { readFileSync } from 'node:fs';
import { db, driver, nowIso } from './db.js';
import { DB_PATH, TURSO_URL } from './config.js';
import { GEOFENCES, USERS, buildVehicleRows } from './data/seed-data.js';
import { advanceAlongPath, bearingDeg, distanceToPolylineM, offsetM, pointInPolygon } from './lib/geo.js';

const force = process.argv.includes('--force');

/** Deterministic PRNG so a reset always produces the same demo. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261002);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const chance = (p) => rand() < p;

const ROUTES = JSON.parse(
  readFileSync(new URL('./data/routes.json', import.meta.url), 'utf8'),
);

const NOW = Date.now();
const DAY = 86400000;

async function count(table) {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
}

if ((await count('vehicles')) > 0 && !force) {
  console.log(`Database already seeded (${await count('vehicles')} vehicles).`);
  console.log('Run "npm run reset" to wipe and reseed.');
  process.exit(0);
}

/* ------------------------------------------------------------------ wipe */
await db.exec(`
  DELETE FROM alert_events;
  DELETE FROM alerts;
  DELETE FROM positions;
  DELETE FROM vehicles;
  DELETE FROM geofences;
  DELETE FROM routes;
  DELETE FROM users;
`);

// Restart AUTOINCREMENT from 1 so a reset reproduces the same ids as a fresh
// database. A remote libSQL server does not allow writing sqlite_sequence (it is
// not part of the writable schema), so this is best-effort: without it the
// database is still correct, the row ids just keep counting up.
await db
  .prepare(`DELETE FROM sqlite_sequence WHERE name IN (?,?,?,?,?)`)
  .run(['alert_events', 'alerts', 'positions', 'vehicles', 'geofences'])
  .catch((err) => console.warn(`[seed] sqlite_sequence not writable (${err.message}); ids continue.`));

/* ----------------------------------------------------------------- users */
const insertUser = db.prepare(
  'INSERT INTO users (email, password, name, role, created_at) VALUES (@email, @password, @name, @role, @created_at)',
);
for (const u of USERS) await insertUser.run({ ...u, created_at: nowIso() });

/* ---------------------------------------------------------------- routes */
const insertRoute = db.prepare(
  `INSERT INTO routes (id, name, corridor, via, distance_meters, avg_speed_kph, bounds, points)
   VALUES (@id, @name, @corridor, @via, @distance_meters, @avg_speed_kph, @bounds, @points)`,
);
const routeMap = new Map();
for (const r of ROUTES.routes) {
  await insertRoute.run({
    id: r.id,
    name: r.name,
    corridor: r.corridor,
    via: r.via.join(', '),
    distance_meters: r.distanceMeters,
    avg_speed_kph: r.averageSpeedKph,
    bounds: JSON.stringify(r.bounds),
    points: JSON.stringify(r.points),
  });
  routeMap.set(r.id, { ...r, points: r.points });
}

/* ------------------------------------------------------------- geofences */
const insertGeofence = db.prepare(
  `INSERT INTO geofences (id, name, type, severity, description, polygon, created_at)
   VALUES (@id, @name, @type, @severity, @description, @polygon, @created_at)`,
);
for (const g of GEOFENCES) {
  await insertGeofence.run({
    id: g.id,
    name: g.name,
    type: g.type,
    severity: g.severity,
    description: g.description,
    polygon: JSON.stringify(g.polygon),
    created_at: nowIso(),
  });
}
const geofences = GEOFENCES.map((g) => ({ ...g }));

/* -------------------------------------------------------------- vehicles */
const insertVehicle = db.prepare(
  `INSERT INTO vehicles (
     reg, make_model, category, driver, driver_phone, customer, agreement_ref, asset_value_zmw,
     home_depot, status, device_status, route_id, route_pos, route_dir, lat, lng, speed_kph,
     heading, deviation_m, odometer_km, uptime_seconds, stopped_since, offline_since,
     last_update, last_event_at, created_at
   ) VALUES (
     @reg, @make_model, @category, @driver, @driver_phone, @customer, @agreement_ref, @asset_value_zmw,
     @home_depot, 'stopped', 'online', @route_id, 0, 1, NULL, NULL, 0,
     0, 0, @odometer_km, @uptime_seconds, NULL, NULL,
     NULL, NULL, @created_at
   )`,
);

const vehicleRows = buildVehicleRows();

/** Walk `steps` ticks of history backwards from `endPos`, flipping at route ends. */
function backfill(points, endPos, dir, stepMeters, steps) {
  const out = [];
  let pos = endPos;
  let d = -dir;
  for (let i = 0; i < steps; i += 1) {
    const res = advanceAlongPath(points, pos, d, stepMeters);
    pos = res.pos;
    if (res.finished) {
      pos = res.pos;
      d = -d;
    }
    const clamped = Math.max(0, Math.min(points.length - 1.0001, pos));
    const i0 = Math.floor(clamped);
    const frac = clamped - i0;
    const a = points[i0];
    const b = points[Math.min(i0 + 1, points.length - 1)];
    out.push({
      point: [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac],
      heading: bearingDeg(a, b),
    });
  }
  return out.reverse();
}

const HISTORY_STEP_MS = 5 * 60 * 1000;
const HISTORY_STEPS = 144; // 12 hours of 5-minute points

const updateVehicle = db.prepare(
  `UPDATE vehicles SET
     status = @status, device_status = @device_status, route_pos = @route_pos, route_dir = @route_dir,
     lat = @lat, lng = @lng, speed_kph = @speed_kph, heading = @heading, deviation_m = @deviation_m,
     odometer_km = @odometer_km, uptime_seconds = @uptime_seconds,
     stopped_since = @stopped_since, offline_since = @offline_since, last_update = @last_update,
     last_event_at = @last_event_at
   WHERE id = @id`,
);

const insertPosition = db.prepare(
  `INSERT INTO positions (vehicle_id, lat, lng, speed_kph, heading, status, deviation_m, geofence_id, ts)
   VALUES (@vehicle_id, @lat, @lng, @speed_kph, @heading, @status, @deviation_m, @geofence_id, @ts)`,
);

/* Desired opening mix so the dashboard looks alive immediately. */
const OPENING_MIX = {
  moving: 17,
  stopped: 5,
  offline: 3,
};

const vehicles = [];
const insertAll = db.transaction(async () => {
  let movingLeft = OPENING_MIX.moving;
  let stoppedLeft = OPENING_MIX.stopped;
  let offlineLeft = OPENING_MIX.offline;

  // Vehicles are inserted one at a time because each insert's id is needed to
  // write its history and its current state.
  for (const [idx, row] of vehicleRows.entries()) {
    const route = routeMap.get(row.route_id);
    const info = await insertVehicle.run({
      ...row,
      odometer_km: Math.round(between(18000, 340000)),
      uptime_seconds: Math.round(between(0.62, 0.985) * 100) / 100,
      created_at: nowIso(),
    });
    const id = info.lastInsertRowid;

    let status = 'moving';
    if (offlineLeft > 0 && chance(0.35)) {
      status = 'offline';
      offlineLeft -= 1;
    } else if (stoppedLeft > 0 && chance(0.5)) {
      status = 'stopped';
      stoppedLeft -= 1;
    } else if (movingLeft > 0) {
      status = 'moving';
      movingLeft -= 1;
    }

    const routePos = between(0.05, route.points.length - 1.05);
    const routeDir = chance(0.7) ? 1 : -1;
    const baseSpeed = Math.max(24, Math.min(96, route.averageSpeedKph * between(0.75, 1.05)));

    // current point on the route
    const i0 = Math.floor(routePos);
    const frac = routePos - i0;
    const a = route.points[i0];
    const b = route.points[Math.min(i0 + 1, route.points.length - 1)];
    const here = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
    const heading = bearingDeg(a, b);

    // Two vehicles open with a deviation and a tampered device for a lively map.
    const deviating = idx === 3 || idx === 17;
    const tampered = idx === 6;
    const point = deviating ? offsetM(here, heading + 90, between(1100, 1800)) : here;
    const deviation = deviating ? distanceToPolylineM(point, route.points) : 0;
    const deviceStatus = tampered ? 'tampered' : status === 'offline' ? 'offline' : 'online';

    const speed = status === 'moving' ? Math.round(between(38, 88)) : 0;
    const stoppedAgo = status === 'stopped' ? between(4, 42) * 60000 : null;
    const offlineAgo = status === 'offline' ? between(2, 55) * 60000 : null;

    await updateVehicle.run({
      id,
      status,
      device_status: deviceStatus,
      route_pos: routePos,
      route_dir: routeDir,
      lat: point[0],
      lng: point[1],
      speed_kph: speed,
      heading,
      deviation_m: Math.round(deviation),
      odometer_km: Math.round(between(18000, 340000)),
      uptime_seconds: Math.round(between(0.62, 0.985) * 100) / 100,
      stopped_since: stoppedAgo ? new Date(NOW - stoppedAgo).toISOString() : null,
      offline_since: offlineAgo ? new Date(NOW - offlineAgo).toISOString() : null,
      last_update: status === 'offline' && offlineAgo
        ? new Date(NOW - offlineAgo).toISOString()
        : new Date(NOW - between(1, 5) * 1000).toISOString(),
      last_event_at: new Date(NOW - between(2, 90) * 60000).toISOString(),
    });

    // history. Batched: a sequential insert costs ~560 ms over HTTP, so 3,600
    // of them one at a time would take half an hour.
    const stepMeters = baseSpeed * (HISTORY_STEP_MS / 3600000);
    const trail = backfill(route.points, routePos, routeDir, stepMeters, HISTORY_STEPS);
    const historyRows = [];
    for (const [h, p] of trail.entries()) {
      const ts = new Date(NOW - (HISTORY_STEPS - h) * HISTORY_STEP_MS).toISOString();
      const moving = h < trail.length - 1 && chance(0.93);
      const gf = geofences.find((g) => pointInPolygon(p.point, g.polygon));
      historyRows.push({
        vehicle_id: id,
        lat: p.point[0],
        lng: p.point[1],
        speed_kph: moving ? Math.round(between(35, 85)) : 0,
        heading: p.heading,
        status: moving ? 'moving' : 'stopped',
        deviation_m: 0,
        geofence_id: gf ? gf.id : null,
        ts,
      });
    }
    await insertPosition.batch(historyRows);

    vehicles.push({
      id,
      reg: row.reg,
      route_id: row.route_id,
      route,
      routePos,
      routeDir,
      status,
      deviceStatus,
      point,
      deviation,
      speed,
      stoppedAgo,
      offlineAgo,
      lastEventAt: NOW - between(2, 90) * 60000,
      nextEventAt: NOW + between(60, 1500) * 1000,
      deviationUntil: deviating ? NOW + between(3, 9) * 60000 : 0,
      resumeAt: 0,
      reconnectAt: 0,
      inside: new Set(geofences.filter((g) => pointInPolygon(point, g.polygon)).map((g) => g.id)),
    });
  }
});
await insertAll();

/* ---------------------------------------------------------------- alerts */
const insertAlert = db.prepare(
  `INSERT INTO alerts (
     vehicle_id, type, severity, status, response_status, title, details, location_label,
     lat, lng, created_at, updated_at, verified_at, escalated_at, resolved_at, resolved_by, source
   ) VALUES (
     @vehicle_id, @type, @severity, @status, @response_status, @title, @details, @location_label,
     @lat, @lng, @created_at, @updated_at, @verified_at, @escalated_at, @resolved_at, @resolved_by, @source
   )`,
);
const insertEvent = db.prepare(
  `INSERT INTO alert_events (
     alert_id, vehicle_id, action, from_status, to_status, from_response, to_response,
     note, actor, actor_role, ts
   ) VALUES (
     @alert_id, @vehicle_id, @action, @from_status, @to_status, @from_response, @to_response,
     @note, @actor, @actor_role, @ts
   )`,
);

const ALERT_TYPES = [
  { type: 'route_deviation', severity: 'medium', title: 'Route deviation', chance: 0.2,
    details: 'Vehicle left the approved corridor by more than 800 m.' },
  { type: 'geofence_breach', severity: 'high', title: 'Geofence entry', chance: 0.18,
    details: 'Vehicle entered a monitored zone.' },
  { type: 'prolonged_stop', severity: 'medium', title: 'Prolonged stop', chance: 0.26,
    details: 'Vehicle stationary for longer than the 10 minute threshold.' },
  { type: 'device_disconnected', severity: 'high', title: 'Tracking device disconnected', chance: 0.14,
    details: 'Telematics unit stopped reporting.' },
  { type: 'tamper', severity: 'critical', title: 'Tamper detected', chance: 0.08,
    details: 'OBD harness disturbed or device removed.' },
  { type: 'comms_lost', severity: 'medium', title: 'Loss of communication', chance: 0.14,
    details: 'No telemetry received within the expected reporting window.' },
];

const weightedType = () => {
  let r = rand();
  for (const t of ALERT_TYPES) {
    r -= t.chance;
    if (r <= 0) return t;
  }
  return ALERT_TYPES[0];
};

const VERIFY_NOTES = [
  'Control room reviewed the trip log and the last known position. Alert is genuine.',
  'Called the driver, confirmed the stop was an unscheduled brake check.',
  'Position cross-checked against the geofence log. Confirmed.',
  'Device diagnostics pulled. Fault is real, not a coverage gap.',
];
const ESCALATE_NOTES = [
  'Escalated to the Asset Recovery desk. Asset at risk of repossession.',
  'Referred to the field team for physical inspection.',
  'Escalated - customer contact has been asked to explain the deviation.',
];
const RESOLVE_NOTES = [
  'Driver returned to the approved route. Device re-seated and reporting normally.',
  'Fault cleared after a firmware reset. Telemetry restored.',
  'Inspection completed, device reseated. Case closed.',
  'Customer attended the depot, unit verified. Alert closed.',
];
const SYSTEM_ACTORS = ['simulation', 'simulation', 'system'];

const HISTORY_DAYS = 62;
const startTs = NOW - HISTORY_DAYS * DAY;
const perDay = 5;

const seedAlerts = db.transaction(async () => {
  // An alert's own id keys its audit events, so the inserts cannot be merged into
  // one flat batch. Instead the whole run is buffered and flushed once per day:
  // same rows, same ids, a few hundred requests instead of ~1,900.
  const alertRows = [];
  const eventRows = [];
  const pending = [];

  for (let day = HISTORY_DAYS; day >= 0; day -= 1) {
    const dayStart = startTs + (HISTORY_DAYS - day) * DAY;
    const count = perDay + Math.floor(between(-1, 3));
    for (let k = 0; k < count; k += 1) {
      const vehicle = pick(vehicles);
      const spec = weightedType();
      const createdAt = new Date(dayStart + between(0, DAY) * 0.98);
      if (createdAt.getTime() > NOW) continue;

      // Older alerts are overwhelmingly closed; recent ones are still open.
      const ageDays = (NOW - createdAt.getTime()) / DAY;
      let status;
      const roll = rand();
      if (ageDays > 12) status = roll < 0.94 ? 'resolved' : roll < 0.98 ? 'escalated' : 'verified';
      else if (ageDays > 4) status = roll < 0.78 ? 'resolved' : roll < 0.92 ? 'escalated' : 'verified';
      else status = roll < 0.34 ? 'resolved' : roll < 0.52 ? 'escalated' : roll < 0.72 ? 'verified' : 'new';

      const verifiedAt = ['verified', 'escalated', 'resolved'].includes(status)
        ? new Date(createdAt.getTime() + between(3, 40) * 60000)
        : null;
      const escalatedAt = ['escalated', 'resolved'].includes(status)
        ? new Date(createdAt.getTime() + between(45, 400) * 60000)
        : null;
      const resolvedAt = status === 'resolved'
        ? new Date(createdAt.getTime() + between(1.5, 26) * 3600000)
        : null;

      const responseStatus =
        status === 'resolved'
          ? pick(['stood_down', 'stood_down', 'closed', 'on_site'])
          : status === 'escalated'
            ? pick(['dispatched', 'on_site'])
            : status === 'verified'
              ? pick(['pending', 'dispatched'])
              : 'not_required';

      const i0 = Math.floor(Math.min(vehicle.routePos, vehicle.route.points.length - 1));
      const pt = vehicle.route.points[i0] ?? [0, 0];
      const gf = chance(0.35) ? pick(geofences) : null;
      const locationLabel = gf ? gf.name : `${vehicle.route.corridor}`;

      alertRows.push({
        vehicle_id: vehicle.id,
        type: spec.type,
        severity: spec.severity,
        status,
        response_status: responseStatus,
        title: spec.title,
        details: spec.details,
        location_label: locationLabel,
        lat: pt[0],
        lng: pt[1],
        created_at: createdAt.toISOString(),
        updated_at: (resolvedAt ?? escalatedAt ?? verifiedAt ?? createdAt).toISOString(),
        verified_at: verifiedAt?.toISOString() ?? null,
        escalated_at: escalatedAt?.toISOString() ?? null,
        resolved_at: resolvedAt?.toISOString() ?? null,
        resolved_by: resolvedAt ? pick(['Demo Administrator', 'Control Room Monitor']) : null,
        source: 'simulation',
      });

      // The audit trail for this alert, minus its id, which the flush fills in.
      const actor = pick(SYSTEM_ACTORS);
      const trail = [
        {
          action: 'created',
          from_status: null,
          to_status: 'new',
          from_response: null,
          to_response: null,
          note: 'Alert raised automatically by the simulation engine.',
          actor,
          actor_role: 'system',
          ts: createdAt.toISOString(),
        },
      ];
      if (verifiedAt) {
        trail.push({
          action: 'verified',
          from_status: 'new',
          to_status: 'verified',
          from_response: null,
          to_response: null,
          note: pick(VERIFY_NOTES),
          actor: 'Control Room Monitor',
          actor_role: 'monitor',
          ts: verifiedAt.toISOString(),
        });
        if (responseStatus === 'dispatched' || responseStatus === 'on_site' || responseStatus === 'stood_down') {
          trail.push({
            action: 'response_dispatched',
            from_status: null,
            to_status: null,
            from_response: 'pending',
            to_response: 'dispatched',
            note: 'Field team dispatched to the last known position.',
            actor: 'Control Room Monitor',
            actor_role: 'monitor',
            ts: new Date(verifiedAt.getTime() + between(5, 30) * 60000).toISOString(),
          });
        }
      }
      if (escalatedAt) {
        trail.push({
          action: 'escalated',
          from_status: verifiedAt ? 'verified' : 'new',
          to_status: 'escalated',
          from_response: null,
          to_response: null,
          note: pick(ESCALATE_NOTES),
          actor: 'Demo Administrator',
          actor_role: 'admin',
          ts: escalatedAt.toISOString(),
        });
      }
      if (resolvedAt) {
        trail.push({
          action: 'resolved',
          from_status: escalatedAt ? 'escalated' : verifiedAt ? 'verified' : 'new',
          to_status: 'resolved',
          from_response: null,
          to_response: null,
          note: pick(RESOLVE_NOTES),
          actor: 'Demo Administrator',
          actor_role: 'admin',
          ts: resolvedAt.toISOString(),
        });
      }
      pending.push({ vehicleId: vehicle.id, trail });
    }

    // Flush this day's alerts, then attach the returned ids to their trails.
    const batch = alertRows.splice(0);
    const inserted = await insertAlert.batch(batch);
    const toFlush = pending.splice(0, batch.length);
    for (const [i, result] of inserted.entries()) {
      const alertId = result.lastInsertRowid;
      const { vehicleId, trail } = toFlush[i];
      for (const e of trail) eventRows.push({ alert_id: alertId, vehicle_id: vehicleId, ...e });
    }
    if (eventRows.length) {
      await insertEvent.batch(eventRows.splice(0));
    }
  }
});
await seedAlerts();

/* ------------------------------------------------------------ open alerts */
const insertOpenAlert = db.prepare(
  `INSERT INTO alerts (
     vehicle_id, type, severity, status, response_status, title, details, location_label,
     lat, lng, created_at, updated_at, verified_at, escalated_at, resolved_at, resolved_by, source
  ) VALUES (
     @vehicle_id, @type, @severity, @status, @response_status, @title, @details, @location_label,
     @lat, @lng, @created_at, @updated_at, NULL, NULL, NULL, NULL, 'simulation'
  )`,
);

async function raiseOpen({ vehicle, type, severity, status, response_status, title, details, location_label, minutesAgo }) {
  const createdAt = new Date(NOW - minutesAgo * 60000);
  const i0 = Math.floor(Math.min(vehicle.routePos, vehicle.route.points.length - 1));
  const pt = vehicle.route.points[i0] ?? [0, 0];
  const info = await insertOpenAlert.run({
    vehicle_id: vehicle.id,
    type,
    severity,
    status,
    response_status: response_status ?? 'not_required',
    title,
    details,
    location_label: location_label ?? vehicle.route.corridor,
    lat: pt[0],
    lng: pt[1],
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
  });
const alertId = info.lastInsertRowid;
    await insertEvent.run({
    alert_id: alertId,
    vehicle_id: vehicle.id,
    action: 'created',
    from_status: null,
    to_status: 'new',
    from_response: null,
    to_response: null,
    note: 'Alert raised automatically by the simulation engine.',
    actor: 'simulation',
    actor_role: 'system',
    ts: createdAt.toISOString(),
  });
  if (status !== 'new') {
    await insertEvent.run({
      alert_id: alertId,
      vehicle_id: vehicle.id,
      action: status,
      from_status: 'new',
      to_status: status,
      from_response: null,
      to_response: null,
      note: pick(VERIFY_NOTES),
      actor: 'Control Room Monitor',
      actor_role: 'monitor',
      ts: new Date(createdAt.getTime() + 6 * 60000).toISOString(),
    });
  }
  return alertId;
}

const offlineVehicle = vehicles.find((v) => v.status === 'offline');
const deviatingVehicle = vehicles.find((v) => v.deviation > 500);
const stoppedVehicle = vehicles.find((v) => v.status === 'stopped');

if (offlineVehicle) {
  await raiseOpen({
    vehicle: offlineVehicle,
    type: 'device_disconnected',
    severity: 'high',
    status: 'verified',
    response_status: 'dispatched',
    title: 'Tracking device disconnected',
    details: `Telematics unit for ${offlineVehicle.reg} stopped reporting. Last position on ${offlineVehicle.route.corridor}.`,
    minutesAgo: 38,
  });
}
if (deviatingVehicle) {
  await raiseOpen({
    vehicle: deviatingVehicle,
    type: 'route_deviation',
    severity: 'medium',
    status: 'new',
    title: 'Route deviation',
    details: 'Vehicle is travelling off the approved corridor. Awaiting control room verification.',
    minutesAgo: 4,
  });
}
if (stoppedVehicle) {
  await raiseOpen({
    vehicle: stoppedVehicle,
    type: 'prolonged_stop',
    severity: 'medium',
    status: 'escalated',
    response_status: 'on_site',
    title: 'Prolonged stop',
    details: 'Vehicle stationary beyond the 10 minute threshold outside any depot.',
    minutesAgo: 52,
  });
}
await raiseOpen({
  vehicle: vehicles[5],
  type: 'tamper',
  severity: 'critical',
  status: 'new',
  title: 'Tamper detected',
  details: 'OBD harness disturbance detected by the telematics unit.',
  minutesAgo: 12,
});

/* ----------------------------------------------------------------- done */
const summary = {
  db: TURSO_URL || DB_PATH,
  driver,
  users: USERS.length,
  routes: routeMap.size,
  geofences: geofences.length,
  vehicles: await count('vehicles'),
  positions: await count('positions'),
  alerts: await count('alerts'),
  alertEvents: await count('alert_events'),
};

console.log('Seed complete:');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log('\nLogin with admin@absa-demo / demo1234  or  monitor@absa-demo / demo1234');