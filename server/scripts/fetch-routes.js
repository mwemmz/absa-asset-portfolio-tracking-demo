/**
 * Build-time tool. Fetches real road-following geometry from the public OSRM
 * demo server and bakes it into src/data/routes.json.
 *
 * The generated JSON is committed, so the running demo never needs network
 * access. Re-run only if you want to refresh the road geometry:
 *
 *   node scripts/fetch-routes.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'routes.json');

const OSRM = 'http://router.project-osrm.org/route/v1/driving';

/** Real places in Zambia. [lat, lng] */
const PLACES = {
  lusaka: [-15.3875, 28.3228],
  kabwe: [-15.2179, 28.6413],
  kapiriMposhi: [-14.1799, 28.5671],
  chinsali: [-13.1833, 28.4333],
  ndola: [-12.9684, 28.2333],
  kitwe: [-12.8024, 28.2132],
  chililabombwe: [-12.2987, 28.215],
  luanshya: [-13.1319, 28.4222],
  mufulira: [-12.3317, 28.4172],
  mazabuka: [-15.6053, 27.7608],
  monze: [-16.2761, 27.4731],
  choma: [-16.8088, 26.9605],
  livingstone: [-17.8535, 25.8543],
  kazungula: [-17.793, 25.2428],
  kafue: [-15.7667, 28.3667],
  siavonga: [-16.5381, 28.3069],
  kariba: [-16.5167, 28.8167],
  chirundu: [-16.2994, 28.7523],
};

const ROUTE_DEFS = [
  { id: 'r1', name: 'Lusaka - Ndola (Copperbelt North)', via: ['lusaka', 'kabwe', 'kapiriMposhi', 'chinsali', 'ndola'] },
  { id: 'r2', name: 'Lusaka - Kitwe (Copperbelt South)', via: ['lusaka', 'kabwe', 'luanshya', 'kitwe'] },
  { id: 'r3', name: 'Ndola - Kitwe - Chililabombwe', via: ['ndola', 'kitwe', 'chililabombwe'] },
  { id: 'r4', name: 'Lusaka - Livingstone (M9)', via: ['lusaka', 'mazabuka', 'monze', 'choma', 'livingstone'] },
  { id: 'r5', name: 'Livingstone - Chirundu (Kazungula)', via: ['livingstone', 'kazungula', 'chirundu'] },
  { id: 'r6', name: 'Lusaka - Chirundu Border (T2 South)', via: ['lusaka', 'kafue', 'siavonga', 'kariba', 'chirundu'] },
  { id: 'r7', name: 'Lusaka - Kafue - Lusaka (Depot Loop)', via: ['lusaka', 'kafue', 'lusaka'] },
  { id: 'r8', name: 'Kitwe - Mufulira (Mining Belt)', via: ['kitwe', 'chililabombwe', 'mufulira'] },
];

const MIN_SPACING_M = 180;

const toRad = (deg) => (deg * Math.PI) / 180;
const R = 6371008.8;

function distanceM([lat1, lng1], [lat2, lng2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Round to ~11 m and drop points that add no shape. */
function simplify(points) {
  const out = [];
  let last = null;
  for (const p of points) {
    const [lat, lng] = [Number(p[1].toFixed(4)), Number(p[0].toFixed(4))];
    if (last && distanceM(last, [lat, lng]) < MIN_SPACING_M) continue;
    out.push([lat, lng]);
    last = [lat, lng];
  }
  if (out.length > 1) {
    const tail = points[points.length - 1];
    out.push([Number(tail[1].toFixed(4)), Number(tail[0].toFixed(4))]);
  }
  return out;
}

async function fetchRoute(def) {
  const coords = def.via.map((k) => {
    const [lat, lng] = PLACES[k];
    return `${lng},${lat}`;
  });
  const url = `${OSRM}/${coords.join(';')}?overview=full&geometries=geojson&continue_straight=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 'Ok' || !body.routes?.length) throw new Error(`${def.id}: ${body.code}`);

  const { geometry } = body.routes[0];
  const distanceMeters = Math.round(body.routes[0].distance);
  const points = simplify(geometry.coordinates);
  const legsOut = body.waypoints.map((wp, i) => ({
    to: def.via[i],
    lat: Number(wp.location[1].toFixed(4)),
    lng: Number(wp.location[0].toFixed(4)),
  }));

  return {
    id: def.id,
    name: def.name,
    corridor: def.via.join(' -> '),
    via: def.via.map((k) => k),
    distanceMeters,
    averageSpeedKph: Math.round((distanceMeters / 1000 / (body.routes[0].duration / 3600)) * 10) / 10,
    pointCount: points.length,
    points,
    legs: legsOut,
    bounds: boundsOf(points),
  };
}

function boundsOf(points) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [lat, lng] of points) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    w = Math.min(w, lng);
    e = Math.max(e, lng);
  }
  return [s, w, n, e];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (const def of ROUTE_DEFS) {
  process.stdout.write(`fetching ${def.id} ${def.name} ... `);
  try {
    const r = await fetchRoute(def);
    console.log(`${r.pointCount} pts, ${(r.distanceMeters / 1000).toFixed(0)} km`);
    results.push(r);
  } catch (err) {
    console.log(`FAILED ${err.message}`);
    process.exitCode = 1;
  }
  await sleep(1200); // be polite to the demo server
}

if (results.length !== ROUTE_DEFS.length) {
  console.error('\nNot all routes fetched - refusing to overwrite existing routes.json');
  process.exit(1);
}

const payload = {
  _comment:
    'Generated by server/scripts/fetch-routes.js from the public OSRM demo server. Road geometry only - no customer data. Commit this file so the demo runs offline.',
  generatedAt: new Date().toISOString(),
  source: 'OSRM demo server (router.project-osrm.org), OpenStreetMap road data',
  coordinateFormat: '[[lat, lng], ...]',
  routes: results,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
console.log(`\nwrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);