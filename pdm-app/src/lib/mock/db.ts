// In-memory "database" for the mock API. Mutations bump a version number so subscribed
// views re-fetch. Replace src/lib/api.ts with real HTTP calls and this file goes away.

import type {
  NotificationRule,
  PredictionSettings,
  SimulationMode,
  ThresholdSetting,
  User,
} from "@/lib/types";
import { DEFAULT_NOTIFICATION_RULES, DEFAULT_PREDICTION_SETTINGS, TYPE_PROFILES, USERS } from "./catalog";
import { ALERTS, WORK_ORDERS, type AlertRecord, type WorkOrderRecord } from "./records";
import type { AssetType } from "@/lib/types";

function defaultThresholds(): ThresholdSetting[] {
  const rows: ThresholdSetting[] = [];
  for (const [type, profile] of Object.entries(TYPE_PROFILES)) {
    for (const s of profile.sensors) {
      rows.push({ assetType: type as AssetType, sensor: s.kind, direction: s.direction, unit: s.unit, warning: s.warning, critical: s.critical });
    }
  }
  return rows;
}

export const db = {
  alerts: structuredClone(ALERTS) as AlertRecord[],
  workOrders: structuredClone(WORK_ORDERS) as WorkOrderRecord[],
  users: structuredClone(USERS) as User[],
  thresholds: defaultThresholds(),
  prediction: { ...DEFAULT_PREDICTION_SETTINGS } as PredictionSettings,
  rules: structuredClone(DEFAULT_NOTIFICATION_RULES) as NotificationRule[],
  nextAlertSeq: 2485,
  nextWorkOrderSeq: 1049,
  nextRuleSeq: 6,
};

// ---- change notification -----------------------------------------------------------

let version = 0;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion() {
  return version;
}

export function commit() {
  version++;
  listeners.forEach((l) => l());
}

// ---- demo-state simulation (lets reviewers see loading / empty / error states) ----------

let simulation: SimulationMode = "normal";

export function getSimulation(): SimulationMode {
  return simulation;
}

export function setSimulation(mode: SimulationMode) {
  simulation = mode;
  commit();
}
