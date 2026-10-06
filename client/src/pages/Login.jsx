import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { NOTICE_LABEL } from '../lib/constants.js';
import NoticeBadge from '../components/NoticeBadge.jsx';
import { Spinner } from '../components/Feedback.jsx';

const ACCOUNTS = [
  { email: 'admin@lusaka1.io', password: 'lusaka1pw', role: 'Administrator', blurb: 'Can work alerts and reset the data' },
  { email: 'monitor@lusaka1.io', password: 'lusaka1pw', role: 'Monitor', blurb: 'Control room view, verify and resolve' },
];

export default function Login() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('admin@lusaka1.io');
  const [password, setPassword] = useState('lusaka1pw');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const useAccount = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 lg:flex-row">
      {/* --------------------------------------------------------- brand side */}
      <div className="relative flex flex-col justify-between overflow-hidden px-6 py-8 text-white lg:w-1/2 lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-black text-white">
              L
            </span>
            <div>
              <p className="text-lg font-bold leading-tight">Lusaka 1</p>
              <p className="text-xs text-ink-400">Asset Portfolio Tracking</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-bold leading-tight lg:text-4xl">
            Monitor financed vehicles across Zambia from one control room.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-300">
            Live positions along the Lusaka&ndash;Ndola, Lusaka&ndash;Livingstone and
            Lusaka&ndash;Chirundu corridors, geofenced zones, and a full incident workflow from
            alert to resolution.
          </p>

          <ul className="mt-8 max-w-md space-y-2.5">
            {[
              '25 simulated vehicles on real Zambian road routes',
              'Geofencing on depots, the Copperbelt mining belt and Chirundu border',
              'Alerts for deviation, geofence breach, prolonged stop, disconnection and tamper',
              'Monthly portfolio reporting with a full audit trail',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm text-ink-300">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-10">
          <NoticeBadge variant="hero" />
          <p className="mt-3 max-w-md text-xs leading-relaxed text-ink-400">
            Vehicle positions, drivers and incidents on this dashboard are randomly generated
            for illustration only. This is not a live fleet-tracking system and contains no real
            customer data.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- form side */}
      <div className="flex flex-1 items-center justify-center bg-ink-100 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-7">
            <h2 className="text-xl font-bold text-ink-900">Sign in</h2>
            <p className="mt-1 text-sm text-ink-500">
              Use either pre-seeded account. No real credentials are involved.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-200">
                  {error.message}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy && <Spinner className="h-4 w-4" />}
                {busy ? 'Signing in' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="card mt-4 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Accounts
            </p>
            <ul className="mt-3 space-y-2">
              {ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => useAccount(account)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold text-ink-800">
                        {account.email}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500">{account.blurb}</span>
                    </span>
                    <span className="chip shrink-0 bg-ink-100 text-ink-600 ring-1 ring-ink-200">
                      {account.role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
              Password for both accounts is <code className="font-mono font-semibold">lusaka1pw</code>.
              Tokens live in memory only and expire when the server restarts.
            </p>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-500">
            {NOTICE_LABEL}. Road geometry comes from OpenStreetMap; everything else is simulated.
          </p>
        </div>
      </div>
    </div>
  );
}