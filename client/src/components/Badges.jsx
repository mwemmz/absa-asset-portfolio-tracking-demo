import { ALERT_STATUS, ALERT_TYPE, DEVICE_STATUS, SEVERITY, VEHICLE_STATUS } from '../lib/constants.js';
import { formatNumber } from '../lib/format.js';

export function StatusPill({ status, showDot = true, className = '' }) {
  const meta = VEHICLE_STATUS[status] ?? {
    label: status,
    dot: 'bg-ink-400',
    chip: 'bg-ink-100 text-ink-600 ring-1 ring-ink-300',
  };
  return (
    <span className={`chip ${meta.chip} ${className}`}>
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />}
      {meta.label}
    </span>
  );
}

export function DevicePill({ status, className = '' }) {
  const meta = DEVICE_STATUS[status] ?? DEVICE_STATUS.online;
  return <span className={`chip ${meta.chip} ${className}`}>{meta.label}</span>;
}

export function AlertStatusPill({ status, className = '' }) {
  const meta = ALERT_STATUS[status] ?? ALERT_STATUS.new;
  return <span className={`chip ${meta.chip} ${className}`}>{meta.label}</span>;
}

export function SeverityPill({ severity, className = '' }) {
  const meta = SEVERITY[severity] ?? SEVERITY.low;
  return <span className={`chip ${meta.chip} ${className}`}>{meta.label}</span>;
}

export function AlertTypeLabel({ type, short = false }) {
  const meta = ALERT_TYPE[type] ?? { label: type, short: type };
  return <span className="font-medium text-ink-800">{short ? meta.short : meta.label}</span>;
}

/** Four-step status track: New -> Verified -> Escalated -> Resolved. */
export function StatusTrack({ status, className = '' }) {
  const current = ALERT_STATUS[status]?.step ?? 1;
  const steps = [
    { key: 'new', label: 'New' },
    { key: 'verified', label: 'Verified' },
    { key: 'escalated', label: 'Escalated' },
    { key: 'resolved', label: 'Resolved' },
  ];

  return (
    <ol className={`flex items-center ${className}`}>
      {steps.map((step, index) => {
        const done = current > index;
        const active = current === index + 1;
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold
                  ${done ? 'bg-brand-600 text-white' : ''}
                  ${active ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : ''}
                  ${!done && !active ? 'bg-ink-200 text-ink-500' : ''}`}
              >
                {done ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`whitespace-nowrap text-[10px] font-medium uppercase tracking-wide
                  ${active ? 'text-brand-700' : done ? 'text-ink-600' : 'text-ink-400'}`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mx-1 mb-4 h-0.5 flex-1 rounded ${
                  current > index + 1 ? 'bg-brand-500' : 'bg-ink-200'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Compact counts strip used on the dashboard. */
export function CountPill({ label, value, tone = 'ink' }) {
  const tones = {
    ink: 'bg-ink-50 text-ink-600 ring-ink-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-md px-2 py-1 ring-1 ${tones[tone]}`}>
      <span className="text-sm font-bold tabular-nums">{formatNumber(value)}</span>
      <span className="text-xs">{label}</span>
    </span>
  );
}