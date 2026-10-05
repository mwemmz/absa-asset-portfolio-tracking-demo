/** Formatting helpers. The demo reports in Zambian time (Africa/Lusaka, UTC+2). */

const TZ = 'Africa/Lusaka';

const dt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dtSeconds = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const full = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : dt.format(d);
}

export function formatDateTimeSeconds(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : dtSeconds.format(d);
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : dateOnly.format(d);
}

export function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : timeOnly.format(d);
}

export function formatFull(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : full.format(d);
}

/** "4m ago", "3h ago", "2d ago" - falls back to "-" for missing values. */
export function timeAgo(value, now = Date.now()) {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/** Long-form duration for stopped/offline panels: "1h 24m". */
export function duration(fromValue, now = Date.now()) {
  if (!fromValue) return '-';
  const from = new Date(fromValue).getTime();
  if (Number.isNaN(from)) return '-';

  let seconds = Math.max(0, Math.round((now - from) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatNumber(value, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

/** ZMW amounts. Zambian kwacha is quoted in whole units in this demo. */
export function formatZmw(value, { compact = false } = {}) {
  if (value == null) return '-';
  const n = Number(value);
  if (compact && Math.abs(n) >= 1_000_000) return `K${formatNumber(n / 1_000_000, 1)}m`;
  if (compact && Math.abs(n) >= 1_000) return `K${formatNumber(n / 1_000, 0)}`;
  return `ZMW ${formatNumber(n, 0)}`;
}

export function formatKm(value) {
  if (value == null) return '-';
  return `${formatNumber(value)} km`;
}

export function formatSpeed(value) {
  if (value == null) return '-';
  return `${formatNumber(value)} km/h`;
}

export function formatPct(value, decimals = 1) {
  if (value == null) return '-';
  return `${formatNumber(value, decimals)}%`;
}

export function formatMetres(value) {
  if (value == null) return '-';
  const n = Number(value);
  if (n >= 1000) return `${formatNumber(n / 1000, 1)} km`;
  return `${formatNumber(n)} m`;
}

export function formatHours(value) {
  if (value == null) return '-';
  const n = Number(value);
  if (n < 1) return `${formatNumber(n * 60)} min`;
  if (n < 48) return `${formatNumber(n, 1)} h`;
  return `${formatNumber(n / 24, 1)} d`;
}

export function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(
    new Date(),
  );
}

export function monthLabel(month) {
  if (!month) return '-';
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function titleCase(value) {
  if (!value) return '-';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}