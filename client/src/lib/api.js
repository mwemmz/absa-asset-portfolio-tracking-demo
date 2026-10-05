/**
 * Thin API client for the demo backend.
 *
 * In dev the Vite proxy serves /api on the same origin, so no CORS and no base
 * URL is needed. Point VITE_API_BASE at another host to run the client against
 * a deployed API.
 */

const BASE = import.meta.env.VITE_API_BASE || '';
const TOKEN_KEY = 'absa-demo.token';
const USER_KEY = 'absa-demo.user';

/** Fired on a 401 so the auth provider can drop the session. */
export const UNAUTHORISED_EVENT = 'absa-demo:unauthorised';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user ?? null));
  } catch {
    /* private browsing - session simply will not persist */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal, auth = true } = {}) {
  const token = auth ? getToken() : null;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the demo API. Is the server running on port 4000?');
  }

  if (res.status === 401 && auth) {
    clearSession();
    window.dispatchEvent(new CustomEvent(UNAUTHORISED_EVENT));
    throw new ApiError(401, 'Your demo session has expired. Sign in again.');
  }

  if (res.status === 204) return null;

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && payload.error) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, payload?.details);
  }

  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') search.set(k, v);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  health: () => request('/api/health', { auth: false }),

  login: (email, password) =>
    request('/api/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/api/me'),

  vehicles: (params) => request(`/api/vehicles${qs(params)}`),
  vehicle: (id) => request(`/api/vehicles/${id}`),
  history: (id, params) => request(`/api/vehicles/${id}/history${qs(params)}`),
  vehicleRoute: (id) => request(`/api/vehicles/${id}/route`),

  routes: () => request('/api/routes'),
  geofences: () => request('/api/geofences'),

  alerts: (params) => request(`/api/alerts${qs(params)}`),
  alertSummary: () => request('/api/alerts/summary'),
  alert: (id) => request(`/api/alerts/${id}`),
  updateAlert: (id, patch) => request(`/api/alerts/${id}`, { method: 'PATCH', body: patch }),
  addNote: (id, note) => request(`/api/alerts/${id}/notes`, { method: 'POST', body: { note } }),

  stats: () => request('/api/stats'),
  statsByType: () => request('/api/stats/by-type'),
  monthlyReport: (month) => request(`/api/reports/monthly${qs({ month })}`),
  months: () => request('/api/reports/months'),

  resetDemo: () => request('/api/demo/reset', { method: 'POST' }),
};