/** Tiny request-validation helpers. Throws HttpError on bad input. */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg) => new HttpError(404, msg);
export const forbidden = (msg) => new HttpError(403, msg);

/** Wrap an async/sync handler so thrown HttpErrors become clean JSON. */
export function handler(fn) {
  return (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function idParam(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${label} must be a positive integer`);
  return n;
}

export function oneOf(value, allowed, label) {
  if (value == null || value === '') return undefined;
  if (!allowed.includes(value)) {
    throw badRequest(`${label} must be one of: ${allowed.join(', ')}`, { received: value });
  }
  return value;
}

export function boundedInt(value, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback, label = 'value' } = {}) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${label} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${label} must be an integer`);
  if (n < min || n > max) throw badRequest(`${label} must be between ${min} and ${max}`);
  return n;
}

/** Accepts YYYY-MM. */
export function monthParam(value, fallback) {
  const v = value ?? fallback;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v ?? '')) {
    throw badRequest('month must look like YYYY-MM', { received: value ?? null });
  }
  return v;
}

export function text(value, { max = 2000, label = 'note', required = false } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) throw badRequest(`${label} is required`);
    return '';
  }
  const s = String(value).trim();
  if (s.length > max) throw badRequest(`${label} must be ${max} characters or fewer`);
  return s;
}

export function isoDateParam(value, label) {
  if (value == null || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} must be a valid date`);
  return d.toISOString();
}