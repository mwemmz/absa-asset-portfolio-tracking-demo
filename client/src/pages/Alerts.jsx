import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePolling, useTicker } from '../lib/usePolling.js';
import {
  ALERT_STATUS,
  ALERT_TYPE,
  INCIDENT_STEPS,
  RESPONSE_STATUS,
  SEVERITY,
  STATUS_ORDER,
} from '../lib/constants.js';
import { formatDateTime, formatFull, timeAgo } from '../lib/format.js';
import { AlertStatusPill, SeverityPill, StatusTrack } from '../components/Badges.jsx';
import { Card } from '../components/StatCard.jsx';
import { EmptyState, ErrorBanner, Spinner } from '../components/Feedback.jsx';

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  ...Object.entries(ALERT_TYPE).map(([value, meta]) => ({ value, label: meta.label })),
];

export default function Alerts() {
  const now = useTicker(10000);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const severity = params.get('severity') ?? '';
  const vehicleId = params.get('vehicleId') ?? '';
  const focusId = params.get('focus') ? Number(params.get('focus')) : null;

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [flash, setFlash] = useState(null);

  const alerts = usePolling(
    () =>
      api.alerts({
        status: status || undefined,
        type: type || undefined,
        severity: severity || undefined,
        vehicleId: vehicleId || undefined,
        limit: 200,
      }),
    { intervalMs: 10000, deps: [status, type, severity, vehicleId] },
  );
  const summary = usePolling(() => api.alertSummary(), { intervalMs: 15000 });

  const list = alerts.data ?? [];
  const focused = useMemo(
    () => (focusId ? list.find((a) => a.id === focusId) : null) ?? null,
    [list, focusId],
  );

  // The focused alert's full audit trail, including its notes.
  const detail = usePolling(() => api.alert(focused.id), {
    intervalMs: 0,
    enabled: !!focused?.id,
    deps: [focused?.id],
  });

  const detailRef = useMemo(() => {
    const fresh = detail.data;
    if (fresh && focused && fresh.id === focused.id && fresh.updatedAt === focused.updatedAt) {
      return fresh;
    }
    return focused;
  }, [detail.data, focused]);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(id);
  }, [flash]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  /** Apply a workflow action, then refresh both the list and the open alert. */
  const act = async (patch, successMessage) => {
    if (!focused) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await api.updateAlert(focused.id, patch);
      detail.setData(updated);
      setFlash(successMessage);
      await Promise.all([alerts.refresh({ silent: true }), summary.refresh({ silent: true })]);
    } catch (err) {
      setActionError(err);
    } finally {
      setSaving(false);
    }
  };

  const addNote = async (note) => {
    if (!focused || !note.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await api.addNote(focused.id, note.trim());
      detail.setData(updated);
      await Promise.all([alerts.refresh({ silent: true }), summary.refresh({ silent: true })]);
      return true;
    } catch (err) {
      setActionError(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCount = summary.data?.open ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Alerts</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {openCount} open of {summary.data?.byStatus
              ? Object.values(summary.data.byStatus).reduce((s, n) => s + n, 0)
              : list.length}{' '}
            recorded. Every status change is written to the audit trail with your name and the time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alerts.loading && <Spinner className="h-4 w-4 text-ink-400" />}
          <span className="text-xs text-ink-400">
            Updated {alerts.lastUpdated ? timeAgo(alerts.lastUpdated, now) : '-'}
          </span>
        </div>
      </div>

      <ErrorBanner error={alerts.error} onRetry={alerts.refresh} />

      {/* ------------------------------------------------------------ filters */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1">
          {[{ value: '', label: 'All' }, ...STATUS_ORDER.map((s) => ({ value: s, label: ALERT_STATUS[s].label }))].map(
            (tab) => {
              const active = status === tab.value;
              const count = tab.value ? (summary.data?.byStatus?.[tab.value] ?? 0) : undefined;
              return (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  onClick={() => setParam('status', tab.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {tab.label}
                  {count != null && (
                    <span className={`tabular-nums ${active ? 'text-white/80' : 'text-ink-400'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            },
          )}
          {(status || type || severity || vehicleId) && (
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="btn-ghost btn-sm ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3">
          <select
            value={type}
            onChange={(e) => setParam('type', e.target.value)}
            aria-label="Filter by alert type"
            className="input w-auto min-w-[13rem]"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.value || 'all'} value={t.value}>
                {t.label}
                {t.value && summary.data?.byType?.[t.value] != null
                  ? ` (${summary.data.byType[t.value]})`
                  : ''}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setParam('severity', e.target.value)}
            aria-label="Filter by severity"
            className="input w-auto"
          >
            <option value="">Any severity</option>
            {['critical', 'high', 'medium', 'low'].map((s) => (
              <option key={s} value={s}>
                {SEVERITY[s].label}
                {summary.data?.openBySeverity?.[s] != null ? ` (${summary.data.openBySeverity[s]} open)` : ''}
              </option>
            ))}
          </select>

          {(status || type || severity || vehicleId) && (
            <p className="text-xs text-ink-500">
              {list.length} alert{list.length === 1 ? '' : 's'} match
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* -------------------------------------------------------- alert list */}
        <div className={`card overflow-hidden ${focused ? 'xl:col-span-2' : 'xl:col-span-5'}`}>
          <header className="card-header">
            <h2 className="card-title">Alert feed</h2>
            <span className="text-xs text-ink-400">{list.length}</span>
          </header>
          <div className="divide-y divide-ink-100 overflow-y-auto xl:max-h-[42rem]">
            {alerts.loading && !list.length ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5 text-ink-400" />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                title="No alerts match"
                description="Try clearing the filters, or wait for the simulation engine to raise one."
                icon="search"
              />
            ) : (
              list.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setParam('focus', a.id)}
                  className={`block w-full px-3.5 py-3 text-left transition-colors sm:px-5 sm:py-3.5 ${
                    focused?.id === a.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        a.status === 'resolved' ? 'bg-emerald-500' : SEVERITY[a.severity].bar
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-900">{a.title}</span>
                        <AlertStatusPill status={a.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        <span className="font-mono font-medium text-ink-700">{a.vehicleReg}</span>
                        {' · '}
                        {a.driver}
                        {a.locationLabel ? ` · ${a.locationLabel}` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {timeAgo(a.createdAt, now)} &middot; {ALERT_TYPE[a.type]?.label ?? a.type}
                      </p>
                    </div>
                    <span className="shrink-0">
                      <SeverityPill severity={a.severity} />
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------- workflow */}
        {focused && (
          <div className="space-y-4 xl:col-span-3">
            <Card
              title={`Alert #${focused.id}`}
              action={<AlertStatusPill status={focused.status} />}
              bodyClassName="p-5"
            >
              <h2 className="text-lg font-bold text-ink-900">{focused.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{focused.details}</p>

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink-100 pt-4 text-sm sm:grid-cols-3">
                {[
                  ['Vehicle', <span key="v" className="font-mono font-semibold">{focused.vehicleReg}</span>],
                  ['Driver', focused.driver],
                  ['Type', ALERT_TYPE[focused.type]?.label ?? focused.type],
                  ['Severity', <SeverityPill key="s" severity={focused.severity} />],
                  ['Raised', formatFull(focused.createdAt)],
                  ['Location', focused.locationLabel || '-'],
                  ['Response', RESPONSE_STATUS[focused.responseStatus] ?? focused.responseStatus],
                  ['Resolved by', focused.resolvedBy ?? '-'],
                  ['Source', focused.source],
                ].map(([k, val]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{k}</dt>
                    <dd className="mt-0.5 truncate font-medium text-ink-800">{val}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 border-t border-ink-100 pt-4">
                <StatusTrack status={focused.status} />
              </div>
            </Card>

            {actionError && <ErrorBanner error={actionError} />}
            {flash && (
              <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
                {flash}
              </p>
            )}

            <WorkflowPanel
              alert={detailRef}
              saving={saving}
              user={user}
              onAct={act}
              onAddNote={addNote}
            />

            <AuditTrail events={detailRef?.events ?? []} />

            <div className="card px-4 py-3 text-[11px] text-ink-500">
              <p>
                <strong className="font-semibold text-ink-700">Incident workflow:</strong> Alert &rarr;
                Verification &rarr; Escalation &rarr; Response &rarr; Resolution. Status moves forward
                only, and a resolved alert is closed for good.
              </p>
            </div>
          </div>
        )}

        {!focused && !alerts.loading && (
          <div className="hidden xl:col-span-3 xl:block">
            <Card>
              <EmptyState
                title="Select an alert"
                description="Pick an alert from the feed to work the incident workflow and read its audit trail."
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- workflow panel --- */
function WorkflowPanel({ alert, saving, user, onAct, onAddNote }) {
  const [note, setNote] = useState('');

  if (!alert) return null;

  const status = alert.status;
  const next = {
    new: [
      { to: 'verified', label: 'Verify alert', hint: 'Confirm the incident is real', tone: 'primary' },
      { to: 'escalated', label: 'Escalate', hint: 'Refer straight to recovery', tone: 'secondary' },
      { to: 'resolved', label: 'Resolve', hint: 'Close without escalating', tone: 'secondary' },
    ],
    verified: [
      { to: 'escalated', label: 'Escalate', hint: 'Asset recovery to take over', tone: 'primary' },
      { to: 'resolved', label: 'Resolve', hint: 'Verified and closed', tone: 'secondary' },
    ],
    escalated: [{ to: 'resolved', label: 'Resolve', hint: 'Record the outcome and close', tone: 'primary' }],
    resolved: [],
  }[status] ?? [];

  const response = alert.responseStatus;
  const nextResponse = {
    not_required: [
      { to: 'pending', label: 'Response required', hint: 'Flag for a field team' },
      { to: 'dispatched', label: 'Dispatch team', hint: 'Send someone out' },
    ],
    pending: [
      { to: 'dispatched', label: 'Team dispatched' },
      { to: 'stood_down', label: 'Stand down' },
    ],
    dispatched: [
      { to: 'on_site', label: 'Team on site' },
      { to: 'stood_down', label: 'Stand down' },
    ],
    on_site: [
      { to: 'closed', label: 'Close response' },
      { to: 'stood_down', label: 'Stand down' },
    ],
  }[response] ?? [];

  const terminal = status === 'resolved';

  const submitNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    const ok = await onAddNote(note);
    if (ok) setNote('');
  };

  return (
    <Card title="Work the incident" bodyClassName="p-5">
      {/* -------------------------------------------------- incident steps */}
      <ol className="space-y-2">
        {INCIDENT_STEPS.map((step) => {
          const done = stepReached(alert, step);
          const current = stepIsCurrent(alert, step);
          return (
            <li
              key={step.key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                current
                  ? 'border-brand-300 bg-brand-50'
                  : done
                    ? 'border-ink-200 bg-white'
                    : 'border-dashed border-ink-200 bg-ink-50/50'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done ? 'bg-brand-600 text-white' : current ? 'bg-brand-100 text-brand-700' : 'bg-ink-200 text-ink-500'
                }`}
              >
                {done ? '✓' : INCIDENT_STEPS.indexOf(step) + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{step.label}</p>
                <p className="text-xs text-ink-500">{step.hint}</p>
              </div>
              {current && (
                <span className="chip ml-auto shrink-0 bg-brand-600 text-white">current</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* ---------------------------------------------------- status actions */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <p className="label">Alert status</p>
        {terminal ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
            Resolved {alert.resolvedAt ? `on ${formatFull(alert.resolvedAt)}` : ''}
            {alert.resolvedBy ? ` by ${alert.resolvedBy}` : ''}. The audit trail is now read-only.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next.map((action) => (
              <ActionButton
                key={action.to}
                {...action}
                disabled={saving}
                onClick={(noteText) =>
                  onAct(
                    { status: action.to, note: noteText || action.hint },
                    `Alert #${alert.id} moved to ${action.to}.`,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------------- response actions */}
      <div className="mt-4">
        <p className="label">
          Response <span className="font-normal normal-case text-ink-400">({RESPONSE_STATUS[response]})</span>
        </p>
        {nextResponse.length === 0 ? (
          <p className="text-xs text-ink-500">
            The response for this alert is {RESPONSE_STATUS[response]?.toLowerCase()}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextResponse.map((action) => (
              <ActionButton
                key={action.to}
                tone="secondary"
                label={action.label}
                hint={action.hint}
                disabled={saving}
                onClick={(noteText) =>
                  onAct(
                    { responseStatus: action.to, note: noteText || action.hint },
                    `Response moved to ${RESPONSE_STATUS[action.to]}.`,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ notes */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <p className="label">Add note</p>
        <form onSubmit={submitNote} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you check or decide?"
            maxLength={1000}
            aria-label="Note"
            className="input flex-1"
          />
          <button type="submit" disabled={saving || !note.trim()} className="btn-secondary">
            {saving ? 'Saving' : 'Save note'}
          </button>
        </form>
        <p className="mt-1.5 text-[11px] text-ink-400">
          Notes are appended to the audit trail as {user?.name ?? 'you'} ({user?.role ?? 'unknown'}).
        </p>
      </div>
    </Card>
  );
}

/**
 * A workflow button that asks for a note first, so every state change is
 * recorded with a reason rather than silently.
 */
function ActionButton({ label, hint, tone = 'secondary', disabled, onClick }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => (hint ? setOpen(true) : onClick(''))}
        className={tone === 'primary' ? 'btn-primary' : 'btn-secondary'}
        title={hint}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClick(note);
        setOpen(false);
        setNote('');
      }}
      className="flex w-full flex-col gap-2 rounded-lg border border-ink-200 bg-ink-50 p-3"
    >
      <label className="text-xs font-medium text-ink-700">{label}</label>
      <input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={hint ?? 'Optional note'}
        maxLength={1000}
        className="input"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setNote('');
          }
        }}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className="btn-primary btn-sm">
          Confirm
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ audit trail --- */
function AuditTrail({ events }) {
  if (!events.length) return null;

  return (
    <Card title="Audit trail" bodyClassName="px-5 py-4">
      <ol className="space-y-0">
        {events.map((e, index) => (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < events.length - 1 && (
              <span className="absolute left-[0.4375rem] top-4 h-full w-px bg-ink-200" aria-hidden />
            )}
            <span
              className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white ${
                e.actor === 'simulation' ? 'bg-ink-300' : 'bg-brand-500'
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium text-ink-900">{describeEvent(e)}</p>
                <p className="text-[11px] tabular-nums text-ink-400" title={formatFull(e.ts)}>
                  {formatDateTime(e.ts)}
                </p>
              </div>
              <p className="text-[11px] text-ink-500">
                {e.actor}
                {e.actorRole && e.actorRole !== 'system' ? ` (${e.actorRole})` : ''}
              </p>
              {e.note && <p className="mt-1 text-xs leading-relaxed text-ink-600">{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function describeEvent(e) {
  switch (e.action) {
    case 'created':
      return 'Alert raised';
    case 'verified':
      return 'Verified';
    case 'escalated':
      return 'Escalated';
    case 'resolved':
      return 'Resolved';
    case 'auto_resolved':
      return 'Auto-resolved';
    case 'note':
      return 'Note added';
    case 'response':
      return `Response: ${RESPONSE_STATUS[e.toResponse] ?? e.toResponse}`;
    default:
      return e.action;
  }
}

function stepReached(alert, step) {
  if (step.status) {
    return STATUS_ORDER.indexOf(alert.status) >= STATUS_ORDER.indexOf(step.status);
  }
  if (step.response) {
    return ['dispatched', 'on_site', 'closed', 'stood_down'].includes(alert.responseStatus);
  }
  return false;
}

function stepIsCurrent(alert, step) {
  const order = STATUS_ORDER.indexOf(alert.status);
  if (step.status) return order === STATUS_ORDER.indexOf(step.status);
  if (step.response) {
    return ['not_required', 'pending'].includes(alert.responseStatus);
  }
  return false;
}