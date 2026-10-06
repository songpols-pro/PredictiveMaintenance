"use client";

// Live data store for the chiller plant: polls the (simulated) controller every 5 s.
// Server render has no data (null) so pages show skeletons until the first poll in the browser.

import { useSyncExternalStore } from "react";
import { activeAlarms } from "./alarms";
import type { HvacAlarm, PlantSnap } from "./model";
import { plantAt } from "./sim";

export const POLL_MS = 5000;
/** Readings older than this are shown as stale (WCAG: state shown with text, not only a faded color). */
export const STALE_MS = 20_000;

export interface LiveData {
  snap: PlantSnap;
  alarms: HvacAlarm[];
  receivedAt: number;
}

type Connection = "live" | "lost";

let current: LiveData | null = null;
let connection: Connection = "live";
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function poll() {
  if (connection === "lost") return;
  const t = Date.now();
  const snap = plantAt(t);
  current = { snap, alarms: activeAlarms(t, snap), receivedAt: t };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    poll();
    timer = setInterval(poll, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useLive(): LiveData | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function useConnection(): Connection {
  return useSyncExternalStore(subscribe, () => connection, () => "live" as const);
}

/** Demo control: pretend the link to the plant controller dropped (or came back). */
export function setConnection(next: Connection) {
  connection = next;
  if (next === "live") poll();
  else emit();
}

// Acknowledged alarms (in memory; a real system stores who acknowledged and when).
let acked = new Map<string, number>();
const ackListeners = new Set<() => void>();

export function acknowledge(ids: string[]) {
  acked = new Map(acked);
  const now = Date.now();
  for (const id of ids) if (!acked.has(id)) acked.set(id, now);
  for (const l of ackListeners) l();
}

export function useAcked(): Map<string, number> {
  return useSyncExternalStore(
    (l) => {
      ackListeners.add(l);
      return () => ackListeners.delete(l);
    },
    () => acked,
    () => acked,
  );
}
