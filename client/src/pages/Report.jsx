import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { ALERT_STATUS, ALERT_TYPE, SEVERITY } from '../lib/constants.js';
import {
  currentMonth,
  formatDate,
  formatNumber,
  formatPct,
  formatZmw,
  monthLabel,
} from '../lib/format.js';
import { StatCard, Card } from '../components/StatCard.jsx';
import { NoticeBadge } from '../components/NoticeBadge.jsx';
import { EmptyState, ErrorBanner, Loading, Spinner } from '../components/Feedback.jsx';

export default function Report() {
  const [month, setMonth] = useState(() => currentMonth());

  const months = usePolling(() => api.months(), { intervalMs: 0 });
  const report = usePolling(() => api.monthlyReport(month), { intervalMs: 0, deps: [month] });

  const options = useMemo(() => {
    const fromApi = (months.data ?? []).map((m) => m.month);
    // Always allow the current month even before it has any alerts.
    return [...new Set([currentMonth(), ...fromApi])].sort().reverse();
  }, [months.data]);

  const r = report.data;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ toolbar */}
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Monthly report</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Fleet performance and incident statistics, generated from the simulated fleet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-ink-200">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="btn-ghost btn-sm"
              aria-label="Previous month"
            >
              &larr;
            </button>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Report month"
              className="border-0 bg-transparent px-1 text-sm font-semibold text-ink-900 focus:outline-none"
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === currentMonth() ? ' (to date)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= currentMonth()}
              className="btn-ghost btn-sm"
              aria-label="Next month"
            >
              &rarr;
            </button>
          </div>

          <button type="button" onClick={() => window.print()} className="btn-primary">
            <Icon name="print" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <ErrorBanner error={report.error} onRetry={report.refresh} />

      {report.loading && !r ? (
        <Loading label="Building report" />
      ) : !r ? (
        <EmptyState title="No report data" description="Pick another month." />
      ) : (
        <>
          {/* -------------------------------------------------------- heading */}
          <div className="print-page card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
                    A
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink-900">Asset Portfolio</p>
                    <p className="text-xs text-ink-500">Fleet performance summary</p>
                  </div>
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">{r.label}</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {r.isPartial
                    ? `Month to date, ${formatDate(r.range.start)} - ${formatDate(new Date(r.range.end).getTime() - 1)}`
                    : `${formatDate(r.range.start)} - ${formatDate(new Date(r.range.end).getTime() - 1)}`}
                  {' \u00b7 '}
                  Africa/Lusaka
                </p>
              </div>
              <div className="text-right">
                <NoticeBadge />
                <p className="mt-2 max-w-[16rem] text-[11px] leading-relaxed text-ink-500">
                  Generated {formatDate(new Date().toISOString())} from simulated fleet data,
                  for illustration only.
                </p>
              </div>
            </div>

            {/* --------------------------------------------------- summary row */}
            <div className="grid grid-cols-2 gap-3 pt-5 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Alerts raised" value={formatNumber(r.summary.totalAlerts)} />
              <Metric
                label="Resolved"
                value={formatNumber(r.summary.resolved)}
                sub={`${formatPct(r.summary.resolutionRatePct)} of total`}
              />
              <Metric
                label="Still open"
                value={formatNumber(r.summary.open)}
                tone={r.summary.open ? 'warn' : 'ok'}
              />
              <Metric
                label="Escalated"
                value={formatNumber(r.summary.escalated)}
                tone={r.summary.escalated ? 'warn' : 'ok'}
              />
              <Metric
                label="Per day"
                value={formatNumber(r.summary.alertsPerDay, 1)}
                sub={r.isPartial ? `over ${r.daysElapsed} days` : `over ${r.daysInMonth} days`}
              />
              <Metric
                label="Avg resolution"
                value={
                  r.performance.avgResolutionHours == null
                    ? '-'
                    : `${formatNumber(r.performance.avgResolutionHours, 1)} h`
                }
                sub={r.performance.sampleSize ? `n=${r.performance.sampleSize}` : 'no closed alerts'}
              />
            </div>
          </div>

          {/* --------------------------------------------------- month on month */}
          <Card
            title="Month on month"
            action={
              <span className="text-xs text-ink-400">vs {r.comparison.label}</span>
            }
            bodyClassName="p-5"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Comparison
                label="Alerts raised"
                current={r.summary.totalAlerts}
                previous={r.comparison.totalAlerts}
                changePct={r.comparison.alertsChangePct}
                lowerIsBetter
              />
              <Comparison
                label="Resolution rate"
                current={r.summary.resolutionRatePct}
                previous={
                  r.comparison.totalAlerts
                    ? round1((r.comparison.resolved / r.comparison.totalAlerts) * 100)
                    : null
                }
                changePct={r.comparison.resolutionRateChangePct}
                suffix="%"
                lowerIsBetter={false}
              />
              <Comparison
                label="Avg resolution time"
                current={r.performance.avgResolutionHours}
                previous={r.comparison.avgResolutionHours}
                changePct={r.comparison.avgResolutionChangePct}
                suffix=" h"
                lowerIsBetter
              />
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* ---------------------------------------------------- daily trend */}
            <Card title="Alerts per day" bodyClassName="p-5" className="lg:col-span-2">
              {r.trend.length === 0 ? (
                <EmptyState title="No alerts this month" description="Nothing was raised in this period." />
              ) : (
                <DailyTrend trend={r.trend} />
              )}
            </Card>

            {/* ------------------------------------------------ severity split */}
            <Card title="Severity mix" bodyClassName="p-5">
              <StackedBar
                segments={r.bySeverity
                  .filter((s) => s.count > 0)
                  .map((s) => ({
                    key: s.severity,
                    label: SEVERITY[s.severity].label,
                    value: s.count,
                    colour: {
                      low: '#9ca3af',
                      medium: '#d97706',
                      high: '#ea580c',
                      critical: '#c8102e',
                    }[s.severity],
                  }))}
                total={r.summary.totalAlerts}
                emptyLabel="No alerts recorded"
              />
              <dl className="mt-4 space-y-2 text-sm">
                {r.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between gap-3">
                    <dt className="text-ink-600">{ALERT_STATUS[s.status].label}</dt>
                    <dd className="tabular-nums font-semibold text-ink-900">
                      {formatNumber(s.count)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          {/* ------------------------------------------------------- by type */}
          <Card title="Alerts by type" bodyClassName="">
            {r.byType.every((t) => t.count === 0) ? (
              <EmptyState title="Nothing recorded" description="No alerts of any type this month." />
            ) : (
              <div className="table-wrap">
                <table className="w-full min-w-[42rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      <th className="th">Type</th>
                      <th className="th text-right">Count</th>
                      <th className="th text-right">Share</th>
                      <th className="th text-right">Resolved</th>
                      <th className="th text-right">Open</th>
                      <th className="th text-right">Escalated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {r.byType.map((t) => (
                      <tr key={t.type}>
                        <td className="td">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: typeColour(t.type) }}
                              aria-hidden
                            />
                            <span className="font-medium text-ink-800">
                              {ALERT_TYPE[t.type]?.label ?? t.type}
                            </span>
                          </div>
                        </td>
                        <td className="td text-right font-semibold tabular-nums">{t.count}</td>
                        <td className="td w-40 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-100">
                              <span
                                className="block h-full rounded-full bg-brand-500"
                                style={{ width: `${Math.min(100, t.pct)}%` }}
                              />
                            </span>
                            <span className="w-12 text-right tabular-nums text-ink-500">
                              {formatPct(t.pct)}
                            </span>
                          </div>
                        </td>
                        <td className="td text-right tabular-nums">{t.resolved}</td>
                        <td className="td text-right tabular-nums">{t.open}</td>
                        <td className="td text-right tabular-nums">{t.escalated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ------------------------------------------------- vehicle table */}
          <Card title="Vehicle performance" bodyClassName="">
            {r.vehicles.length === 0 ? (
              <EmptyState title="No vehicles affected" description="No vehicle had an alert this month." />
            ) : (
              <div className="table-wrap">
                <table className="w-full min-w-[52rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      <th className="th">Vehicle</th>
                      <th className="th">Driver</th>
                      <th className="th">Customer</th>
                      <th className="th text-right">Alerts</th>
                      <th className="th text-right">Open</th>
                      <th className="th text-right">Avg resolution</th>
                      <th className="th text-right">Uptime</th>
                      <th className="th text-right">Asset value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {r.vehicles.map((v) => (
                      <tr key={v.id}>
                        <td className="td">
                          <span className="font-mono font-semibold text-ink-900">{v.reg}</span>
                          <span className="ml-2 text-xs text-ink-400">{v.makeModel}</span>
                        </td>
                        <td className="td">{v.driver}</td>
                        <td className="td max-w-[12rem] truncate">{v.customer}</td>
                        <td className="td text-right font-semibold tabular-nums">{v.alerts}</td>
                        <td className="td text-right tabular-nums">
                          {v.open > 0 ? (
                            <span className="font-semibold text-brand-700">{v.open}</span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="td text-right tabular-nums">
                          {v.avgResolutionHours == null
                            ? '-'
                            : `${formatNumber(v.avgResolutionHours, 1)} h`}
                        </td>
                        <td className="td text-right tabular-nums">
                          <span
                            className={
                              v.uptimePct < 85 ? 'font-semibold text-brand-700' : 'text-ink-700'
                            }
                          >
                            {formatPct(v.uptimePct)}
                          </span>
                        </td>
                        <td className="td text-right tabular-nums">
                          {formatZmw(v.assetValueZmw, { compact: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* -------------------------------------------------------- footer */}
          <div className="print-page card flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-ink-500">
            <p>
              Fleet of {formatNumber(r.fleet.vehicles)} tracked assets worth{' '}
              <strong className="font-semibold text-ink-800">
                {formatZmw(r.fleet.assetValueZmw)}
              </strong>{' '}
              at {formatPct(r.fleet.avgUptimePct)} average device uptime.
            </p>
            <p className="flex items-center gap-2">
              <NoticeBadge />
              <span>Not a live fleet. Figures are generated by the simulation.</span>
            </p>
          </div>
        </>
      )}

      {report.loading && r && <Spinner className="mx-auto h-4 w-4 text-ink-400" />}
    </div>
  );
}

/* ------------------------------------------------------------- pieces --- */

function Metric({ label, value, sub, tone = 'ink' }) {
  const tones = {
    ink: 'text-ink-900',
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
  };
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-bold leading-tight tabular-nums tracking-tight sm:text-2xl ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}

function Comparison({ label, current, previous, changePct, suffix = '', lowerIsBetter = true }) {
  const has = changePct != null && Number.isFinite(changePct);
  const flat = has && Math.abs(changePct) < 0.5;
  const better = has && (lowerIsBetter ? changePct < 0 : changePct > 0);
  const tone = !has || flat ? 'text-ink-500' : better ? 'text-emerald-700' : 'text-brand-700';

  return (
    <div className="rounded-lg border border-ink-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink-900">
        {current == null ? '-' : `${formatNumber(current, Number.isInteger(current) ? 0 : 1)}${suffix}`}
      </p>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-400">
          was {previous == null ? '-' : `${formatNumber(previous, Number.isInteger(previous) ? 0 : 1)}${suffix}`}
        </span>
        <span className={`font-semibold tabular-nums ${tone}`}>
          {!has ? 'no baseline' : flat ? 'level' : `${changePct > 0 ? '+' : ''}${formatNumber(changePct, 1)}%`}
        </span>
      </div>
    </div>
  );
}

/** Bar chart built from divs - no chart library needed here. */
function DailyTrend({ trend }) {
  const max = Math.max(1, ...trend.map((d) => d.count));
  return (
    <div>
      <div className="flex h-40 items-end gap-[2px]">
        {trend.map((d) => (
          <div key={d.day} className="group relative flex flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t bg-brand-500/85 transition-colors group-hover:bg-brand-600"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 3 : 1 }}
            />
            <span
              className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded
                         bg-ink-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0
                         transition-opacity group-hover:opacity-100"
            >
              {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-400">
        <span>1</span>
        <span>{Math.round(trend.length / 2)}</span>
        <span>{trend.length}</span>
      </div>
      <p className="mt-1 text-center text-[11px] text-ink-400">
        Peak {max} alert{max === 1 ? '' : 's'} on a single day
      </p>
    </div>
  );
}

function StackedBar({ segments, total, emptyLabel }) {
  if (!total) return <p className="py-6 text-center text-sm text-ink-400">{emptyLabel}</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink-100">
        {segments.map((s) => (
          <span
            key={s.key}
            className="block h-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.colour }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-ink-600">
              <span className="h-2 w-2 rounded-full" style={{ background: s.colour }} aria-hidden />
              {s.label}
            </dt>
            <dd className="tabular-nums font-semibold text-ink-800">
              {s.value}
              <span className="ml-1 font-normal text-ink-400">
                ({formatPct((s.value / total) * 100, 0)})
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const TYPE_COLOURS = {
  route_deviation: '#c8102e',
  geofence_breach: '#7c3aed',
  prolonged_stop: '#d97706',
  device_disconnected: '#0284c7',
  tamper: '#db2777',
  comms_lost: '#64748b',
};

const typeColour = (type) => TYPE_COLOURS[type] ?? '#6b7280';

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

function Icon({ name }) {
  const paths = {
    print: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8v-7z',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  );
}