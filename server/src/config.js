import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = process.env.DB_FILE || path.join(DATA_DIR, 'absa-demo.db');

/**
 * Turso / libSQL. Set TURSO_URL to the `libsql://<db>.turso.io` value that
 * `turso db show <name> --url` prints, plus TURSO_AUTH_TOKEN, and the API talks
 * to a remote libSQL database. Leave TURSO_URL empty and the same driver opens
 * the local SQLite file, so there is only one code path and one SQL dialect.
 *
 * A `file:` URL also works, which is handy for pointing at a local libSQL file.
 */
export const TURSO_URL = process.env.TURSO_URL || '';
export const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

export const PORT = Number(process.env.PORT || 4000);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

/** Simulation clock. The brief asks for 5s polling. */
export const TICK_MS = Number(process.env.TICK_MS || 5000);
export const SIM_ENABLED = process.env.SIM_ENABLED !== 'false';

/** How long a vehicle must be stationary before we raise prolonged_stop. */
export const PROLONGED_STOP_MS = Number(process.env.PROLONGED_STOP_MS || 10 * 60 * 1000);
/** Straight-line distance from the planned route before we raise route_deviation. */
export const DEVIATION_THRESHOLD_M = Number(process.env.DEVIATION_THRESHOLD_M || 800);
export const OFFLINE_TIMEOUT_MS = Number(process.env.OFFLINE_TIMEOUT_MS || 3 * 60 * 1000);

/** Rows older than this are pruned from the positions table. */
export const POSITION_RETENTION_DAYS = Number(process.env.POSITION_RETENTION_DAYS || 3);

export const TZ_LABEL = 'Africa/Lusaka';
export const CURRENCY = 'ZMW';

/** Visible everywhere so nobody mistakes this for a live platform. */
export const DEMO_NOTICE = {
  isDemo: true,
  label: 'Concept Demo - Simulated Data',
  detail:
    'Vehicle positions, drivers and incidents on this dashboard are randomly simulated for demonstration only. This is not a live fleet-tracking system and contains no Absa customer data.',
};