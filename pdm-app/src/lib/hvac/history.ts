"use client";

// History for the /hvac screens: the simulation computes it in the browser, live data comes from the
// history API (TimescaleDB) with the signed-in user's token. Screens call the load* functions or the
// useHistory hook and never need to know which source is active.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { idToken } from "@/lib/firebase/session";
import { alarmLog as simAlarmLog } from "./alarms";
import type { HvacAlarm } from "./model";
import { sampleRows, type SampleRow } from "./points";
import { energyBetween as simEnergyBetween } from "./sim";
import { HVAC_SOURCE } from "./source";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await idToken();
  const res = await fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token ?? ""}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
  if (!res.ok) throw new Error(`history API ${res.status}`);
  return (await res.json()) as T;
}

/** One row per step in [from, min(to, now)] with a value (or null) per point. */
export async function loadRows(project: string | null, pointIds: string[], from: number, to: number, step: number, now = Date.now()): Promise<SampleRow[]> {
  if (HVAC_SOURCE === "sim") return sampleRows(pointIds, from, to, step, now);
  if (!project || pointIds.length === 0) return [];
  const q = new URLSearchParams({ project, points: pointIds.join(","), from: String(from), to: String(Math.min(to, now)), step: String(step) });
  return (await api<{ rows: SampleRow[] }>(`/api/hvac/history?${q}`)).rows;
}

/**
 * Energy (kWh) of each meter in each [start, end) range. Live: the difference of its energy counter
 * between the two instants (null when a reading is missing).
 */
export async function loadEnergy(project: string | null, meters: string[], ranges: [number, number][]): Promise<Record<string, (number | null)[]>> {
  if (HVAC_SOURCE === "sim") return Object.fromEntries(meters.map((mt) => [mt, ranges.map(([a, b]) => simEnergyBetween(mt, a, b))]));
  if (!project || meters.length === 0 || ranges.length === 0) return Object.fromEntries(meters.map((mt) => [mt, ranges.map(() => null)]));
  const times = [...new Set(ranges.flat())].sort((a, b) => a - b);
  const q = new URLSearchParams({ project, meters: meters.join(","), times: times.join(",") });
  const { kwh } = await api<{ kwh: Record<string, (number | null)[]> }>(`/api/hvac/energy?${q}`);
  const at = (mt: string, t: number) => kwh[mt]?.[times.indexOf(t)] ?? null;
  return Object.fromEntries(
    meters.map((mt) => [
      mt,
      ranges.map(([a, b]) => {
        const start = at(mt, a);
        const end = at(mt, b);
        return start === null || end === null ? null : Math.max(0, end - start);
      }),
    ]),
  );
}

/** Alarms overlapping [from, to], newest first. */
export async function loadAlarmLog(project: string | null, from: number, to: number, now = Date.now()): Promise<HvacAlarm[]> {
  if (HVAC_SOURCE === "sim") return simAlarmLog(from, to, now);
  if (!project) return [];
  const q = new URLSearchParams({ project, from: String(from), to: String(Math.min(to, now)) });
  return (await api<{ alarms: HvacAlarm[] }>(`/api/hvac/alarms?${q}`)).alarms;
}

/** Store acknowledgements of fault and communication-loss alarms (live data); returns the ids that were stored. */
export async function storeAcks(project: string, ids: string[]): Promise<string[]> {
  const stored = ids.filter((id) => id.startsWith("fault:") || id.startsWith("gateway:") || id.startsWith("comm:"));
  if (HVAC_SOURCE === "sim" || stored.length === 0) return [];
  return (await api<{ acked: string[] }>("/api/hvac/alarms", { method: "POST", body: JSON.stringify({ project, ids: stored }) })).acked;
}

export interface HistoryState<T> {
  data: T | undefined;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/**
 * Data for a screen. `key` names the request (null = nothing to load). The simulation answers at
 * once (no loading state, as before); live data loads asynchronously and can be retried.
 */
export function useHistory<T>(key: string | null, load: () => Promise<T>, simulate: () => T): HistoryState<T> {
  const simulated = useMemo(() => (HVAC_SOURCE === "sim" && key !== null ? simulate() : undefined), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key names the request
  const [state, setState] = useState<{ key: string | null; data?: T; error?: boolean }>({ key });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  if (state.key !== key) setState({ key });

  useEffect(() => {
    if (HVAC_SOURCE === "sim" || key === null) return;
    let cancelled = false;
    loadRef.current().then(
      (data) => {
        if (!cancelled) setState({ key, data });
      },
      () => {
        if (!cancelled) setState({ key, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setState({ key });
    setAttempt((n) => n + 1);
  }, [key]);

  if (HVAC_SOURCE === "sim") return { data: simulated, loading: false, error: false, retry };
  return { data: state.key === key ? state.data : undefined, loading: key !== null && state.data === undefined && !state.error, error: Boolean(state.error), retry };
}
