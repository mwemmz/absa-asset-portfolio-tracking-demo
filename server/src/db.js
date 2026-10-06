import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { DATA_DIR, DB_PATH, TURSO_TOKEN, TURSO_URL } from './config.js';

/**
 * One driver, one SQL dialect. With TURSO_URL set the API talks to a remote
 * libSQL database (Turso); without it the same driver opens the local SQLite
 * file. Remote is the deployment target, local is the zero-setup demo path.
 */
const remote = Boolean(TURSO_URL);

if (remote && !TURSO_TOKEN) {
  throw new Error(
    'TURSO_URL is set but TURSO_AUTH_TOKEN is empty. The demo writes on every request, ' +
      'so it needs a token. Create one with: turso db tokens create <db-name>\n' +
      'Then put both values in server/.env (see server/.env.example).',
  );
}

if (!remote) fs.mkdirSync(DATA_DIR, { recursive: true });

const localUrl = `file:${path.resolve(DB_PATH).split(path.sep).join('/')}`;

export const client = createClient({
  url: remote ? TURSO_URL : localUrl,
  ...(remote ? { authToken: TURSO_TOKEN } : {}),
});

export const driver = remote ? 'turso' : 'local-sqlite';

/**
 * libSQL returns every INTEGER as a JS BigInt. That is more faithful than the
 * old driver but it breaks `JSON.stringify`, so normalise the common case back
 * to Number. Anything genuinely beyond 2^53 does not occur in this demo.
 */
function normalise(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

function normaliseResult(result) {
  return {
    ...result,
    rows: result.rows.map(normalise),
    lastInsertRowid:
      typeof result.lastInsertRowid === 'bigint'
        ? Number(result.lastInsertRowid)
        : result.lastInsertRowid,
    rowsAffected:
      typeof result.rowsAffected === 'bigint'
        ? Number(result.rowsAffected)
        : result.rowsAffected,
  };
}

/**
 * Normalises whatever the call site passed into a libSQL-bindable value:
 * a named-args object, a positional array, or a lone scalar wrapped into one.
 * SQLite has no boolean bind, so booleans become 1/0 here rather than at 40
 * separate call sites.
 */
function bind(params) {
  if (params == null) return {};
  if (Array.isArray(params)) return params.map(one);
  if (typeof params === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = one(v);
    return out;
  }
  return [one(params)];
}

function one(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

/**
 * The in-flight transaction, so statements issued inside a `db.transaction()`
 * body join it instead of auto-committing on their own.
 */
let activeTx = null;

/** Serialises transactions: a remote database has no nested write transactions. */
let txQueue = Promise.resolve();

const run = (sql, params) =>
  (activeTx
    ? activeTx.execute({ sql, args: bind(params) })
    : client.execute({ sql, args: bind(params) })
  ).then(normaliseResult);

/**
 * libSQL is HTTP-based, so every query returns a promise. This adapter keeps
 * the better-sqlite3 call shape (`db.prepare(sql).get(params)`) so the query
 * code stays readable and only needed `await` added at each call site.
 */
export const db = {
  prepare(sql) {
    return {
      get: async (params) => (await run(sql, params)).rows[0] ?? null,
      all: async (params) => (await run(sql, params)).rows,
      run: (params) => run(sql, params),
    };
  },

  exec: (sql) => client.executeMultiple(sql),

  /**
   * `client.transaction()` hands back a handle bound to one stream, which is the
   * only thing that makes BEGIN/COMMIT reliable over HTTP. Bodies are queued so
   * two concurrent requests cannot fight over `activeTx`.
   */
  transaction(fn) {
    return (...args) => {
      const task = txQueue.then(async () => {
        const tx = await client.transaction('write');
        activeTx = tx;
        try {
          const out = await fn(...args);
          await tx.commit();
          return out;
        } catch (err) {
          await tx.rollback().catch(() => {});
          throw err;
        } finally {
          activeTx = null;
        }
      });
      // Keep the queue alive even when this transaction rejects.
      txQueue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    };
  },

  close() {
    client.close();
  },
};

/**
 * Bump this whenever the DDL below changes. `CREATE TABLE IF NOT EXISTS` silently
 * keeps an old table, so without this guard a schema edit never reaches an
 * existing demo database. The database only ever holds simulated data, so the
 * safe move is to drop and rebuild.
 */
const SCHEMA_VERSION = 2;

const KNOWN_TABLES = ['alert_events', 'alerts', 'positions', 'vehicles', 'geofences', 'routes', 'users'];

// WAL and foreign-key enforcement are per-connection settings on a local file.
// A remote libSQL server owns its own journal mode, so only set these locally.
if (!remote) {
  await client.execute('PRAGMA journal_mode = WAL').catch(() => {});
  await client.execute('PRAGMA foreign_keys = ON').catch(() => {});
}

const versionRow = await client.execute('PRAGMA user_version');
const existingVersion = Number(versionRow.rows[0]?.user_version ?? 0);

const found = await client.execute(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${KNOWN_TABLES.map(() => '?').join(', ')})`,
  KNOWN_TABLES,
);
const hasExistingTables = found.rows.length > 0;

// A database with no tables is fresh. Anything else with a mismatched version is stale.
if (hasExistingTables && existingVersion !== SCHEMA_VERSION) {
  await client.executeMultiple(KNOWN_TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));
  console.warn(
    `[db] schema ${existingVersion} -> ${SCHEMA_VERSION}: rebuilt demo database (simulated data only).`,
  );
}
await client.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);

await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin','monitor')),
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id              TEXT PRIMARY KEY,
  name            TEXT    NOT NULL,
  corridor        TEXT    NOT NULL,
  via             TEXT    NOT NULL,
  distance_meters INTEGER NOT NULL,
  avg_speed_kph   REAL    NOT NULL,
  bounds          TEXT    NOT NULL,
  points          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS geofences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('depot','mining','border','restricted','corridor')),
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL DEFAULT '',
  polygon     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reg             TEXT    NOT NULL UNIQUE,
  make_model      TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  driver          TEXT    NOT NULL,
  driver_phone    TEXT    NOT NULL DEFAULT '',
  customer        TEXT    NOT NULL DEFAULT '',
  agreement_ref   TEXT    NOT NULL DEFAULT '',
  asset_value_zmw INTEGER NOT NULL DEFAULT 0,
  home_depot      TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'stopped' CHECK (status IN ('moving','stopped','offline')),
  device_status   TEXT    NOT NULL DEFAULT 'online'  CHECK (device_status IN ('online','offline','tampered')),
  route_id        TEXT    REFERENCES routes(id),
  route_pos       REAL    NOT NULL DEFAULT 0,
  route_dir       INTEGER NOT NULL DEFAULT 1,
  lat             REAL,
  lng             REAL,
  speed_kph       REAL    NOT NULL DEFAULT 0,
  heading         REAL    NOT NULL DEFAULT 0,
  deviation_m     REAL    NOT NULL DEFAULT 0,
  odometer_km     REAL    NOT NULL DEFAULT 0,
  uptime_seconds  REAL    NOT NULL DEFAULT 0,
  stopped_since   TEXT,
  offline_since   TEXT,
  last_update     TEXT,
  last_event_at   TEXT,
  created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat        REAL    NOT NULL,
  lng        REAL    NOT NULL,
  speed_kph  REAL    NOT NULL,
  heading    REAL    NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL,
  deviation_m REAL   NOT NULL DEFAULT 0,
  geofence_id INTEGER REFERENCES geofences(id),
  ts         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL,
  severity        TEXT    NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status          TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','verified','escalated','resolved')),
  response_status TEXT    NOT NULL DEFAULT 'not_required'
                  CHECK (response_status IN ('not_required','pending','dispatched','on_site','stood_down','closed')),
  title           TEXT    NOT NULL,
  details         TEXT    NOT NULL DEFAULT '',
  location_label  TEXT    NOT NULL DEFAULT '',
  lat             REAL,
  lng             REAL,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  verified_at     TEXT,
  escalated_at    TEXT,
  resolved_at     TEXT,
  resolved_by     TEXT,
  source          TEXT    NOT NULL DEFAULT 'simulation' CHECK (source IN ('simulation','manual','system'))
);

CREATE TABLE IF NOT EXISTS alert_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id        INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  action          TEXT    NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  from_response   TEXT,
  to_response     TEXT,
  note            TEXT    NOT NULL DEFAULT '',
  actor           TEXT    NOT NULL DEFAULT 'system',
  actor_role      TEXT    NOT NULL DEFAULT 'system',
  ts              TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_vehicle_ts ON positions(vehicle_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alert_status   ON alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_vehicle  ON alerts(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_type     ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_events_alert   ON alert_events(alert_id, ts);
`);

console.log(`[db] driver: ${driver}${remote ? ` (${TURSO_URL})` : ` (${localUrl})`}`);

export function nowIso() {
  return new Date().toISOString();
}

export function closeDb() {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}