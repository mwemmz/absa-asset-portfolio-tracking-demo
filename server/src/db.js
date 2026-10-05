import fs from 'node:fs';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Bump this whenever the DDL below changes. `CREATE TABLE IF NOT EXISTS` silently
 * keeps an old table, so without this guard a schema edit never reaches an
 * existing demo database. The database only ever holds simulated data, so the
 * safe move is to drop and rebuild.
 */
const SCHEMA_VERSION = 2;

const KNOWN_TABLES = ['alert_events', 'alerts', 'positions', 'vehicles', 'geofences', 'routes', 'users'];

const existingVersion = db.pragma('user_version', { simple: true });
const hasExistingTables = KNOWN_TABLES.some(
  (t) => !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(t),
);

// A database with no tables is fresh. Anything else with a mismatched version is stale.
if (hasExistingTables && existingVersion !== SCHEMA_VERSION) {
  db.exec(KNOWN_TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));
  console.warn(
    `[db] schema ${existingVersion} -> ${SCHEMA_VERSION}: rebuilt demo database (simulated data only).`,
  );
}
db.pragma(`user_version = ${SCHEMA_VERSION}`);

db.exec(`
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