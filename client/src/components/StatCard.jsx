export function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'ink',
  onClick,
  active = false,
  footer,
}) {
  const tones = {
    ink: { icon: 'bg-ink-100 text-ink-600', value: 'text-ink-900', ring: 'hover:border-ink-300' },
    brand: { icon: 'bg-brand-50 text-brand-600', value: 'text-brand-700', ring: 'hover:border-brand-300' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700', ring: 'hover:border-emerald-300' },
    amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700', ring: 'hover:border-amber-300' },
    orange: { icon: 'bg-orange-50 text-orange-600', value: 'text-orange-700', ring: 'hover:border-orange-300' },
  };
  const t = tones[tone] ?? tones.ink;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`card flex h-full w-full flex-col items-start p-3.5 text-left transition-colors sm:p-4 xl:p-5 ${t.ring} ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'border-brand-400 ring-2 ring-brand-200' : ''}`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-500 sm:text-xs">
          {label}
        </p>
        {icon && (
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5 sm:h-8 sm:w-8 sm:[&>svg]:h-5 sm:[&>svg]:w-5 ${t.icon}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={`mt-1.5 text-2xl font-bold leading-none tabular-nums tracking-tight sm:mt-2.5 sm:text-[1.75rem] xl:text-3xl ${t.value}`}
      >
        {value}
      </p>
      {sublabel && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-500 sm:text-xs">
          {sublabel}
        </p>
      )}
      {footer && <div className="mt-auto w-full border-t border-ink-100 pt-2.5 sm:pt-3">{footer}</div>}
    </Tag>
  );
}

/* ------------------------------------------------------------- icons --- */
const paths = {
  truck: 'M3 7a2 2 0 012-2h8a2 2 0 012 2v8H3V7zm11 3h3.2a2 2 0 011.6.8l1.7 2.2a2 2 0 01.5 1.3V17h-7v-7zM7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  play: 'M8 5.5v13l10-6.5-10-6.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-6 6 6 6 0 01-6-6V8zM12 17v4',
  bell: 'M12 3a6 6 0 00-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 00-6-6zm-2.5 15a2.5 2.5 0 005 0',
  alert: 'M12 3l9.5 17H2.5L12 3zm0 6v5m0 3v.5',
  shield: 'M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6l8-3z',
};

export function Icon({ name, className = 'h-5 w-5', filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={paths[name] ?? paths.truck} />
    </svg>
  );
}

export function Card({ title, action, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}