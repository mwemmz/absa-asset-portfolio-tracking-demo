/**
 * Demo authentication.
 *
 * Intentionally trivial: two hardcoded users, bearer tokens held in memory.
 * Tokens are lost on restart, which is fine for a demo and means there is no
 * credential material to protect. Do not copy this into anything real.
 */
import crypto from 'node:crypto';
import { db } from '../db.js';
import { HttpError } from './validate.js';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
/** token -> { userId, email, name, role, expiresAt } */
const sessions = new Map();

function prune() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(token);
  }
}

export function login(email, password) {
  const user = db
    .prepare('SELECT id, email, password, name, role FROM users WHERE email = ?')
    .get(String(email ?? '').trim().toLowerCase());

  // Compare against a dummy value when the user is unknown so a wrong email and
  // a wrong password take the same path.
  const ok = user ? user.password === password : password === '\u0000invalid';
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password');

  prune();
  const token = crypto.randomUUID();
  sessions.set(token, {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return {
    token,
    role: user.role,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

function readToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return sessions.get(value.trim()) ?? null;
}

export function requireAuth(req, _res, next) {
  const session = readToken(req);
  if (!session) return next(new HttpError(401, 'Sign in to use the demo API'));
  if (session.expiresAt <= Date.now()) {
    sessions.delete(req.get('authorization').split(' ')[1]);
    return next(new HttpError(401, 'Session expired, sign in again'));
  }
  req.user = session;
  return next();
}

export function clearSessions() {
  sessions.clear();
}

export function sessionCount() {
  prune();
  return sessions.size;
}