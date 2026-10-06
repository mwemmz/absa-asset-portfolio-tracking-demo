import { spawnSync } from 'node:child_process';
import express from 'express';
import cors from 'cors';

import { db, driver, nowIso } from './db.js';
import { CLIENT_ORIGIN, DEMO_NOTICE, PORT, SIM_ENABLED, TURSO_URL } from './config.js';
import { clearSessions, login, requireAuth, sessionCount } from './lib/auth.js';
import { HttpError, handler, text } from './lib/validate.js';
import { alertsRouter } from './routes/alerts.js';
import { vehiclesRouter, geofencesRouter } from './routes/vehicles.js';
import { reportsRouter } from './routes/reports.js';
import { statsRouter } from './routes/stats.js';
import * as sim from './simulate.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: [CLIENT_ORIGIN, /localhost:\d+$/, /127\.0\.0\.1:\d+$/],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
  }),
);

/* -------------------------------------------------------------- meta ---- */
app.get(
  '/api/health',
  handler((_req, res) => {
    res.json({
      ok: true,
      time: nowIso(),
      db: TURSO_URL || driver,
      driver,
      simulation: sim.status(),
      sessions: sessionCount(),
      notice: DEMO_NOTICE,
    });
  }),
);

/* -------------------------------------------------------------- auth ---- */
app.post(
  '/api/login',
  handler(async (req, res) => {
    const email = text(req.body?.email, { max: 200, label: 'email', required: true });
    const password = text(req.body?.password, { max: 200, label: 'password', required: true });
    res.json({ ...(await login(email, password)), notice: DEMO_NOTICE });
  }),
);

app.get(
  '/api/me',
  requireAuth,
  handler((req, res) => {
    res.json({ user: { email: req.user.email, name: req.user.name, role: req.user.role } });
  }),
);

/* -------------------------------------------------------------- data ---- */
app.use('/api', requireAuth);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/geofences', geofencesRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/reports', reportsRouter);

/* ------------------------------------------------------------- routes --- */
app.get(
  '/api/routes',
  handler(async (_req, res) => {
    const rows = await db
      .prepare(
        `SELECT id, name, corridor, via, distance_meters, avg_speed_kph, bounds, points
           FROM routes ORDER BY id`,
      )
      .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        corridor: r.corridor,
        via: r.via,
        distanceMeters: r.distance_meters,
        avgSpeedKph: r.avg_speed_kph,
        bounds: JSON.parse(r.bounds),
        points: JSON.parse(r.points),
      })),
    );
  }),
);

/* --------------------------------------------------------------- demo --- */
/** Restore the clean seed dataset. Admin only. Keeps the demo reproducible. */
app.post(
  '/api/demo/reset',
  requireAuth,
  handler(async (req, res) => {
    if (req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the demo administrator can reset the dataset');
    }
    sim.stop();
    clearSessions();
    const result = spawnSync(process.execPath, ['src/seed.js', '--force'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error('[demo] reset failed', result.stderr);
      throw new HttpError(500, 'Reset failed. Run "npm run reset" in /server instead.');
    }
    if (SIM_ENABLED) await sim.start();
    res.json({ reset: true, at: nowIso(), output: result.stdout.trim().split('\n') });
  }),
);

/** Force one simulation tick - handy when you need the map to move on demand. */
app.post(
  '/api/demo/tick',
  requireAuth,
  handler(async (_req, res) => {
    res.json(await sim.tick());
  }),
);

/* ---------------------------------------------------------- fallbacks --- */
app.use('/api', (req, _res, next) => {
  next(new HttpError(404, `No API route for ${req.method} ${req.originalUrl}`));
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({
    error: err.message || 'Unexpected server error',
    ...(err.details ? { details: err.details } : {}),
  });
});

/* --------------------------------------------------------------- boot --- */
async function ensureSeeded() {
  const countVehicles = db.prepare('SELECT COUNT(*) AS n FROM vehicles');
  const n = (await countVehicles.get()).n;
  if (n > 0) return n;
  console.log('[seed] empty database, seeding now...');
  const result = spawnSync(process.execPath, ['src/seed.js'], { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new Error('Seeding failed. Run "npm run seed" in /server.');
  }
  console.log(result.stdout.trim());
  return (await countVehicles.get()).n;
}

/** One transient Turso fetch failure should not take the whole boot down. */
async function bootRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = 1000 * 2 ** i;
      console.error(`[boot] attempt ${i + 1}/${attempts} failed: ${err.message}; retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const seeded = await bootRetry(ensureSeeded);
if (SIM_ENABLED) await bootRetry(() => sim.start());

const server = app.listen(PORT, () => {
  console.log(`\n  Absa portfolio tracking - CONCEPT DEMO (simulated data)`);
  console.log(`  API      http://localhost:${PORT}/api`);
  console.log(`  Health   http://localhost:${PORT}/api/health`);
  console.log(`  Client   ${CLIENT_ORIGIN}`);
  console.log(`  Database ${TURSO_URL || 'local SQLite file'} via ${driver} (${seeded} vehicles)\n`);
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down`);
  sim.stop();
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;