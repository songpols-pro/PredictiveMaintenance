"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSimulation, getVersion, subscribe } from "@/lib/mock/db";

interface QueryState<T> {
  key: string;
  data?: T;
  error?: Error;
  loading: boolean;
  fetchedAt?: number;
}

/**
 * Minimal data hook: loads on mount / key change, re-fetches silently after any mutation
 * (keeping the previous data on screen, no skeleton flash), and exposes `retry` for error states.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>) {
  const version = useSyncExternalStore(subscribe, getVersion, () => 0);
  const simulation = useSyncExternalStore(subscribe, getSimulation, () => "normal" as const);
  const fullKey = `${key}|${simulation}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QueryState<T>>({ key: fullKey, loading: true });
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Reset to a loading state synchronously when the key changes (render-phase update).
  if (state.key !== fullKey) {
    setState({ key: fullKey, loading: true });
  }

  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setState({ key: fullKey, data, loading: false, fetchedAt: Date.now() });
      },
      (error: Error) => {
        if (!cancelled) setState({ key: fullKey, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey, version, attempt]);

  const retry = useCallback(() => {
    setState({ key: fullKey, loading: true });
    setAttempt((n) => n + 1);
  }, [fullKey]);

  return { data: state.data, error: state.error, loading: state.loading && state.data === undefined, retry, fetchedAt: state.fetchedAt };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Current time, refreshed every `intervalMs`, for relative timestamps. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
