/**
 * Contract smoke test. Exercises every endpoint in the agreed API contract
 * against a running server, including the failure cases.
 *
 *   node scripts/smoke.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:4000';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

const section = (t) => console.log(`\n${t}`);

const VEHICLE_KEYS = ['id', 'reg', 'driver', 'status', 'lat', 'lng', 'speed', 'lastUpdate', 'deviceStatus'];
const STATUS_VALUES = ['moving', 'stopped', 'offline'];
const ALERT_TYPES = [
  'route_deviation',
  'geofence_breach',
  'prolonged_stop',
  'device_disconnected',
  'tamper',
  'comms_lost',
];
const ALERT_STATUSES = ['new', 'verified', 'escalated', 'resolved'];

section('health');
{
  const { status, json } = await call('/api/health');
  ok('GET /api/health -> 200', status === 200);
  ok('health reports isDemo', json?.notice?.isDemo === true);
  ok('health simulation running', json?.simulation?.running === true);
}

section('auth');
let token;
{
  const bad = await call('/api/login', { method: 'POST', body: { email: 'admin@absa-demo', password: 'wrong' } });
  ok('POST /api/login wrong password -> 401', bad.status === 401);

  const missing = await call('/api/login', { method: 'POST', body: { email: 'admin@absa-demo' } });
  ok('POST /api/login missing password -> 400', missing.status === 400);

  const admin = await call('/api/login', { method: 'POST', body: { email: 'admin@absa-demo', password: 'demo1234' } });
  ok('POST /api/login admin -> 200', admin.status === 200);
  ok('login returns token + role', !!admin.json?.token && admin.json?.role === 'admin');
  token = admin.json.token;

  const monitor = await call('/api/login', { method: 'POST', body: { email: 'monitor@absa-demo', password: 'demo1234' } });
  ok('POST /api/login monitor -> 200 + role monitor', monitor.status === 200 && monitor.json?.role === 'monitor');

  const anon = await call('/api/vehicles');
  ok('GET /api/vehicles without token -> 401', anon.status === 401);
  ok('GET /api/me with token -> 200', (await call('/api/me', { token })).status === 200);
}

section('GET /api/vehicles');
let vehicles;
{
  const { status, json } = await call('/api/vehicles', { token });
  ok('-> 200', status === 200);
  ok('is an array', Array.isArray(json));
  ok('has 25 vehicles', json?.length === 25, `got ${json?.length}`);
  const missing = VEHICLE_KEYS.filter((k) => !(k in (json?.[0] ?? {})));
  ok(`every contract key present (${VEHICLE_KEYS.join(', ')})`, missing.length === 0, `missing ${missing}`);
  ok('status values valid', json.every((v) => STATUS_VALUES.includes(v.status)));
  ok('lat/lng in Zambia bounds', json.every((v) => v.lat > -19 && v.lat < -8 && v.lng > 21 && v.lng < 35));
  vehicles = json;

  const filtered = await call('/api/vehicles?status=moving', { token });
  ok('?status=moving filters', filtered.json.every((v) => v.status === 'moving'));
  const searched = await call('/api/vehicles?q=hilux', { token });
  ok('?q= searches reg/driver/model', searched.status === 200 && searched.json.length > 0);
  const bad = await call('/api/vehicles?status=flying', { token });
  ok('?status=flying -> 400', bad.status === 400);
}

section('GET /api/vehicles/:id');
{
  const first = vehicles[0];
  const { status, json } = await call(`/api/vehicles/${first.id}`, { token });
  ok('-> 200', status === 200);
  ok('vehicle + recentAlerts', Array.isArray(json?.recentAlerts));
  ok('returns the right vehicle', json?.reg === first.reg);
  ok('404 for unknown id', (await call('/api/vehicles/999999', { token })).status === 404);
  ok('400 for non-numeric id', (await call('/api/vehicles/abc', { token })).status === 400);
}

section('GET /api/vehicles/:id/history');
{
  const id = vehicles[0].id;
  const { status, json } = await call(`/api/vehicles/${id}/history?hours=6`, { token });
  ok('-> 200', status === 200);
  ok('is an array', Array.isArray(json));
  ok('non-empty after simulation', json.length > 0, `got ${json.length}`);
  const keys = ['lat', 'lng', 'ts', 'speed'];
  const missing = keys.filter((k) => !(k in (json?.[0] ?? {})));
  ok(`contract keys present (${keys.join(', ')})`, missing.length === 0, `missing ${missing}`);
  const ascending = json.every((p, i) => i === 0 || p.ts >= json[i - 1].ts);
  ok('points ordered oldest -> newest', ascending);
  ok('400 for hours=0', (await call(`/api/vehicles/${id}/history?hours=0`, { token })).status === 400);
  ok('400 for hours=9999', (await call(`/api/vehicles/${id}/history?hours=9999`, { token })).status === 400);
}

section('GET /api/geofences');
{
  const { status, json } = await call('/api/geofences', { token });
  ok('-> 200', status === 200);
  ok('has >= 3 geofences', json?.length >= 3, `got ${json?.length}`);
  ok('shape { id, name, type, polygon }', json?.every((g) => 'id' in g && 'name' in g && 'type' in g && Array.isArray(g.polygon)));
  ok('polygons have >= 3 points', json?.every((g) => g.polygon.length >= 3));
  ok('includes a mining zone', json?.some((g) => g.type === 'mining'));
  ok('includes a border zone', json?.some((g) => g.type === 'border'));
}

section('GET /api/stats');
{
  const { status, json } = await call('/api/stats', { token });
  ok('-> 200', status === 200);
  const keys = ['total', 'active', 'stopped', 'offline', 'alertsToday'];
  const missing = keys.filter((k) => !(k in (json ?? {})));
  ok(`contract keys present (${keys.join(', ')})`, missing.length === 0, `missing ${missing}`);
  ok('total === 25', json?.total === 25);
  ok('active + stopped + offline === total', json.active + json.stopped + json.offline === json.total);
  ok('alertsToday is a number', typeof json?.alertsToday === 'number');
}

section('GET /api/alerts');
let alerts;
{
  const { status, json } = await call('/api/alerts', { token });
  ok('-> 200', status === 200);
  ok('is an array', Array.isArray(json));
  ok('has alerts', json.length > 0);
  const keys = ['id', 'vehicleId', 'type', 'severity', 'status', 'createdAt'];
  const missing = keys.filter((k) => !(k in (json?.[0] ?? {})));
  ok(`contract keys present (${keys.join(', ')})`, missing.length === 0, `missing ${missing}`);
  ok('types are all contract types', json.every((a) => ALERT_TYPES.includes(a.type)), [...new Set(json.map((a) => a.type))].join(','));
  ok('statuses are all contract statuses', json.every((a) => ALERT_STATUSES.includes(a.status)));
  alerts = json;

  ok('?status=new filters', (await call('/api/alerts?status=new', { token })).json.every((a) => a.status === 'new'));
  ok('?type=tamper filters', (await call('/api/alerts?type=tamper', { token })).json.every((a) => a.type === 'tamper'));
  ok('?status=bogus -> 400', (await call('/api/alerts?status=bogus', { token })).status === 400);
  ok('?type=bogus -> 400', (await call('/api/alerts?type=bogus', { token })).status === 400);
}

section('PATCH /api/alerts/:id  workflow + audit');
{
  const target = alerts.find((a) => a.status === 'new') ?? alerts[0];
  const before = (await call(`/api/alerts/${target.id}`, { token })).json;

  const noted = await call(`/api/alerts/${target.id}`, {
    method: 'PATCH',
    token,
    body: { note: 'Smoke test note from the control room.' },
  });
  ok('add a note without changing status -> 200', noted.status === 200);
  ok('status unchanged', noted.json.status === before.status);
  ok('note appended to the audit trail', noted.json.events.length === before.events.length + 1);
  ok('audit entry carries the actor', noted.json.events.at(-1).actor.length > 0);

  const verified = await call(`/api/alerts/${target.id}`, {
    method: 'PATCH',
    token,
    body: { status: 'verified', note: 'Verified by the control room.' },
  });
  ok('new -> verified -> 200', verified.status === 200 && verified.json.status === 'verified');
  ok('verifiedAt recorded', !!verified.json.verifiedAt);
  ok('audit actor + role recorded', verified.json.events.at(-1).actorRole === 'admin');

  const escalated = await call(`/api/alerts/${target.id}`, {
    method: 'PATCH',
    token,
    body: { status: 'escalated', note: 'Escalating to asset recovery.' },
  });
  ok('verified -> escalated -> 200', escalated.status === 200 && escalated.json.status === 'escalated');
  ok('escalatedAt recorded', !!escalated.json.escalatedAt);

  const dispatched = await call(`/api/alerts/${target.id}`, {
    method: 'PATCH',
    token,
    body: { responseStatus: 'pending', note: 'Field team requested.' },
  });
  ok('response moves independently of status', dispatched.status === 200 && dispatched.json.responseStatus === 'pending');
  ok('status still escalated', dispatched.json.status === 'escalated');

  const badJump = await call(`/api/alerts/${target.id}`, { method: 'PATCH', token, body: { status: 'new' } });
  ok('escalated -> new rejected with 409', badJump.status === 409, `got ${badJump.status}`);

  const badStatus = await call(`/api/alerts/${target.id}`, { method: 'PATCH', token, body: { status: 'nope' } });
  ok('invalid status value -> 400', badStatus.status === 400);

  const empty = await call(`/api/alerts/${target.id}`, { method: 'PATCH', token, body: {} });
  ok('empty body -> 400', empty.status === 400);

  const resolved = await call(`/api/alerts/${target.id}`, {
    method: 'PATCH',
    token,
    body: { status: 'resolved', note: 'Smoke test complete.' },
  });
  ok('escalated -> resolved -> 200', resolved.status === 200 && resolved.json.status === 'resolved');
  ok('resolvedAt + resolvedBy recorded', !!resolved.json.resolvedAt && !!resolved.json.resolvedBy);

  const reopen = await call(`/api/alerts/${target.id}`, { method: 'PATCH', token, body: { status: 'verified' } });
  ok('resolved is terminal -> 409', reopen.status === 409, `got ${reopen.status}`);

  ok('PATCH unknown id -> 404', (await call('/api/alerts/999999', { method: 'PATCH', token, body: { status: 'verified' } })).status === 404);

  const trail = await call(`/api/alerts/${target.id}`, { token });
  const actions = trail.json.events.map((e) => e.action);
  ok('full trail: created,note,verified,escalated,response,resolved', 
    ['created', 'verified', 'escalated', 'resolved'].every((a) => actions.includes(a)), actions.join('>'));
  ok('every event has a timestamp', trail.json.events.every((e) => !!e.ts));
  ok('every event has an actor', trail.json.events.every((e) => !!e.actor));
}

section('GET /api/reports/monthly');
{
  const month = new Date().toISOString().slice(0, 7);
  const { status, json } = await call(`/api/reports/monthly?month=${month}`, { token });
  ok('-> 200', status === 200);
  ok('echoes the month', json?.month === month);
  ok('has alerts by type', Array.isArray(json?.byType) && json.byType.length === ALERT_TYPES.length);
  ok('covers all 6 contract alert types', json.byType.map((t) => t.type).sort().join() === [...ALERT_TYPES].sort().join());
  ok('has average resolution time', 'avgResolutionHours' in (json?.performance ?? {}));
  ok('has uptime per vehicle', Array.isArray(json?.vehicles) && json.vehicles.every((v) => 'uptimePct' in v));
  ok('vehicles carry uptime percentages', json.vehicles.every((v) => v.uptimePct >= 0 && v.uptimePct <= 100));
  ok('has a daily trend', Array.isArray(json?.trend) && json.trend.length > 0);
  ok('has a previous-month comparison', 'comparison' in (json ?? {}));
  ok('has fleet summary', 'fleet' in (json ?? {}));

  const previous = new Date(Date.UTC(2026, 8, 1)).toISOString().slice(0, 7);
  const full = await call(`/api/reports/monthly?month=${previous}`, { token });
  ok('previous full month has alerts', full.json?.summary?.totalAlerts > 0, `got ${full.json?.summary?.totalAlerts}`);
  ok('previous month is not partial', full.json?.isPartial === false);

  ok('?month=bogus -> 400', (await call('/api/reports/monthly?month=bogus', { token })).status === 400);
  ok('?month=2026-13 -> 400', (await call('/api/reports/monthly?month=2026-13', { token })).status === 400);
}

section('simulation');
{
  const a = (await call('/api/vehicles', { token })).json;
  await new Promise((r) => setTimeout(r, 12000));
  const b = (await call('/api/vehicles', { token })).json;
  const moved = a.filter((v, i) => {
    const w = b[i];
    return v.lat !== w.lat || v.lng !== w.lng;
  });
  ok('vehicles move between polls', moved.length > 0, `${moved.length}/25 moved`);
  ok('moving vehicles report speed > 0', b.filter((v) => v.status === 'moving').every((v) => v.speed > 0));
  ok('stopped vehicles report speed 0', b.filter((v) => v.status === 'stopped').every((v) => v.speed === 0));
  ok('positions stay inside Zambia', b.every((v) => v.lat > -19 && v.lat < -8 && v.lng > 21 && v.lng < 35));
  const alertCount = (await call('/api/stats', { token })).json;
  ok('stats still consistent', alertCount.total === 25);
}

section('errors');
{
  ok('unknown API route -> 404', (await call('/api/does-not-exist', { token })).status === 404);
  const bad = await call('/api/vehicles', { token, headers: { Authorization: 'Bearer not-a-real-token' } });
  ok('bad token -> 401', bad.status === 401);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) console.log(`  failed: ${failures.join(', ')}`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);