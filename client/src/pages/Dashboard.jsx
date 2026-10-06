import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePolling, useTicker } from '../lib/usePolling.js';
import { ALERT_TYPE, SEVERITY, VEHICLE_STATUS } from '../lib/constants.js';
import { formatNumber, formatPct, formatSpeed, formatZmw, timeAgo } from '../lib/format.js';
import { Card, StatCard } from '../components/StatCard.jsx';
import { AlertStatusPill, DevicePill, SeverityPill, StatusPill } from '../components/Badges.jsx';
import { EmptyState, ErrorBanner, SkeletonRows } from '../components/Feedback.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const now = useTicker(10000);

  const stats = usePolling(() => api.stats(), { intervalMs: 5000 });
  const vehicles = usePolling(() => api.vehicles(), { intervalMs: 5000 });
  const alerts = usePolling(() => api.alerts({ limit: 8 }), { intervalMs: 5000 });
  const byType = usePolling(() => api.statsByType(), { intervalMs: 15000 });

  const data = stats.data;
  const list = vehicles.data ?? [];

  const attention = useMemo(
    () =>
      list
        .filter((v) => v.status !== 'moving' || v.deviceStatus !== 'online')
        .sort((a, b) => {
          const rank = (v) =>
            (v.deviceStatus === 'tampered' ? 0 : v.status === 'offline' ? 1 : v.status === 'stopped' ? 2 : 3);
          return rank(a) - rank(b);
        })
        .slice(0, 7),
    [list],
  );

  const openTypeCounts = useMemo(() => {
    const rows = byType.data?.open ?? [];
    const total = rows.reduce((sum, r) => sum + r.n, 0) || 1;
    return rows.map((r) => ({ ...r, pct: (r.n / total) * 100 }));
  }, [byType.data]);

  if (stats.error) {
    return <ErrorBanner error={stats.error} onRetry={stats.refresh} className="mb-4" showIcon={false} />;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="relative isolate -mx-3 -mt-3 overflow-hidden px-3 pb-4 pt-3 sm:-mx-4 sm:-mt-4 sm:px-4 sm:pb-5 sm:pt-4 lg:-mx-6 lg:-mt-6 lg:px-6 lg:pb-6 lg:pt-6">
        <img
          src="/header.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-60 blur-[3px]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-ink-900/60" />

        <div className="relative z-10 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Portfolio dashboard
              </h1>
              <p className="mt-0.5 text-xs leading-snug text-ink-200 sm:text-sm">
                {formatNumber(data?.total ?? 0)} financed vehicles under monitoring, refreshed every 5
                seconds from the simulation engine.
              </p>
            </div>
            <p className="shrink-0 text-[11px] text-ink-200 sm:text-xs">
              Last update{' '}
              <span className="font-medium text-white">
                {stats.lastUpdated ? timeAgo(stats.lastUpdated, now) : '-'}
              </span>
            </p>
          </div>

          {/* ------------------------------------------------------- stat cards */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
            <StatCard
              label="Total vehicles"
              value={formatNumber(data?.total)}
              sublabel={`${formatZmw(data?.fleetValueZmw, { compact: true })} financed value`}
              tone="ink"
            />
            <StatCard
              label="Active"
              value={formatNumber(data?.active)}
              sublabel="Reporting and moving"
              tone="emerald"
              onClick={() => navigate('/vehicles?status=moving')}
              active={false}
            />
            <StatCard
              label="Stopped"
              value={formatNumber(data?.stopped)}
              sublabel="Stationary over threshold"
              tone="amber"
              onClick={() => navigate('/vehicles?status=stopped')}
            />
            <StatCard
              label="Offline"
              value={formatNumber(data?.offline)}
              sublabel={`${formatNumber(data?.tamperedDevices ?? 0)} device tampered`}
              tone="orange"
              onClick={() => navigate('/vehicles?status=offline')}
            />
            <StatCard
              label="Alerts today"
              value={formatNumber(data?.alertsToday)}
              sublabel={`${formatNumber(data?.openAlerts ?? 0)} still open`}
              tone="brand"
              onClick={() => navigate('/alerts')}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* -------------------------------------------------- recent alerts */}
        <Card
          className="xl:col-span-2"
          title="Latest alerts"
          action={
            <Link to="/alerts" className="btn-ghost btn-sm">
              View all
            </Link>
          }
          bodyClassName="divide-y divide-ink-100"
        >
          {alerts.loading && !alerts.data ? (
            <SkeletonRows rows={5} cols={3} />
          ) : (alerts.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No alerts yet"
              description="The simulation engine raises incidents automatically. Nothing has fired in the last few minutes."
              showIcon={false}
            />
          ) : (
            alerts.data.map((a) => <AlertRow key={a.id} alert={a} now={now} />)
          )}
        </Card>

        <div className="space-y-5">
          {/* ------------------------------------------------ open by type */}
          <Card title="Open alerts by type" bodyClassName="p-5">
            {openTypeCounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">No open alerts.</p>
            ) : (
              <ul className="space-y-3">
                {openTypeCounts.map((row) => (
                  <li key={row.type}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        to={`/alerts?type=${row.type}`}
                        className="truncate font-medium text-ink-700 hover:text-brand-700"
                      >
                        {ALERT_TYPE[row.type]?.label ?? row.type}
                      </Link>
                      <span className="tabular-nums font-semibold text-ink-900">{row.n}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(3, row.pct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ------------------------------------------------ open severity */}
          <Card title="Open by severity" bodyClassName="p-5">
            <div className="space-y-2.5">
              {['critical', 'high', 'medium', 'low'].map((sev) => {
                const count = data?.openBySeverity?.[sev] ?? 0;
                const max = Math.max(1, data?.openBySeverity?.critical ?? 0, data?.openBySeverity?.high ?? 0);
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <span className="w-16 shrink-0">
                      <SeverityPill severity={sev} />
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={`h-full rounded-full ${SEVERITY[sev].bar}`}
                        style={{ width: `${count ? Math.max(4, (count / max) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-800">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------- needs attention */}
      <Card
        title="Needs attention"
        action={
          <Link to="/vehicles" className="btn-ghost btn-sm">
            All vehicles
          </Link>
        }
        bodyClassName="table-wrap"
      >
        {vehicles.loading && !list.length ? (
          <SkeletonRows rows={5} cols={5} />
        ) : attention.length === 0 ? (
          <EmptyState
            title="Every vehicle is moving"
            description="Nothing is stopped, offline or tampered at the moment."
            showIcon={false}
          />
        ) : (
          <table className="w-full min-w-[34rem]">
            <thead className="border-b border-ink-200 bg-ink-50">
              <tr>
                <th className="th">Registration</th>
                <th className="th hidden md:table-cell">Driver</th>
                <th className="th">Status</th>
                <th className="th">Device</th>
                <th className="th hidden sm:table-cell">Speed</th>
                <th className="th hidden lg:table-cell">Uptime</th>
                <th className="th">Last update</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {attention.map((v) => (
                <tr key={v.id} className="transition-colors hover:bg-ink-50">
                  <td className="td">
                    <Link to={`/vehicles/${v.id}`} className="link font-semibold">
                      {v.reg}
                    </Link>
                    <p className="text-xs text-ink-400">{v.makeModel}</p>
                  </td>
                  <td className="td hidden md:table-cell">{v.driver}</td>
                  <td className="td">
                    <StatusPill status={v.status} showDot={false} />
                  </td>
                  <td className="td">
                    <DevicePill status={v.deviceStatus} />
                  </td>
                  <td className="td hidden tabular-nums sm:table-cell">{formatSpeed(v.speed)}</td>
                  <td className="td hidden tabular-nums lg:table-cell">{formatPct(v.uptimePct)}</td>
                  <td className="td text-ink-500">{timeAgo(v.lastUpdate, now)}</td>
                  <td className="td text-right">
                    <Link to={`/vehicles/${v.id}`} className="btn-secondary btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ----------------------------------------------------- status split */}
      <Card title="Fleet status split" bodyClassName="p-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
          {['moving', 'stopped', 'offline'].map((key) => {
            const count = data?.byStatus?.[key] ?? 0;
            const pct = data?.total ? (count / data.total) * 100 : 0;
            if (!count) return null;
            return (
              <div
                key={key}
                className={VEHICLE_STATUS[key].dot}
                style={{ width: `${pct}%` }}
                title={`${VEHICLE_STATUS[key].label}: ${count}`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {['moving', 'stopped', 'offline'].map((key) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${VEHICLE_STATUS[key].dot}`} />
              <span className="text-ink-600">{VEHICLE_STATUS[key].label}</span>
              <span className="font-semibold tabular-nums text-ink-900">
                {formatNumber(data?.byStatus?.[key] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AlertRow({ alert, now }) {
  return (
    <Link
      to={`/alerts?focus=${alert.id}`}
      className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-ink-50 sm:gap-4 sm:px-5"
    >
      <span
        className={`h-8 w-1 shrink-0 rounded-full ${
          alert.status === 'resolved' ? 'bg-emerald-400' : SEVERITY[alert.severity].bar
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold leading-snug text-ink-900">{alert.title}</span>
          <AlertStatusPill status={alert.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          <span className="font-mono font-medium text-ink-700">{alert.vehicleReg}</span>
          {', '}
          {alert.driver}
          {alert.locationLabel ? `, ${alert.locationLabel}` : ''}
        </p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <SeverityPill severity={alert.severity} />
      </div>
      <span className="shrink-0 text-right text-[11px] text-ink-400 sm:w-16 sm:pt-0.5">
        <span className="sm:hidden">
          <span
            className={`mb-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
              alert.status === 'resolved' ? 'bg-emerald-400' : SEVERITY[alert.severity].bar
            }`}
            aria-hidden
          />{' '}
        </span>
        {timeAgo(alert.createdAt, now)}
      </span>
    </Link>
  );
}