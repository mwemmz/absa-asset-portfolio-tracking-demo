import { DEMO_LABEL } from '../lib/constants.js';

/**
 * The demo disclosure. Rendered on every screen - there is no route that omits
 * it. Keep this prominent and unmissable.
 */
export function DemoBadge({ variant = 'header', className = '' }) {
  if (variant === 'hero') {
    return (
      <div
        className={`inline-flex items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 ${className}`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
        </span>
        <span className="text-sm font-semibold text-brand-800">{DEMO_LABEL}</span>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        role="status"
        className={`flex items-start gap-2.5 border-b border-brand-200 bg-brand-50 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 ${className}`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-600">
          <path
            fillRule="evenodd"
            d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM9.45 5.75a.9.9 0 011.8 0v4.1a.9.9 0 01-1.8 0v-4.1zM10 13.4a1.05 1.05 0 110 2.1 1.05 1.05 0 010-2.1z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-[11px] leading-snug text-brand-900 sm:text-xs sm:leading-relaxed">
          <strong className="font-semibold">{DEMO_LABEL}.</strong>
          <span className="sm:hidden"> Simulated data. Not a live tracking system.</span>
          <span className="hidden sm:inline">
            {' '}
            Vehicle positions, drivers and incidents are randomly simulated for demonstration only.
            This is not a live fleet-tracking system and contains no Absa customer data.
          </span>
        </p>
      </div>
    );
  }

  return (
    <span
      title={DEMO_LABEL}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2 py-1 text-[11px]
                  font-semibold uppercase tracking-wide text-white ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      Concept demo
    </span>
  );
}

export default DemoBadge;