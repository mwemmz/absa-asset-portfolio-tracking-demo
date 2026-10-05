import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePolling, useTicker } from '../lib/usePolling.js';
import { ALERT_TYPE, GEOFENCE_TYPE, VEHICLE_STATUS } from '../lib/constants.js';
import { formatSpeed, timeAgo } from '../lib/format.js';
import VehicleMap from '../components/VehicleMap.jsx';
import { DevicePill, StatusPill } from '../components/Badges.jsx';
import { EmptyState, ErrorBanner, Spinner } from '../components/Feedback.jsx';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'moving', label: 'Moving' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'offline', label: 'Offline' },
];

export default function LiveMap() {
  const navigate = useNavigate();
  const now = useTicker(10000);
  const [params, setParams] = useSearchParams();

  const selectedId = params.get('vehicle') ? Number(params.get('vehicle')) : null;
  const statusFilter = params.get('status') ?? '';
  const [showGeofences, setShowGeofences] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [fitKey, setFitKey] = useState('initial');

  const vehicles = usePolling(() => api.vehicles(), { intervalMs: 5000 });
  const geofences = usePolling(() => api.geofences(), { intervalMs: 0 });
  const alerts = usePolling(() => api.alerts({ limit: 60 }), { intervalMs: 10000 });

  const selected = useMemo(
    () => (vehicles.data ?? []).find((v) => v.id === selectedId) ?? null,
    [vehicles.data, selectedId],
  );

  const history = usePolling(() => api.history(selectedId, { hours: 6, limit: 1200 }), {
    intervalMs: 0,
    enabled: !!selectedId,
    deps: [selectedId],
  });

  const route = usePolling(() => api.vehicleRoute(selectedId), {
    intervalMs: 0,
    enabled: !!selectedId,
    deps: [selectedId],
  });

  const visible = useMemo(
    () => (vehicles.data ?? []).filter((v) => !statusFilter || v.status === statusFilter),
    [vehicles.data, statusFilter],
  );

  const openAlerts = useMemo(
    () => (alerts.data ?? []).filter((a) => a.status !== 'resolved' && a.lat != null),
    [alerts.data],
  );

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  const counts = useMemo(() => {
    const list = vehicles.data ?? [];
    return {
      moving: list.filter((v) => v.status === 'moving').length,
      stopped: list.filter((v) => v.status === 'stopped').length,
      offline: list.filter((v) => v.status === 'offline').length,
    };
  }, [vehicles.data]);

  if (vehicles.error) {
    return <ErrorBanner error={vehicles.error} onRetry={vehicles.refresh} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Live map</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {visible.length} of {vehicles.data?.length ?? 0} simulated vehicles, refreshed every 5
            seconds. Positions are simulated, not GPS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vehicles.loading && <Spinner className="h-4 w-4 text-ink-400" />}
          <span className="text-xs text-ink-400">
            Updated {vehicles.lastUpdated ? timeAgo(vehicles.lastUpdated, now) : '-'}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------- controls */}
      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 card px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-ink-100 p-1">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            const count =
              f.value === ''
                ? vehicles.data?.length ?? 0
                : counts[f.value] ?? 0;
            return (
              <button
                key={f.value || 'all'}
                type="button"
                onClick={() => setParam('status', f.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-white text-ink-900 shadow-card' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {f.value && (
                  <span className={`h-1.5 w-1.5 rounded-full ${VEHICLE_STATUS[f.value].dot}`} />
                )}
                {f.label}
                <span className="tabular-nums text-ink-400">{count}</span>
              </button>
            );
          })}
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={showGeofences}
            onChange={(e) => setShowGeofences(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Geofences
        </label>

        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={showAlerts}
            onChange={(e) => setShowAlerts(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Open alerts
        </label>

        <button
          type="button"
          onClick={() => setFitKey((k) => (k === 'initial' ? 'fit-1' : `fit-${Date.now()}`))}
          className="btn-secondary btn-sm"
        >
          Fit to fleet
        </button>

        {selectedId && (
          <button
            type="button"
            onClick={() => setParam('vehicle', null)}
            className="btn-ghost btn-sm ml-auto"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {/* ------------------------------------------------------------ map */}
        <div className="card relative overflow-hidden xl:col-span-3">
          <VehicleMap
            className="h-[46vh] min-h-[19rem] w-full sm:h-[56vh] sm:min-h-[24rem] xl:h-[62vh] xl:min-h-[26rem]"
            vehicles={visible}
            geofences={geofences.data ?? []}
            selectedId={selectedId}
            onSelect={(v) => setParam('vehicle', v.id)}
            history={history.data}
            plannedRoute={showGeofences ? route.data?.points : null}
            alertMarkers={showAlerts ? openAlerts : []}
            showGeofences={showGeofences}
            fitKey={fitKey}
            followSelected={false}
          />

          {/* legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] space-y-1.5 rounded-lg border border-ink-200 bg-white/95 p-3 text-[11px] shadow-pop backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Legend</p>
            {['moving', 'stopped', 'offline'].map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${VEHICLE_STATUS[key].dot}`} />
                <span className="text-ink-700">{VEHICLE_STATUS[key].label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-brand-600">
                <svg viewBox="0 0 24 24" fill="#fff" className="h-2 w-2" aria-hidden>
                  <path d="M12 3 1 21h22L12 3zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z" />
                </svg>
              </span>
              <span className="text-ink-700">Tampered device</span>
            </div>
            <div className="mt-1 flex items-center gap-2 border-t border-ink-100 pt-1.5">
              <span className="h-0.5 w-5 bg-brand-600" />
              <span className="text-ink-700">6h history</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-ink-800 opacity-40" />
              <span className="text-ink-700">Planned corridor</span>
            </div>
          </div>

          {selected && (
            <div className="absolute right-3 top-3 z-[400] w-72 rounded-lg border border-ink-200 bg-white/97 p-4 shadow-pop backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-bold text-ink-900">{selected.reg}</p>
                  <p className="text-xs text-ink-500">{selected.makeModel}</p>
                </div>
                <StatusPill status={selected.status} />
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                {[
                  ['Driver', selected.driver],
                  ['Speed', formatSpeed(selected.speed)],
                  ['Device', null],
                  ['Corridor', selected.routeCorridor],
                  ['Last update', timeAgo(selected.lastUpdate, now)],
                ].map(([k, v]) =>
                  v == null ? (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <dt className="text-ink-500">{k}</dt>
                      <dd>
                        <DevicePill status={selected.deviceStatus} />
                      </dd>
                    </div>
                  ) : (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-ink-500">{k}</dt>
                      <dd className="text-right font-medium text-ink-800">{v}</dd>
                    </div>
                  ),
                )}
              </dl>
              <button
                type="button"
                onClick={() => navigate(`/vehicles/${selected.id}`)}
                className="btn-primary btn-sm mt-3 w-full"
              >
                Open vehicle detail
              </button>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <div className="space-y-4">
          {selectedId && (
            <section className="card">
              <header className="card-header">
                <h2 className="card-title">Vehicle list</h2>
                <span className="text-xs text-ink-400">{visible.length}</span>
              </header>
              <div className="max-h-[18rem] divide-y divide-ink-100 overflow-y-auto">
                {visible.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setParam('vehicle', v.id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      v.id === selectedId ? 'bg-brand-50' : 'hover:bg-ink-50'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        v.deviceStatus === 'tampered'
                          ? 'bg-brand-600'
                          : VEHICLE_STATUS[v.status].dot
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-semibold text-ink-900">
                        {v.reg}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500">{v.driver}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] tabular-nums text-ink-500">
                      {v.status === 'moving' ? `${Math.round(v.speed)} km/h` : VEHICLE_STATUS[v.status].label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!selectedId && visible.length === 0 && !vehicles.loading && (
            <div className="card">
              <EmptyState title="No vehicles match" description="Clear the status filter." />
            </div>
          )}

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Geofences</h2>
              <span className="text-xs text-ink-400">{geofences.data?.length ?? 0}</span>
            </header>
            <div className="divide-y divide-ink-100">
              {(geofences.data ?? []).map((g) => {
                const inside = (vehicles.data ?? []).filter((v) => vehicleInsideZone(v, g)).length;
                const meta = GEOFENCE_TYPE[g.type];
                return (
                  <div key={g.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ background: meta?.fill ?? '#6b7280' }}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium text-ink-800">{g.name}</span>
                      </span>
                      <span
                        className={`chip shrink-0 ${
                          inside > 0
                            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                            : 'bg-ink-100 text-ink-500 ring-1 ring-ink-200'
                        }`}
                      >
                        {inside} inside
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{g.description}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Open alerts</h2>
              <span className="text-xs text-ink-400">{openAlerts.length}</span>
            </header>
            <div className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
              {openAlerts.length === 0 ? (
                <EmptyState title="Nothing open" description="No unresolved alerts right now." icon="check" />
              ) : (
                openAlerts.slice(0, 20).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/alerts?focus=${a.id}`)}
                    className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-ink-50"
                  >
                    <p className="truncate text-xs font-semibold text-ink-800">{a.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-500">
                      <span className="font-mono">{a.vehicleReg}</span>
                      {' · '}
                      {ALERT_TYPE[a.type]?.short ?? a.type}
                      {' · '}
                      {timeAgo(a.createdAt, now)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Ray-casting point-in-polygon, used only to count vehicles inside a zone. */
function vehicleInsideZone(vehicle, geofence) {
  const [lat, lng] = [vehicle.lat, vehicle.lng];
  if (lat == null || lng == null) return false;
  let inside = false;
  for (let i = 0, j = geofence.polygon.length - 1; i < geofence.polygon.length; j = i, i += 1) {
    const [yi, xi] = geofence.polygon[i];
    const [yj, xj] = geofence.polygon[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}