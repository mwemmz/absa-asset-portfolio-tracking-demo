import { useEffect, useState } from 'react';

const GAUGE_R = 24;
const GAUGE_C = 2 * Math.PI * GAUGE_R;
const STAGGER_MS = 50;
const SETTLE_MS = 700;

function Gauge({ pct, label, arcClass, index = 0, theme = 'light' }) {
  // The arc lands on its value after the first paint, so the fill reads as motion.
  const [started, setStarted] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setStarted(true));
    const timer = setTimeout(() => setSettled(true), SETTLE_MS + index * STAGGER_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [index]);

  const target = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const shown = started ? target : 0;
  const offset = GAUGE_C * (1 - shown / 100);
  const onDark = theme === 'dark';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg viewBox="0 0 56 56" aria-hidden="true" className={`h-10 w-10 sm:h-14 sm:w-14 ${arcClass}`}>
          <circle
            cx="28"
            cy="28"
            r={GAUGE_R}
            fill="none"
            strokeWidth="5"
            className={onDark ? 'stroke-white/15' : 'stroke-ink-200/70'}
          />
          <circle
            cx="28"
            cy="28"
            r={GAUGE_R}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={GAUGE_C}
            strokeDashoffset={offset}
            transform="rotate(-90 28 28)"
            className="gauge-arc"
            style={{ transitionDelay: settled ? '0ms' : `${index * STAGGER_MS}ms` }}
          />
        </svg>
        <span
          className={`absolute inset-0 grid place-items-center text-[10px] font-bold tabular-nums sm:text-xs ${
            onDark ? 'text-white' : 'text-ink-700'
          }`}
        >
          {Math.round(shown)}%
        </span>
      </div>
      <span
        className={`text-[9px] font-semibold uppercase leading-none tracking-[0.06em] sm:text-[10px] ${
          onDark ? 'text-ink-400' : 'text-ink-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

const SURFACES = {
  light: {
    tile: 'card',
    label: 'text-[11px] font-semibold uppercase leading-tight tracking-label text-ink-500 sm:text-xs',
    value: '',
    sub: 'mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-500 sm:text-xs',
    footerBorder: 'border-ink-100',
    activeOffset: 'ring-offset-white',
    tones: {
      ink: { icon: 'bg-ink-100 text-ink-600', value: 'text-ink-900', arc: 'text-ink-700' },
      brand: { icon: 'bg-brand-50 text-brand-600', value: 'text-brand-700', arc: 'text-brand-600' },
      emerald: {
        icon: 'bg-emerald-50 text-emerald-600',
        value: 'text-emerald-700',
        arc: 'text-emerald-600',
      },
      amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700', arc: 'text-amber-500' },
      orange: {
        icon: 'bg-orange-50 text-orange-600',
        value: 'text-orange-700',
        arc: 'text-orange-500',
      },
    },
  },
  // Instrument tiles inside the dark hero panel.
  dark: {
    tile: 'rounded-xl border border-white/10 bg-white/[0.06]',
    label: 'text-[11px] font-semibold uppercase leading-tight tracking-label text-ink-300 sm:text-xs',
    value: 'text-white',
    sub: 'mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-400 sm:text-xs',
    footerBorder: 'border-white/10',
    activeOffset: 'ring-offset-ink-950',
    tones: {
      ink: { icon: '', value: 'text-white', arc: 'text-ink-200' },
      brand: { icon: '', value: 'text-white', arc: 'text-brand-400' },
      emerald: { icon: '', value: 'text-white', arc: 'text-emerald-400' },
      amber: { icon: '', value: 'text-white', arc: 'text-amber-400' },
      orange: { icon: '', value: 'text-white', arc: 'text-orange-400' },
    },
  },
};

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'ink',
  onClick,
  active = false,
  footer,
  gauge,
  surface = 'light',
}) {
  const s = SURFACES[surface] ?? SURFACES.light;
  const t = s.tones[tone] ?? s.tones.ink;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`relative flex h-full w-full flex-col items-start p-3.5 text-left sm:p-4 xl:p-5 ${s.tile} ${
        onClick ? 'card-lift' : ''
      } ${active ? `ring-2 ring-brand-400 ring-offset-2 ${s.activeOffset}` : ''}`}
    >
      {gauge && (
        <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
          <Gauge pct={gauge.pct} label={gauge.label} arcClass={t.arc} index={gauge.index} theme={surface} />
        </div>
      )}

      <div className={`w-full ${gauge ? 'pr-12 sm:pr-16' : ''}`}>
        <p className={s.label}>{label}</p>
        <p
          className={`mt-1.5 text-[1.375rem] font-bold leading-none tabular-nums tracking-tight sm:mt-2.5 sm:text-[1.75rem] xl:text-3xl ${t.value} ${s.value}`}
        >
          {value}
        </p>
        {sublabel && <p className={s.sub}>{sublabel}</p>}
      </div>
      {footer && <div className={`mt-auto w-full border-t pt-2.5 sm:pt-3 ${s.footerBorder}`}>{footer}</div>}
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
