import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { DEMO_LABEL } from '../lib/constants.js';
import DemoBadge from './DemoBadge.jsx';
import { Spinner } from './Feedback.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/map', label: 'Live map', icon: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14' },
  { to: '/vehicles', label: 'Vehicles', icon: 'M3 7a2 2 0 012-2h8a2 2 0 012 2v8H3V7zm11 3h3.2a2 2 0 011.6.8l1.7 2.2a2 2 0 01.5 1.3V17h-7v-7zM7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { to: '/alerts', label: 'Alerts', icon: 'M12 3a6 6 0 00-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 00-6-6zm-2.5 15a2.5 2.5 0 005 0' },
  { to: '/report', label: 'Monthly report', icon: 'M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5M9 13h6M9 17h4' },
];

function pageTitle(pathname) {
  return (
    NAV.find((n) => (n.end ? n.to === pathname : pathname.startsWith(n.to)))?.label ?? 'Dashboard'
  );
}

function ResetButton() {
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;

  const reset = async () => {
    if (!window.confirm('Reset the demo to its clean seed data? You will be signed out.')) return;
    setBusy(true);
    try {
      await api.resetDemo();
      window.localStorage.clear();
      window.location.assign('/login');
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      className="btn btn-sm border border-ink-700 text-ink-200 hover:bg-ink-800 disabled:opacity-50"
      title="Restore the clean seed dataset"
    >
      {busy && <Spinner className="h-3 w-3" />}
      Reset demo
    </button>
  );
}

function NavList({ openAlerts, offline, onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto p-2.5">
      <ul className="space-y-0.5">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                }`
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-4 w-4 shrink-0"
              >
                <path d={item.icon} />
              </svg>
              <span className="flex-1 truncate">{item.label}</span>
              {item.to === '/alerts' && openAlerts > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white ring-1 ring-white/30">
                  {openAlerts}
                </span>
              )}
              {item.to === '/vehicles' && offline > 0 && (
                <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ink-200">
                  {offline}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function UserPanel({ user, signOut }) {
  return (
    <div className="space-y-3 border-t border-ink-800 p-3">
      <div className="rounded-lg bg-ink-800/60 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
            {(user?.name ?? '?').slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-ink-400">
              {user?.role}
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <ResetButton />
        <button
          type="button"
          onClick={signOut}
          className="btn btn-sm flex-1 border border-ink-700 text-ink-200 hover:bg-ink-800"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: stats } = usePolling(() => api.stats(), { intervalMs: 5000 });

  const openAlerts = stats?.openAlerts ?? 0;
  const offline = stats?.offline ?? 0;

  // Close the drawer on navigation and stop the page scrolling behind it.
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-ink-50 lg:flex-row">
      {/* ------------------------------------------------------ desktop sidebar */}
      <aside className="no-print hidden shrink-0 flex-col bg-ink-900 text-ink-100 lg:flex lg:h-screen lg:w-60 lg:sticky lg:top-0 xl:w-64">
        <div className="flex items-center gap-2.5 border-b border-ink-800 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">
            A
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white">Absa</p>
            <p className="truncate text-[11px] leading-tight text-ink-400">Asset Portfolio Tracking</p>
          </div>
        </div>

        <div className="border-b border-ink-800 px-3 py-3">
          <DemoBadge className="w-full justify-center" />
          <p className="mt-2 text-center text-[10px] leading-tight text-ink-500">
            Zambia &middot; financed vehicles
          </p>
        </div>

        <NavList openAlerts={openAlerts} offline={offline} />
        <UserPanel user={user} signOut={signOut} />
      </aside>

      {/* ------------------------------------------------------- mobile drawer */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-900/60 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col bg-ink-900 text-ink-100 shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-ink-800 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">
                A
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight text-white">Absa</p>
                <p className="truncate text-[11px] leading-tight text-ink-400">Asset Portfolio Tracking</p>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMenuOpen(false)}
                className="btn btn-sm px-2 text-ink-300 hover:bg-ink-800"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="border-b border-ink-800 px-3 py-3">
              <DemoBadge className="w-full justify-center" />
            </div>

            <NavList openAlerts={openAlerts} offline={offline} onNavigate={() => setMenuOpen(false)} />
            <UserPanel user={user} signOut={signOut} />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBadge variant="banner" className="no-print" />

        {/* mobile top bar */}
        <div className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-white px-3 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            className="btn btn-sm -ml-1 px-2 text-ink-700 hover:bg-ink-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold leading-tight text-ink-900">
              {pageTitle(location.pathname)}
            </h1>
            <p className="truncate text-[10px] leading-tight text-ink-500">
              {DEMO_LABEL} &middot; simulated data
            </p>
          </div>
          <LivePill stats={stats} />
        </div>

        {/* desktop header */}
        <header className="no-print hidden items-center justify-between gap-4 border-b border-ink-200 bg-white px-6 py-3 lg:flex">
          <div>
            <h1 className="text-base font-bold leading-tight text-ink-900">
              {pageTitle(location.pathname)}
            </h1>
            <p className="text-xs text-ink-500">{DEMO_LABEL}</p>
          </div>
          <LiveIndicator stats={stats} />
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>

        <footer className="no-print border-t border-ink-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-ink-500 sm:px-6">
          <strong className="font-semibold text-ink-700">Concept demo.</strong> All vehicles,
          drivers, positions and incidents on this dashboard are simulated. Not a live tracking
          platform. No Absa customer data is shown.
        </footer>
      </div>
    </div>
  );
}

function LivePill({ stats }) {
  const moving = stats?.active ?? 0;
  const total = stats?.total ?? 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold tabular-nums text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      {moving}/{total}
    </span>
  );
}

function LiveIndicator({ stats }) {
  const total = stats?.total ?? 0;
  const moving = stats?.active ?? 0;
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-wide text-ink-500">Fleet</p>
        <p className="text-sm font-bold tabular-nums text-ink-900">
          {moving}
          <span className="text-ink-400"> / {total}</span> moving
        </p>
      </div>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
      </span>
    </div>
  );
}

export default Layout;