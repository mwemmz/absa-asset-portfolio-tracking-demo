/**
 * Simulation engine.
 *
 * Every TICK_MS (5s by default) each simulated vehicle either moves further along
 * its assigned road polyline, sits still, or goes dark. Random incidents are
 * raised so the app has a believable alert feed without anyone clicking buttons.
 *
 * There is no GPS hardware here and no real customer data. Everything is random.
 */
import { db, nowIso } from './db.js';
import {
  DEVIATION_THRESHOLD_M,
  OFFLINE_TIMEOUT_MS,
  POSITION_RETENTION_DAYS,
  PROLONGED_STOP_MS,
  TICK_MS,
} from './config.js';
import { advanceAlongPath, bearingDeg, offsetM, pointInPolygon } from './lib/geo.js';

/* ------------------------------------------------------------ statements */
const S = {
  allVehicles: db.prepare(
    'SELECT * FROM vehicles WHERE route_id IS NOT NULL ORDER BY id',
  ),
  allRoutes: db.prepare('SELECT id, name, corridor, points, avg_speed_kph FROM routes'),
  allGeofences: db.prepare('SELECT * FROM geofences ORDER BY id'),
  updateVehicle: db.prepare(
    `UPDATE vehicles SET status=@status, device_status=@device_status, route_pos=@route_pos,
       route_dir=@route_dir, lat=@lat, lng=@lng, speed_kph=@speed_kph, heading=@heading,
       deviation_m=@deviation_m, odometer_km=@odometer_km, uptime_seconds=@uptime_seconds,
       stopped_since=@stopped_since, offline_since=@offline_since, last_update=@last_update,
       last_event_at=@last_event_at
     WHERE id=@id`,
  ),
  insertPosition: db.prepare(
    `INSERT INTO positions (vehicle_id, lat, lng, speed_kph, heading, status, deviation_m, geofence_id, ts)
     VALUES (@vehicle_id, @lat, @lng, @speed_kph, @heading, @status, @deviation_m, @geofence_id, @ts)`,
  ),
  insertAlert: db.prepare(
    `INSERT INTO alerts (vehicle_id, type, severity, status, response_status, title, details,
       location_label, lat, lng, created_at, updated_at, verified_at, escalated_at,
       resolved_at, resolved_by, source)
     VALUES (@vehicle_id, @type, @severity, @status, @response_status, @title, @details,
       @location_label, @lat, @lng, @created_at, @updated_at, @verified_at, @escalated_at,
       @resolved_at, @resolved_by, @source)`,
  ),
  updateAlert: db.prepare(
    `UPDATE alerts SET status=@status, response_status=@response_status, updated_at=@updated_at,
       verified_at=COALESCE(@verified_at, verified_at),
       escalated_at=COALESCE(@escalated_at, escalated_at),
       resolved_at=COALESCE(@resolved_at, resolved_at),
       resolved_by=COALESCE(@resolved_by, resolved_by)
     WHERE id=@id`,
  ),
  insertEvent: db.prepare(
    `INSERT INTO alert_events (alert_id, vehicle_id, action, from_status, to_status,
       from_response, to_response, note, actor, actor_role, ts)
     VALUES (@alert_id, @vehicle_id, @action, @from_status, @to_status,
       @from_response, @to_response, @note, @actor, @actor_role, @ts)`,
  ),
  openAlertFor: db.prepare(
    `SELECT id, status FROM alerts
      WHERE vehicle_id=@vehicle_id AND type=@type AND status <> 'resolved'
      ORDER BY created_at DESC LIMIT 1`,
  ),
  openAlertsFor: db.prepare(
    `SELECT id, type, status, response_status FROM alerts
      WHERE vehicle_id=@vehicle_id AND status <> 'resolved'`,
  ),
  prunePositions: db.prepare(
    'DELETE FROM positions WHERE ts < @cutoff',
  ),
};

/* ---------------------------------------------------------------- helpers */
let rng = Math.random;
const between = (lo, hi) => lo + rng() * (hi - lo);
const chance = (p) => rng() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Seed the PRNG so a reset reproduces the same scenario. The sim is a
 * simulation - reproducible is better than unpredictable.
 */
function seedRng(seed = 20261002) {
  let a = seed >>> 0;
  rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
seedRng();

/* ----------------------------------------------------------------- state */
let routes = new Map();
let geofences = [];
/** id -> live simulation state */
let state = new Map();
let timer = null;
let tickCount = 0;
let lastPruneAt = 0;
const listeners = new Set();

export function onTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function raiseAlert(input) {
  const createdAt = nowIso();
  const info = await S.insertAlert.run({
    vehicle_id: input.vehicleId,
    type: input.type,
    severity: input.severity ?? 'medium',
    status: input.status ?? 'new',
    response_status: input.responseStatus ?? 'not_required',
    title: input.title,
    details: input.details ?? '',
    location_label: input.locationLabel ?? '',
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    created_at: createdAt,
    updated_at: createdAt,
    verified_at: input.status === 'verified' || input.status === 'escalated' || input.status === 'resolved'
      ? createdAt : null,
    escalated_at: input.status === 'escalated' || input.status === 'resolved' ? createdAt : null,
    resolved_at: input.status === 'resolved' ? createdAt : null,
    resolved_by: input.status === 'resolved' ? 'simulation' : null,
    source: input.source ?? 'simulation',
  });
  const alertId = Number(info.lastInsertRowid);
  await S.insertEvent.run({
    alert_id: alertId,
    vehicle_id: input.vehicleId,
    action: 'created',
    from_status: null,
    to_status: input.status ?? 'new',
    from_response: null,
    to_response: null,
    note: input.details ?? 'Alert raised automatically by the simulation engine.',
    actor: 'simulation',
    actor_role: 'system',
    ts: createdAt,
  });
  return alertId;
}

function addNote(alertId, vehicleId, action, fromStatus, toStatus, note) {
  return S.insertEvent.run({
    alert_id: alertId,
    vehicle_id: vehicleId,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    from_response: null,
    to_response: null,
    note,
    actor: 'simulation',
    actor_role: 'system',
    ts: nowIso(),
  });
}

/** Close every alert of `types` for this vehicle because the cause cleared. */
async function autoResolve(v, types, note) {
  for (const a of await S.openAlertsFor.all({ vehicle_id: v.id })) {
    if (!types.includes(a.type)) continue;
    await S.updateAlert.run({
      id: a.id,
      status: 'resolved',
      response_status: a.response_status === 'dispatched' || a.response_status === 'on_site' ? 'stood_down' : a.response_status,
      updated_at: nowIso(),
      verified_at: null,
      escalated_at: null,
      resolved_at: nowIso(),
      resolved_by: 'simulation',
    });
    await addNote(a.id, v.id, 'auto_resolved', a.status, 'resolved', note);
  }
}

async function hasOpen(v, type) {
  return !!(await S.openAlertFor.get({ vehicle_id: v.id, type }));
}

/* --------------------------------------------------------------- loading */
export async function load() {
  routes = new Map(
    (await S.allRoutes.all()).map((r) => [r.id, { ...r, points: JSON.parse(r.points) }]),
  );
  geofences = (await S.allGeofences.all()).map((g) => ({ ...g, polygon: JSON.parse(g.polygon) }));

  const rows = await S.allVehicles.all();
  const now = Date.now();
  state = new Map();

  rows.forEach((row, index) => {
    const route = routes.get(row.route_id);
    if (!route) return;
    const point = row.lat != null ? [row.lat, row.lng] : route.points[0];

    // A handful of vehicles are primed to fire an incident in the first few
    // minutes so a short run always shows a live alert feed.
    const soon = index < 10;
    state.set(row.id, {
      id: row.id,
      reg: row.reg,
      route,
      routePos: row.route_pos,
      routeDir: row.route_dir || 1,
      status: row.status,
      deviceStatus: row.device_status,
      speedKph: row.speed_kph,
      lat: row.lat ?? point[0],
      lng: row.lng ?? point[1],
      heading: row.heading,
      deviationM: row.deviation_m,
      deviationSide: index % 2 === 0 ? 1 : -1,
      deviationUntil: 0,
      odometerKm: row.odometer_km,
      uptimeSeconds: clamp(row.uptime_seconds ?? 0.9, 0.05, 0.999),
      // The seeded uptime doubles as this vehicle's long-run target.
      uptimeTarget: clamp(row.uptime_seconds ?? 0.9, 0.5, 0.995),
      stoppedSince: row.stopped_since ? new Date(row.stopped_since).getTime() : null,
      offlineSince: row.offline_since ? new Date(row.offline_since).getTime() : null,
      lastUpdate: row.last_update ? new Date(row.last_update).getTime() : now,
      commsLostSince: 0,
      pendingDisconnectAlert: 0,
      resumeAt: row.status === 'stopped' && row.stopped_since
        ? new Date(row.stopped_since).getTime() + between(5, 45) * 60000
        : 0,
      reconnectAt: row.status === 'offline' && row.offline_since
        ? new Date(row.offline_since).getTime() + between(2, 12) * 60000
        : 0,
      nextEventAt: now + (soon ? between(20, 400) : between(240, 2700)) * 1000,
      insideZones: new Set(
        geofences.filter((g) => pointInPolygon(point, g.polygon)).map((g) => g.id),
      ),
      maxSpeed: clamp(route.avg_speed_kph * between(0.95, 1.25), 45, 105),
    });
  });

  return state.size;
}

/* ------------------------------------------------------------------ tick */
function zoneAt(point) {
  return geofences.find((g) => pointInPolygon(point, g.polygon)) ?? null;
}

async function detectZoneChange(v, point) {
  for (const g of geofences) {
    const inside = pointInPolygon(point, g.polygon);
    const was = v.insideZones.has(g.id);
    if (inside && !was) {
      v.insideZones.add(g.id);
      const lowInterest = g.type === 'depot';
    await raiseAlert({
      vehicleId: v.id,
      type: 'geofence_breach',
      severity: g.severity,
      status: 'new',
      title: `Geofence breach: entered ${g.name}`,
      details: `${v.reg} entered ${g.name} (${g.type.replace('_', ' ')} zone). ${g.description}${
        lowInterest ? ' Depot movements are expected here.' : ''
      }`,
      locationLabel: g.name,
      lat: point[0],
      lng: point[1],
    });
  } else if (!inside && was) {
      v.insideZones.delete(g.id);
      await raiseAlert({
        vehicleId: v.id,
        type: 'geofence_breach',
        severity: 'low',
        status: 'new',
        title: `Geofence exit: left ${g.name}`,
        details: `${v.reg} left ${g.name}. Return to the approved corridor expected.`,
        locationLabel: g.name,
        lat: point[0],
        lng: point[1],
      });
    }
  }
}

async function moveVehicle(v, dtSec, now) {
  const points = v.route.points;

  // Lateral deviation grows while the incident is active, then the vehicle
  // filters back onto the corridor.
  if (v.deviationUntil > now) {
    v.deviationM = Math.min(2600, v.deviationM + 22);
  } else if (v.deviationM > 0) {
    v.deviationM = Math.max(0, v.deviationM - 26);
  }

  v.speedKph = clamp(v.speedKph + between(-6, 6), 8, v.maxSpeed);
  const metres = (v.speedKph * dtSec) / 3.6;

  const step = advanceAlongPath(points, v.routePos, v.routeDir, metres);
  if (step.finished) {
    // Reaching the end of the corridor is a normal turnaround, not an incident.
    v.routeDir = -v.routeDir;
    v.routePos = v.routeDir === 1 ? 0.5 : points.length - 1.5;
    const i = Math.floor(v.routePos);
    step.point = points[i];
    step.heading = bearingDeg(points[i], points[i + 1]);
    await autoResolve(v, ['prolonged_stop'], 'Vehicle resumed its journey after a scheduled turnaround.');
  } else {
    v.routePos = step.pos;
  }

  const routePoint = step.point;
  const heading = step.heading;
  const display =
    v.deviationM > 1
      ? offsetM(routePoint, heading + 90 * v.deviationSide, v.deviationM)
      : routePoint;

  v.heading = heading;
  v.lat = display[0];
  v.lng = display[1];
  v.odometerKm += metres / 1000;
  v.status = 'moving';
  // While the link is down the device sends nothing, so lastUpdate goes stale
  // and the dashboard can show how long the vehicle has been silent.
  if (v.commsLostSince === 0) v.lastUpdate = now;

  if (v.deviationM > DEVIATION_THRESHOLD_M && !(await hasOpen(v, 'route_deviation'))) {
    await raiseAlert({
      vehicleId: v.id,
      type: 'route_deviation',
      severity: 'medium',
      status: 'new',
      title: 'Route deviation',
      details: `${v.reg} is roughly ${Math.round(v.deviationM)} m off the approved corridor on ${v.route.corridor}.`,
      locationLabel: v.route.corridor,
      lat: v.lat,
      lng: v.lng,
    });
  } else if (v.deviationM <= DEVIATION_THRESHOLD_M / 2) {
    await autoResolve(v, ['route_deviation'], 'Vehicle returned to the approved corridor.');
  }

  await detectZoneChange(v, display);
}

/** Builds the position row for this tick; the tick batches them into one write. */
function positionRow(v, now) {
  const zone = zoneAt([v.lat, v.lng]);
  return {
    vehicle_id: v.id,
    lat: v.lat,
    lng: v.lng,
    speed_kph: v.status === 'moving' ? Math.round(v.speedKph) : 0,
    heading: v.heading,
    status: v.status,
    deviation_m: Math.round(v.deviationM),
    geofence_id: zone ? zone.id : null,
    ts: new Date(now).toISOString(),
  };
}

/**
 * Uptime is a bounded rolling measure - roughly the share of recent reporting
 * windows in which the device checked in - not a running total. It eases towards
 * a per-vehicle target and is dragged down while the link is down, so it can
 * never drift outside 0-100% however long the sim runs.
 */
function trackUptime(v, dtSec) {
  const rate = Math.min(1, dtSec / 86400);
  const reporting = v.deviceStatus === 'online' && v.commsLostSince === 0;
  const goal = reporting ? v.uptimeTarget : Math.max(0.1, v.uptimeTarget - 0.35);
  v.uptimeSeconds = clamp(v.uptimeSeconds + (goal - v.uptimeSeconds) * rate, 0.02, 0.999);
}

const INCIDENTS = [
  { type: 'prolonged_stop', weight: 0.3 },
  { type: 'route_deviation', weight: 0.26 },
  { type: 'device_disconnected', weight: 0.2 },
  { type: 'comms_lost', weight: 0.14 },
  { type: 'tamper', weight: 0.1 },
];

function rollIncident() {
  let r = rng();
  for (const i of INCIDENTS) {
    r -= i.weight;
    if (r <= 0) return i.type;
  }
  return INCIDENTS[0].type;
}

async function triggerIncident(v, type, now) {
  v.lastEventAt = now;
  switch (type) {
    case 'prolonged_stop': {
      if (v.status !== 'stopped') {
        v.status = 'stopped';
        v.stoppedSince = now;
        v.speedKph = 0;
        // The alert is raised immediately rather than after the threshold so a
        // short run still shows one; note explains that.
        if (!(await hasOpen(v, 'prolonged_stop'))) {
          await raiseAlert({
            vehicleId: v.id,
            type: 'prolonged_stop',
            severity: 'medium',
            status: 'new',
            title: 'Prolonged stop',
            details: `${v.reg} stationary outside any depot. Escalates automatically if it does not move within 10 minutes.`,
            locationLabel: v.route.corridor,
            lat: v.lat,
            lng: v.lng,
          });
        }
        v.resumeAt = now + between(3, 14) * 60000;
      }
      break;
    }
    case 'route_deviation': {
      if (v.deviationUntil <= now) v.deviationUntil = now + between(4, 12) * 60000;
      break;
    }
    case 'device_disconnected': {
      v.status = 'offline';
      v.deviceStatus = 'offline';
      v.offlineSince = now;
      v.speedKph = 0;
      v.reconnectAt = now + between(2, 14) * 60000;
      await autoResolve(v, ['comms_lost'], 'Device disconnection confirmed - replaced the earlier communication loss.');
      if (!(await hasOpen(v, 'device_disconnected'))) {
        await raiseAlert({
          vehicleId: v.id,
          type: 'device_disconnected',
          severity: 'high',
          status: 'new',
          title: 'Tracking device disconnected',
          details: `Telematics unit for ${v.reg} stopped reporting. Last known position on ${v.route.corridor}.`,
          locationLabel: v.route.corridor,
          lat: v.lat,
          lng: v.lng,
        });
      }
      break;
    }
    case 'comms_lost': {
      if (v.commsLostSince === 0 && v.status !== 'offline') {
        v.commsLostSince = now;
        if (!(await hasOpen(v, 'comms_lost'))) {
          await raiseAlert({
            vehicleId: v.id,
            type: 'comms_lost',
            severity: 'medium',
            status: 'new',
            title: 'Loss of communication',
            details: `No telemetry from ${v.reg} inside the expected reporting window. Possible network coverage gap.`,
            locationLabel: v.route.corridor,
            lat: v.lat,
            lng: v.lng,
          });
        }
      }
      break;
    }
    case 'tamper': {
      if (v.deviceStatus !== 'tampered') {
        v.deviceStatus = 'tampered';
        if (!(await hasOpen(v, 'tamper'))) {
          await raiseAlert({
            vehicleId: v.id,
            type: 'tamper',
            severity: 'critical',
            status: 'new',
            title: 'Tamper detected',
            details: `OBD harness disturbance reported by the telematics unit on ${v.reg}. Asset security risk - response recommended.`,
            locationLabel: v.route.corridor,
            lat: v.lat,
            lng: v.lng,
          });
        }
      }
      break;
    }
    default:
      break;
  }
}

const persistAll = db.transaction(async (vehicles, now) => {
  // One batched request per tick rather than one per vehicle: sequential
  // statements cost ~560 ms each against a remote libSQL server, which would put
  // a 5-second tick well over budget.
  await S.updateVehicle.batch(
    vehicles.map((v) => ({
      id: v.id,
      status: v.status,
      device_status: v.deviceStatus,
      route_pos: v.routePos,
      route_dir: v.routeDir,
      lat: v.lat,
      lng: v.lng,
      speed_kph: v.status === 'moving' ? Math.round(v.speedKph) : 0,
      heading: v.heading,
      deviation_m: Math.round(v.deviationM),
      odometer_km: Math.round(v.odometerKm * 100) / 100,
      uptime_seconds: Math.round(v.uptimeSeconds * 100000) / 100000,
      stopped_since: v.stoppedSince ? new Date(v.stoppedSince).toISOString() : null,
      offline_since: v.offlineSince ? new Date(v.offlineSince).toISOString() : null,
      // An offline device is not reporting, so its last_update stays stale rather
      // than tracking the tick. That is what makes "silent for N minutes" real.
      last_update:
        v.status === 'offline'
          ? v.lastUpdate
            ? new Date(v.lastUpdate).toISOString()
            : null
          : new Date(now).toISOString(),
      last_event_at: new Date(now).toISOString(),
    })),
  );
});

export async function tick() {
  const now = Date.now();
  const dtSec = TICK_MS / 1000;
  tickCount += 1;
  const changed = [];
  const positionRows = [];

  for (const v of state.values()) {
    const wasStatus = v.status;

    // --- offline vehicles -------------------------------------------------
    if (v.status === 'offline') {
      if (now >= v.reconnectAt) {
        v.status = chance(0.7) ? 'moving' : 'stopped';
        v.deviceStatus = 'online';
        v.offlineSince = null;
        v.commsLostSince = 0;
        v.resumeAt = v.status === 'stopped' ? now + between(2, 8) * 60000 : 0;
        v.speedKph = v.status === 'moving' ? between(35, v.maxSpeed) : 0;
        v.lastUpdate = now;
        await autoResolve(
          v,
          ['device_disconnected', 'comms_lost'],
          'Device is reporting again. Connection restored.',
        );
        if (v.deviceStatus === 'tampered') await autoResolve(v, ['tamper'], 'Unit reseated and tamper cleared.');
      }
    } else {
      // --- stopped vehicles ----------------------------------------------
      if (v.status === 'stopped') {
        if (now >= v.resumeAt) {
          v.status = 'moving';
          v.stoppedSince = null;
          v.speedKph = between(30, v.maxSpeed);
          v.lastUpdate = now;
          await autoResolve(v, ['prolonged_stop'], 'Vehicle is moving again.');
        } else {
          v.speedKph = 0;
          if (now - v.stoppedSince >= PROLONGED_STOP_MS && !(await hasOpen(v, 'prolonged_stop'))) {
            await raiseAlert({
              vehicleId: v.id,
              type: 'prolonged_stop',
              severity: 'high',
              status: 'escalated',
              responseStatus: 'pending',
              title: 'Prolonged stop',
              details: `${v.reg} has been stationary for more than 10 minutes outside any depot.`,
              locationLabel: v.route.corridor,
              lat: v.lat,
              lng: v.lng,
            });
          }
        }
      }

      // --- communication loss turning into a disconnection -----------------
      if (v.commsLostSince > 0 && now - v.commsLostSince >= OFFLINE_TIMEOUT_MS) {
        v.commsLostSince = 0;
        v.status = 'offline';
        v.deviceStatus = 'offline';
        v.offlineSince = now;
        v.speedKph = 0;
        v.reconnectAt = now + between(2, 14) * 60000;
        await raiseAlert({
          vehicleId: v.id,
          type: 'device_disconnected',
          severity: 'high',
          status: 'escalated',
          responseStatus: 'pending',
          title: 'Tracking device disconnected',
          details: `Communication loss on ${v.reg} persisted beyond the ${Math.round(OFFLINE_TIMEOUT_MS / 60000)} minute threshold. Treated as a confirmed disconnection.`,
          locationLabel: v.route.corridor,
          lat: v.lat,
          lng: v.lng,
        });
        await autoResolve(v, ['comms_lost'], 'Escalated to a confirmed device disconnection.');
      }

      // --- moving vehicles ------------------------------------------------
      if (v.status === 'moving') await moveVehicle(v, dtSec, now);

      trackUptime(v, dtSec);
    }

    // A silent device reports nothing, so no position row and a stale lastUpdate.
    if (v.status !== 'offline' && v.commsLostSince === 0) positionRows.push(positionRow(v, now));

    if (now >= v.nextEventAt && v.status !== 'offline') {
      await triggerIncident(v, rollIncident(), now);
      v.nextEventAt = now + between(8, 45) * 60000;
    }

    if (v.status !== wasStatus) changed.push({ id: v.id, reg: v.reg, status: v.status });
  }

  await S.insertPosition.batch(positionRows);
  await persistAll([...state.values()], now);

  if (now - lastPruneAt > 3600000) {
    lastPruneAt = now;
    await S.prunePositions.run({ cutoff: new Date(now - POSITION_RETENTION_DAYS * 86400000).toISOString() });
  }

  for (const fn of listeners) {
    try {
      fn({ tick: tickCount, at: new Date(now).toISOString(), changed });
    } catch (err) {
      console.error('[sim] listener failed:', err);
    }
  }

  return { tick: tickCount, vehicles: state.size, changed };
}

export async function start() {
  if (timer) return;
  await load();
  let consecutiveFailures = 0;
  let lastMessage = '';
  let inFlight = false;

  const schedule = () => {
    timer = setInterval(() => {
      // A remote write can outlive the interval, so never overlap two ticks.
      if (inFlight) return;
      inFlight = true;
      tick()
        .then(() => {
          consecutiveFailures = 0;
          lastMessage = '';
        })
        .catch((err) => {
          // Only log the first occurrence of a given failure, then keep quiet, so a
          // broken tick cannot bury the rest of the server output.
          consecutiveFailures += 1;
          if (err.message !== lastMessage) {
            lastMessage = err.message;
            console.error('[sim] tick failed:', err);
          } else if (consecutiveFailures === 25 || consecutiveFailures % 300 === 0) {
            console.error(`[sim] tick still failing after ${consecutiveFailures} ticks: ${err.message}`);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, TICK_MS);
    timer.unref?.();
  };

  schedule();
  console.log(`[sim] running every ${TICK_MS}ms across ${state.size} simulated vehicles`);
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function status() {
  return {
    running: !!timer,
    tickMs: TICK_MS,
    ticks: tickCount,
    vehicles: state.size,
    geofences: geofences.length,
  };
}

/** Seed the PRNG so a reset reproduces the same scenario. */
export function resetRng(seed = 20261002) {
  seedRng(seed);
}

export { pointInPolygon };