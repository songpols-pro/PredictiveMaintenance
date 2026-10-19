"use client";

// Live data store for the chiller plant, from one of two sources (lib/hvac/source.ts):
//   sim:  polls the simulated controller every 5 s
//   live: listens to the selected project in Firestore (setLiveProject), which pushes every change
// Server render has no data (null) so pages show skeletons until the first data in the browser.

import { useMemo, useSyncExternalStore } from "react";
import { activeAlarms } from "./alarms";
import { storeAcks } from "./history";
import { SIM_LAYOUT, setLayoutNames, type PlantLayout } from "./layout";
import { subscribeProject, type LiveProjectData } from "./live-firestore";
import type { HvacAlarm, PlantSnap } from "./model";
import { plantAt } from "./sim";
import { HVAC_SOURCE } from "./source";

export const POLL_MS = 5000;
/** Simulation: readings older than this are shown as stale (WCAG: state shown with text, not only a faded color). */
export const STALE_MS = 20_000;

export interface LiveData {
  snap: PlantSnap;
  /** The devices on screen: the simulation's equipment, or the project's registry. */
  layout: PlantLayout;
  /** Live data: devices that report but are not registered yet. */
  unassigned: LiveProjectData["unassigned"];
  alarms: HvacAlarm[];
  receivedAt: number;
  /** Readings older than this (ms) are stale: 20 s for the simulation, 2.5 gateway cycles for live data. */
  staleAfter: number;
}

type Connection = "live" | "lost";
/** Live source only: Firestore refused the project (no access) or failed. */
export type LiveError = "denied" | "failed" | null;

let current: LiveData | null = null;
let connection: Connection = "live";
let liveError: LiveError = null;
let project: string | null = null;
let stop: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function poll() {
  if (connection === "lost") return;
  const t = Date.now();
  const snap = plantAt(t);
  current = { snap, layout: SIM_LAYOUT, unassigned: [], alarms: activeAlarms(t, snap), receivedAt: t, staleAfter: STALE_MS };
  emit();
}

function start() {
  if (stop) return;
  if (HVAC_SOURCE === "sim") {
    poll();
    const timer = setInterval(poll, POLL_MS);
    stop = () => clearInterval(timer);
    return;
  }
  if (!project) return;
  stop = subscribeProject(
    project,
    (data) => {
      if (data.layout !== current?.layout) setLayoutNames(data.layout);
      current = data;
      liveError = null;
      emit();
    },
    (e) => {
      liveError = e.code === "permission-denied" ? "denied" : "failed";
      emit();
    },
  );
}

function halt() {
  stop?.();
  stop = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) halt();
  };
}

export function useLive(): LiveData | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The devices on screen: the simulation's at once; a project's once its registry has loaded (null before). */
export function useLayout(): PlantLayout | null {
  const live = useLive();
  return HVAC_SOURCE === "sim" ? SIM_LAYOUT : (live?.layout ?? null);
}

export function useConnection(): Connection {
  return useSyncExternalStore(subscribe, () => connection, () => "live" as const);
}

export function useLiveError(): LiveError {
  return useSyncExternalStore(subscribe, () => liveError, () => null);
}

/** Live source: the project whose plant the screens show (null while signed out). */
export function setLiveProject(next: string | null) {
  if (next === project) return;
  halt();
  project = next;
  current = null;
  liveError = null;
  acked = new Map();
  if (listeners.size) start();
  emit();
}

/** Demo control (simulation only): pretend the link to the plant controller dropped (or came back). */
export function setConnection(next: Connection) {
  connection = next;
  if (next === "live") poll();
  else emit();
}

// Acknowledged alarms. Shown at once from memory; with live data they are also stored, so every screen
// sees who and when: fault alarms in TimescaleDB + the live alarm documents, communication losses in
// the project's commAcks documents.
/** Who acknowledged an alarm and when; `by` is unknown in the simulation (no sign-in). */
export interface Ack {
  at: number;
  by?: string;
}

let acked = new Map<string, Ack>();
const ackListeners = new Set<() => void>();

/** Acknowledge alarms on this screen at once, and store them with live data. `by`: the signed-in account. */
export function acknowledge(ids: string[], by?: string) {
  acked = new Map(acked);
  const now = Date.now();
  for (const id of ids) if (!acked.has(id)) acked.set(id, { at: now, ...(by ? { by } : {}) });
  for (const l of ackListeners) l();
  if (HVAC_SOURCE === "live" && project) {
    storeAcks(project, ids).catch(() => {
      // Kept in memory for this screen; the stored state shows again on the next live update.
    });
  }
}

/** Acknowledged alarms: the stored acknowledgement (the first one given, by whoever) wins over this screen's. */
export function useAcked(): Map<string, Ack> {
  const local = useSyncExternalStore(
    (l) => {
      ackListeners.add(l);
      return () => ackListeners.delete(l);
    },
    () => acked,
    () => acked,
  );
  const live = useLive();
  return useMemo(() => {
    const stored = live?.alarms.filter((a) => a.ackedAt !== undefined) ?? [];
    if (stored.length === 0) return local;
    const merged = new Map(local);
    for (const a of stored) merged.set(a.id, { at: a.ackedAt!, ...(a.ackedBy ? { by: a.ackedBy } : {}) });
    return merged;
  }, [local, live]);
}
