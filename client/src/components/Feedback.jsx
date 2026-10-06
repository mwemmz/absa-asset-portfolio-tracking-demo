export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Loading({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-16 text-sm text-ink-500 ${className}`}>
      <Spinner className="h-5 w-5" />
      {label}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className="h-4 animate-pulse rounded bg-ink-200/60"
              style={{ width: `${Math.max(12, 30 - c * 4)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ error, onRetry, className = '', showIcon = true }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-300
                  bg-brand-50 px-4 py-3 text-sm text-brand-900 ${className}`}
    >
      <div className={`flex items-start ${showIcon ? 'gap-2.5' : ''}`}>
        {showIcon && (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-600">
            <path
              fillRule="evenodd"
              d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM9.45 5.75a.9.9 0 011.8 0v4.1a.9.9 0 01-1.8 0v-4.1zM10 13.4a1.05 1.05 0 110 2.1 1.05 1.05 0 010-2.1z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span>{error.message}</span>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary btn-sm">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action, icon = 'inbox', showIcon = true }) {
  const icons = {
    inbox: 'M2.5 7.5h4l1 2h5l1-2h4M2.5 7.5v6a2 2 0 002 2h11a2 2 0 002-2v-6a2 2 0 00-2-2h-13a2 2 0 00-2 2z',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zm5.5-1.5L21 21',
    check: 'M5 13l4 4L19 7',
  };
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {showIcon && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="h-9 w-9 text-ink-300">
          <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon] ?? icons.inbox} />
        </svg>
      )}
      <p className={`${showIcon ? 'mt-3' : ''} text-sm font-semibold text-ink-700`}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}