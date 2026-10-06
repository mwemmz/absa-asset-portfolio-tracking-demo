import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePolling, useTicker } from '../lib/usePolling.js';
import { DEVICE_STATUS, VEHICLE_STATUS } from '../lib/constants.js';
import { formatKm, formatPct, formatSpeed, formatZmw, timeAgo } from '../lib/format.js';
import { DevicePill, StatusPill } from '../components/Badges.jsx';
import { EmptyState, ErrorBanner, SkeletonRows } from '../components/Feedback.jsx';

const STATUS_TABS = [
  { value: '', label: 'All vehicles' },
  { value: 'moving', label: 'Moving' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'offline', label: 'Offline' },
];

const SORTS = [
  { value: 'reg', label: 'Registration' },
  { value: 'status', label: 'Status' },
  { value: 'lastUpdate', label: 'Last update' },
  { value: 'speed', label: 'Speed' },
  { value: 'uptimePct', label: 'Uptime' },
];

export default function Vehicles() {
  const now = useTicker(10000);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState('reg');

  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const routeId = params.get('route') ?? '';

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') === search) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set('q', search.trim());
      else next.delete('q');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [search, params, setParams]);

  const vehicles = usePolling(
    () => api.vehicles({ status: status || undefined, q: q || undefined, routeId: routeId || undefined }),
    { intervalMs: 5000, deps: [status, q, routeId] },
  );
  const routes = usePolling(() => api.routes(), { intervalMs: 0 });

  const list = useMemo(() => {
    const rows = [...(vehicles.data ?? [])];
    const rank = { offline: 0, stopped: 1, moving: 2 };
    rows.sort((a, b) => {
      switch (sort) {
        case 'status':
          return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.reg.localeCompare(b.reg);
        case 'lastUpdate':
          return new Date(b.lastUpdate ?? 0) - new Date(a.lastUpdate ?? 0);
        case 'speed':
          return b.speed - a.speed;
        case 'uptimePct':
          return a.uptimePct - b.uptimePct;
        default:
          return a.reg.localeCompare(b.reg);
      }
    });
    return rows;
  }, [vehicles.data, sort]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  const routeName = (id) => (routes.data ?? []).find((r) => r.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Vehicles</h1>
          <p className="page-sub">
            {list.length} financed vehicle{list.length === 1 ? '' : 's'} in the monitored portfolio.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- filters */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            >
              <path d="M11 18a7 7 0 100-14 7 7 0 000 14zm5.5-1.5L21 21" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search registration, driver, customer or model"
              aria-label="Search vehicles"
              className="input pl-9"
            />
          </div>

          <select
            value={routeId}
            onChange={(e) => setParam('route', e.target.value)}
            aria-label="Filter by corridor"
            className="input w-auto min-w-[14rem]"
          >
            <option value="">All corridors</option>
            {(routes.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort vehicles"
            className="input w-auto"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t border-ink-100 pt-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              onClick={() => setParam('status', tab.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                status === tab.value
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {tab.value && (
                <span className={`h-1.5 w-1.5 rounded-full ${VEHICLE_STATUS[tab.value].dot}`} />
              )}
              {tab.label}
            </button>
          ))}

          {(status || q || routeId) && (
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="btn-ghost btn-sm ml-auto"
            >
              Clear filters
            </button>
          )}

          {routeId && (
            <span className="ml-auto text-xs text-ink-500">Corridor: {routeName(routeId)}</span>
          )}
        </div>
      </div>

      <ErrorBanner error={vehicles.error} onRetry={vehicles.refresh} />

      {/* ------------------------------------------------------------ table */}
      <div className="card table-wrap">
        {vehicles.loading && !list.length ? (
          <SkeletonRows rows={8} cols={6} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No vehicles match your filters"
            description="Try a different registration, driver or status."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
                className="btn-secondary btn-sm"
              >
                Clear filters
              </button>
            }
            icon="search"
          />
        ) : (
          <>
            {/* Phones get one card per vehicle. The full table needs ~1024px. */}
            <ul className="divide-y divide-ink-100 sm:hidden">
              {list.map((v) => (
                <li key={v.id} className="px-3.5 py-3">
                  <Link to={`/vehicles/${v.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-ink-900">{v.reg}</p>
                        <p className="truncate text-xs text-ink-500">
                          {v.driver} &middot; {v.customer}
                        </p>
                      </div>
                      <StatusPill status={v.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-600">
                      <DevicePill status={v.deviceStatus} />
                      <span className="tabular-nums">{formatSpeed(v.speed)}</span>
                      <span className="tabular-nums">{formatPct(v.uptimePct)} uptime</span>
                      <span className="tabular-nums text-ink-400">{timeAgo(v.lastUpdate, now)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-xs text-ink-400">{v.routeCorridor}</p>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden sm:block">
          <table className="w-full min-w-[64rem]">
            <thead className="border-b border-ink-200 bg-canvas/50">
              <tr>
                <th className="th">Registration</th>
                <th className="th">Driver</th>
                <th className="th">Status</th>
                <th className="th">Device</th>
                <th className="th">Speed</th>
                <th className="th">Corridor</th>
                <th className="th">Uptime</th>
                <th className="th">Odometer</th>
                <th className="th">Value</th>
                <th className="th">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((v) => (
                <tr
                  key={v.id}
                  className={`transition-colors hover:bg-canvas/60 ${
                    v.deviceStatus === 'tampered' ? 'bg-brand-50/40' : ''
                  }`}
                >
                  <td className="td">
                    <Link to={`/vehicles/${v.id}`} className="link font-mono font-semibold">
                      {v.reg}
                    </Link>
                    <p className="text-xs text-ink-400">{v.makeModel}</p>
                  </td>
                  <td className="td">
                    <span className="block">{v.driver}</span>
                    <span className="text-xs text-ink-400">{v.customer}</span>
                  </td>
                  <td className="td">
                    <StatusPill status={v.status} />
                  </td>
                  <td className="td">
                    <DevicePill status={v.deviceStatus} />
                  </td>
                  <td className="td tabular-nums">{formatSpeed(v.speed)}</td>
                  <td className="td max-w-[16rem] truncate text-ink-500">{v.routeCorridor}</td>
                  <td className="td tabular-nums">{formatPct(v.uptimePct)}</td>
                  <td className="td tabular-nums text-ink-500">{formatKm(v.odometerKm)}</td>
                  <td className="td tabular-nums text-ink-500">{formatZmw(v.assetValueZmw, { compact: true })}</td>
                  <td className="td text-ink-500">{timeAgo(v.lastUpdate, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-ink-400">
        Device states: {Object.keys(DEVICE_STATUS).join(', ')}. Uptime is the share of simulated time
        the tracking device was reporting.
      </p>
    </div>
  );
}