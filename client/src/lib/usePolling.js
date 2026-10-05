import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api.js';

/**
 * Polls a loader every `intervalMs` and keeps the previous value visible while
 * the next one is in flight, so the dashboard does not flicker on every tick.
 *
 * Pass intervalMs={0} to load once and never poll.
 */
export function usePolling(loader, { intervalMs = 5000, deps = [], enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [lastUpdated, setLastUpdated] = useState(null);

  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await loaderRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mounted.current) return;
      if (err?.name === 'AbortError') return;
      setError(err instanceof ApiError ? err : new Error('Something went wrong'));
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    run();
    if (!intervalMs) return undefined;

    const id = setInterval(() => run({ silent: true }), intervalMs);
    // A backgrounded tab throttles timers anyway; refetch promptly on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') run({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, run, ...deps]);

  return { data, error, loading, refresh: run, lastUpdated, setData };
}

/** Re-renders on an interval so "3m ago" labels stay honest between polls. */
export function useTicker(intervalMs = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}