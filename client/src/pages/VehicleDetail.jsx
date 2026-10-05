import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePolling, useTicker } from '../lib/usePolling.js';
import {
  duration,
  formatDateTime,
  formatFull,
  formatKm,
  formatMetres,
  formatNumber,
  formatPct,
  formatSpeed,
  formatZmw,
  timeAgo,
} from '../lib/format.js';
import VehicleMap from '../components/VehicleMap.jsx';
import { AlertStatusPill, DevicePill, SeverityPill, StatusPill } from '../components/Badges.jsx';
import { Card } from '../components/StatCard.jsx';
import { EmptyState, ErrorBanner, Loading, Spinner } from '../components/Feedback.jsx';

const RANGE_OPTIONS = [
  { value: 3, label: '3h' },
  { value: 6, label: '6h' },
  { value: 12, label: '12h' },
  { value: 24, label: '24h' },
];

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useTicker(10000);
  const vehicleId = Number(id);

  const [hours, setHours] = useState(6);
  const [fitKey, setFitKey] = useState('detail');

  const vehicle = usePolling(() => api.vehicle(vehicleId), { intervalMs: 5000, deps: [vehicleId] });
  const geofences = usePolling(() => api.geofences(), { intervalMs: 0 });
  const route = usePolling(() => api.vehicleRoute(vehicleId), { intervalMs: 0, enabled: !!vehicleId });
  const history = usePolling(() => api.history(vehicleId, { hours, limit: 2000 }), {
    intervalMs: 15000,
    enabled: !!vehicleId,
    deps: [vehicleId, hours],
  });

  const v = vehicle.data;

  const journey = useMemo(() => buildJourney(history.data ?? []), [history.data]);

  if (vehicle.error) return <ErrorBanner error={vehicle.error} onRetry={vehicle.refresh} />;
  if (!v) return <Loading label="Loading vehicle" />;

  const openAlerts = (v.recentAlerts ?? []).filter((a) => a.status !== 'resolved');

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/vehicles" className="text-xs font-medium text-ink-500 hover:text-brand-700">
            &larr; All vehicles
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{v.reg}</h1>
            <StatusPill status={v.status} />
            <DevicePill status={v.deviceStatus} />
            {v.deviationM > 100 && (
              <span className="chip bg-orange-50 text-orange-800 ring-1 ring-orange-300">
                {formatMetres(v.deviationM)} off route
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {v.makeModel} &middot; {v.category} &middot; {v.driver}
          </p>
        </div>

        <div className="text-right text-xs text-ink-500">
          <p>
            Last update{' '}
            <span className="font-medium text-ink-700">{timeAgo(v.lastUpdate, now)}</span>
          </p>
          <p className="mt-0.5">{formatFull(v.lastUpdate)} Lusaka time</p>
          {vehicle.loading && <Spinner className="mt-2 inline h-3.5 w-3.5" />}
        </div>
      </div>

      {/* -------------------------------------------------------- key figures */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <Figure label="Speed" value={formatSpeed(v.speed)} />
        <Figure
          label={v.status === 'stopped' ? 'Stopped for' : v.status === 'offline' ? 'Offline for' : 'Moving'}
          value={
            v.status === 'stopped'
              ? duration(v.stoppedSince, now)
              : v.status === 'offline'
                ? duration(v.offlineSince, now)
                : 'Active'
          }
          tone={v.status === 'moving' ? 'ok' : v.status === 'stopped' ? 'warn' : 'bad'}
        />
        <Figure label="Odometer" value={formatKm(v.odometerKm)} />
        <Figure label="Uptime" value={formatPct(v.uptimePct)} tone={v.uptimePct < 85 ? 'warn' : 'ok'} />
        <Figure label="Open alerts" value={formatNumber(openAlerts.length)} tone={openAlerts.length ? 'bad' : 'ok'} />
        <Figure label="Asset value" value={formatZmw(v.assetValueZmw, { compact: true })} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ------------------------------------------------------------- map */}
        <div className="space-y-5 xl:col-span-2">
          <div className="card overflow-hidden">
            <header className="card-header flex-wrap">
              <h2 className="card-title">Route history</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5">
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHours(opt.value)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        hours === opt.value ? 'bg-white text-ink-900 shadow-card' : 'text-ink-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFitKey(`fit-${Date.now()}`)}
                  className="btn-secondary btn-sm"
                >
                  Fit
                </button>
              </div>
            </header>
            <VehicleMap
              className="h-[19rem] w-full sm:h-[24rem] lg:h-[28rem]"
              vehicles={[v]}
              geofences={geofences.data ?? []}
              selectedId={v.id}
              history={history.data}
              plannedRoute={route.data?.points}
              showRoutes
              fitKey={fitKey}
              alertMarkers={(v.recentAlerts ?? []).filter((a) => a.status !== 'resolved' && a.lat != null)}
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-5 rounded bg-brand-600" /> Recorded journey
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-5 rounded bg-ink-800 opacity-40" /> Planned corridor
                {route.data ? ` (${route.data.corridor})` : ''}
              </span>
              <span>{history.data?.length ?? 0} points plotted</span>
            </div>
          </div>

          {/* ------------------------------------------------------ timeline */}
          <Card title="Journey timeline" bodyClassName="p-5">
            {history.loading && !journey.length ? (
              <Loading label="Building timeline" />
            ) : journey.length === 0 ? (
              <EmptyState title="No journey recorded" description="Nothing was reported in this window." />
            ) : (
              <ol className="relative space-y-0 border-l border-ink-200 pl-5">
                {journey.map((step, index) => (
                  <li key={step.ts} className="relative pb-5 last:pb-0">
                    <span
                      className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                        step.kind === 'stop' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                        {step.label}
                        {step.current && (
                          <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                            latest
                          </span>
                        )}
                      </p>
                      <p className="text-xs tabular-nums text-ink-500">{formatDateTime(step.ts)}</p>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{step.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <div className="space-y-5">
          <Card title="Asset and agreement" bodyClassName="p-5">
            <dl className="space-y-2.5 text-sm">
              {[
                ['Customer', v.customer],
                ['Agreement', v.agreementRef],
                ['Asset value', formatZmw(v.assetValueZmw)],
                ['Home depot', v.homeDepot],
                ['Corridor', v.routeCorridor],
                ['Driver phone', v.driverPhone],
              ].map(([k, val]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-ink-500">{k}</dt>
                  <dd className="text-right font-medium text-ink-800">{val || '-'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Telemetry" bodyClassName="p-5">
            <dl className="space-y-2.5 text-sm">
              {[
                ['Status', <StatusPill key="s" status={v.status} />],
                ['Device', <DevicePill key="d" status={v.deviceStatus} />],
                ['Last position', formatFull(v.lastUpdate)],
                ['Heading', `${Math.round(v.heading)}°`],
                ['Deviation', formatMetres(v.deviationM)],
                ['Last event', formatFull(v.lastEventAt)],
              ].map(([k, val]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right font-medium text-ink-800">{val}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card
            title="Recent alerts"
            action={
              <Link to={`/alerts?vehicleId=${v.id}`} className="btn-ghost btn-sm">
                View all
              </Link>
            }
            bodyClassName="divide-y divide-ink-100"
          >
            {(v.recentAlerts ?? []).length === 0 ? (
              <EmptyState title="No alerts" description="Nothing has been raised for this vehicle." icon="check" />
            ) : (
              (v.recentAlerts ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`/alerts?focus=${a.id}`)}
                  className="block w-full px-5 py-3 text-left transition-colors hover:bg-ink-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{a.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {formatDateTime(a.createdAt)} &middot; {timeAgo(a.createdAt, now)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <AlertStatusPill status={a.status} />
                      <SeverityPill severity={a.severity} />
                    </span>
                  </div>
                </button>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, tone = 'ink' }) {
  const tones = {
    ink: 'text-ink-900',
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-brand-700',
  };
  return (
    <div className="card flex h-full flex-col p-3 sm:p-4">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-500">
        {label}
      </p>
      <p className={`mt-1 text-base font-bold leading-tight tabular-nums sm:mt-1.5 sm:text-lg ${tones[tone]}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Collapse the raw position feed into readable journey steps by grouping
 * consecutive fixes with the same status. Stops shorter than two minutes are
 * just traffic, so they are merged into the surrounding move.
 */
function buildJourney(points) {
  if (!points.length) return [];

  const MIN_STOP_MS = 2 * 60 * 1000;

  /** [{ status, from, to, points }] */
  const runs = [];
  for (const p of points) {
    const last = runs[runs.length - 1];
    if (last && last.status === p.status) {
      last.to = p;
      last.points.push(p);
    } else {
      runs.push({ status: p.status, from: p, to: p, points: [p] });
    }
  }

  const steps = runs.map((run) => {
    const durationMs = new Date(run.to.ts) - new Date(run.from.ts);
    const distanceKm = run.points.slice(1).reduce((sum, p, i) => sum + haversineKm(run.points[i], p), 0);

    if (run.status === 'stopped') {
      return {
        kind: 'stop',
        label: 'Stop recorded',
        detail: `Stationary for ${duration(run.from.ts, new Date(run.to.ts).getTime())} near ${run.from.geofenceId ? 'a monitored zone' : 'the planned corridor'}.`,
        ts: run.from.ts,
        spanMs: durationMs,
      };
    }
    return {
      kind: 'move',
      label: 'Journey in progress',
      detail:
        distanceKm > 0.2
          ? `Covered ${formatKm(distanceKm)} in ${duration(run.from.ts, new Date(run.to.ts).getTime())}, averaging ${Math.round(distanceKm / Math.max(1, durationMs / 3600000))} km/h.`
          : 'Reporting position.',
      ts: run.from.ts,
      spanMs: durationMs,
    };
  });

  // Drop very short stops unless they are the most recent thing that happened.
  const kept = steps.filter((s, i) => s.kind === 'move' || s.spanMs >= MIN_STOP_MS || i === steps.length - 1);

  // Mark the final step as current so the timeline reads top-down as "now".
  if (kept.length) kept[kept.length - 1] = { ...kept[kept.length - 1], current: true };

  return kept.slice(-12).reverse();
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}