// API facade. Every screen talks to the backend only through these async functions.
// Today they read the in-memory mock (src/lib/mock); to go live, keep the signatures and
// swap the bodies for fetch() calls.

import type {
  Alert,
  Asset,
  HealthPoint,
  MaintenanceEvent,
  NotificationRule,
  Part,
  PredictionSettings,
  Priority,
  SensorKind,
  SensorPoint,
  SensorSeries,
  Site,
  SiteKpis,
  ThresholdSetting,
  TimeRange,
  User,
  WorkOrder,
  WorkOrderStatus,
  MaintenanceType,
  PartLine,
} from "@/lib/types";
import { ASSETS, MODEL_VERSION, SCORED_AT, buildHealthSeries, getModel } from "@/lib/mock/assets";
import { CURRENT_USER_ID, PARTS, SITES, SITE_KPIS } from "@/lib/mock/catalog";
import { buildHistory } from "@/lib/mock/records";
import { buildSensorSeries, sensorWindow } from "@/lib/mock/sensors";
import { commit, db, getSimulation } from "@/lib/mock/db";
import { DAY, HOUR, NOW } from "@/lib/mock/random";

export class ApiError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wraps a read with latency and the demo-state simulation. */
async function read<T>(produce: () => T, empty: () => T): Promise<T> {
  const mode = getSimulation();
  if (mode === "loading") return new Promise<T>(() => {});
  await sleep(250 + Math.random() * 350);
  if (mode === "error") throw new ApiError("The PdM service did not respond (HTTP 503). Data shown may be out of date.");
  return mode === "empty" ? empty() : produce();
}

async function write<T>(produce: () => T): Promise<T> {
  await sleep(180);
  const result = produce();
  commit();
  return result;
}

// ---- shapes returned to the UI -------------------------------------------------------

export interface AssetRow extends Asset {
  siteName: string;
  lineName: string;
  openAlerts: number;
  /** most severe unresolved alert (prefers ones without a work order yet) */
  primaryAlert?: Alert;
  /** first work order on this asset that isn't done */
  openWorkOrderId?: string;
}

export interface AlertRow extends Alert {
  asset: AssetRow;
}

export interface WorkOrderRow extends WorkOrder {
  asset: AssetRow;
}

export interface KpiValue {
  value: number;
  previous: number;
}

export interface OverviewData {
  atRisk: { critical: number; warning: number; previous: number };
  predicted7d: AssetRow[];
  predicted30d: AssetRow[];
  mtbf: KpiValue;
  mttr: KpiValue;
  oee: KpiValue;
  downtime: KpiValue;
  attention: AssetRow[];
  recentAlerts: AlertRow[];
  siteHealth: { siteId: string; siteName: string; critical: number; warning: number; healthy: number; offline: number }[];
  dueWorkOrders: WorkOrderRow[];
  modelVersion: string;
  scoredAt: string;
  dataUpdatedAt: string;
  assetCount: number;
}

export interface AssetDetail {
  asset: AssetRow;
  site: Site;
  health: HealthPoint[];
  history: MaintenanceEvent[];
  alerts: AlertRow[];
  workOrders: WorkOrderRow[];
  parts: Part[];
  settings: PredictionSettings;
  dataUpdatedAt: string;
}

export interface CreateWorkOrderInput {
  title: string;
  description: string;
  assetId: string;
  alertId?: string;
  priority: Priority;
  type: MaintenanceType;
  assigneeId?: string;
  dueDate: string;
  parts: PartLine[];
}

// ---- helpers ------------------------------------------------------------------------

const STATUS_RANK = { critical: 0, warning: 1, offline: 2, healthy: 3 } as const;

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

function toRow(asset: Asset): AssetRow {
  const site = SITES.find((s) => s.id === asset.siteId)!;
  const active = db.alerts
    .filter((a) => a.assetId === asset.id && a.status !== "resolved")
    .sort(
      (a, b) =>
        Number(!!a.workOrderId) - Number(!!b.workOrderId) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.triggeredAt.localeCompare(a.triggeredAt),
    );
  return {
    ...asset,
    siteName: site.name,
    lineName: site.lines.find((l) => l.id === asset.lineId)?.name ?? asset.lineId,
    openAlerts: db.alerts.filter((a) => a.assetId === asset.id && (a.status === "open" || a.status === "acknowledged")).length,
    primaryAlert: active[0] ? structuredClone(active[0]) : undefined,
    openWorkOrderId: db.workOrders.find((w) => w.assetId === asset.id && w.status !== "done")?.id,
  };
}

function assetsFor(siteId: string | null) {
  return ASSETS.filter((a) => !siteId || a.siteId === siteId);
}

function rowById(id: string) {
  const a = ASSETS.find((x) => x.id === id);
  return a ? toRow(a) : undefined;
}

/** Most urgent first: status, then shortest RUL, then lowest health. */
export function byUrgency(a: Asset, b: Asset) {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    (a.prediction?.rulDays ?? 9999) - (b.prediction?.rulDays ?? 9999) ||
    a.healthScore - b.healthScore
  );
}

function aggregateKpis(siteId: string | null): SiteKpis {
  const ids = siteId ? [siteId] : SITES.map((s) => s.id);
  const rows = ids.map((id) => ({ k: SITE_KPIS[id], n: assetsFor(id).length }));
  const n = rows.reduce((s, r) => s + r.n, 0);
  const avg = (f: (k: SiteKpis) => number) => rows.reduce((s, r) => s + f(r.k) * r.n, 0) / n;
  const sum = (f: (k: SiteKpis) => number) => rows.reduce((s, r) => s + f(r.k), 0);
  return {
    mtbfHours: avg((k) => k.mtbfHours),
    mtbfHoursPrev: avg((k) => k.mtbfHoursPrev),
    mttrHours: avg((k) => k.mttrHours),
    mttrHoursPrev: avg((k) => k.mttrHoursPrev),
    oee: avg((k) => k.oee),
    oeePrev: avg((k) => k.oeePrev),
    unplannedDowntimeHours: sum((k) => k.unplannedDowntimeHours),
    unplannedDowntimeHoursPrev: sum((k) => k.unplannedDowntimeHoursPrev),
  };
}

function alertRows(filter: (a: Alert) => boolean): AlertRow[] {
  return db.alerts
    .filter(filter)
    .map((a) => ({ ...a, asset: rowById(a.assetId)! }))
    .filter((a) => a.asset);
}

function workOrderRows(filter: (w: WorkOrder) => boolean): WorkOrderRow[] {
  return db.workOrders
    .filter(filter)
    .map((w) => ({ ...w, asset: rowById(w.assetId)! }))
    .filter((w) => w.asset);
}

function latestDataAt(assets: Asset[]) {
  const online = assets.filter((a) => a.status !== "offline").map((a) => a.lastDataAt);
  return online.sort().at(-1) ?? new Date(NOW).toISOString();
}

// ---- reads --------------------------------------------------------------------------

export const api = {
  currentUserId: CURRENT_USER_ID,

  sites(): Site[] {
    return SITES;
  },

  async getOverview(siteId: string | null): Promise<OverviewData> {
    const produce = (): OverviewData => {
      const assets = assetsFor(siteId);
      const rows = assets.map(toRow);
      const kpis = aggregateKpis(siteId);
      const atRisk = rows.filter((a) => a.status === "critical" || a.status === "warning");
      const prevAtRisk = assets.filter((a) => {
        const m = getModel(a.id);
        return m ? m.health(7) < db.prediction.healthWarningBelow : false;
      }).length;
      const live = rows.filter((a) => a.status !== "offline" && a.prediction);
      const siteIds = siteId ? [siteId] : SITES.map((s) => s.id);
      return {
        atRisk: {
          critical: atRisk.filter((a) => a.status === "critical").length,
          warning: atRisk.filter((a) => a.status === "warning").length,
          previous: prevAtRisk,
        },
        predicted7d: live.filter((a) => a.prediction!.rulDays <= 7).sort(byUrgency),
        predicted30d: live.filter((a) => a.prediction!.rulDays <= 30).sort(byUrgency),
        mtbf: { value: kpis.mtbfHours, previous: kpis.mtbfHoursPrev },
        mttr: { value: kpis.mttrHours, previous: kpis.mttrHoursPrev },
        oee: { value: kpis.oee, previous: kpis.oeePrev },
        downtime: { value: kpis.unplannedDowntimeHours, previous: kpis.unplannedDowntimeHoursPrev },
        attention: rows.filter((a) => a.status !== "healthy").sort(byUrgency),
        recentAlerts: alertRows((a) => (!siteId || a.assetId.startsWith(siteId)) && a.status !== "resolved").slice(0, 6),
        siteHealth: siteIds.map((id) => {
          const list = assetsFor(id);
          const count = (s: Asset["status"]) => list.filter((a) => a.status === s).length;
          return { siteId: id, siteName: SITES.find((s) => s.id === id)!.name, critical: count("critical"), warning: count("warning"), healthy: count("healthy"), offline: count("offline") };
        }),
        dueWorkOrders: workOrderRows(
          (w) => (!siteId || w.assetId.startsWith(siteId)) && w.status !== "done" && new Date(w.dueDate).getTime() < NOW + 7 * DAY,
        ).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        modelVersion: MODEL_VERSION,
        scoredAt: new Date(SCORED_AT).toISOString(),
        dataUpdatedAt: latestDataAt(assets),
        assetCount: assets.length,
      };
    };
    return read(produce, () => {
      // "Empty" = an all-clear fleet: nothing at risk, no alerts, nothing due.
      const all = produce();
      return {
      ...all,
      siteHealth: all.siteHealth.map((s) => ({ ...s, healthy: s.critical + s.warning + s.offline + s.healthy, critical: 0, warning: 0, offline: 0 })),
      atRisk: { critical: 0, warning: 0, previous: 0 },
      predicted7d: [],
      predicted30d: [],
      attention: [],
      recentAlerts: [],
      dueWorkOrders: [],
      };
    });
  },

  async listAssets(siteId: string | null): Promise<{ assets: AssetRow[]; dataUpdatedAt: string }> {
    return read(
      () => {
        const assets = assetsFor(siteId);
        return { assets: assets.map(toRow), dataUpdatedAt: latestDataAt(assets) };
      },
      () => ({ assets: [], dataUpdatedAt: new Date(NOW).toISOString() }),
    );
  },

  async getAsset(id: string): Promise<AssetDetail | null> {
    const asset = ASSETS.find((a) => a.id === id);
    const produce = (): AssetDetail | null => {
      if (!asset) return null;
      return {
        asset: toRow(asset),
        site: SITES.find((s) => s.id === asset.siteId)!,
        health: buildHealthSeries(id),
        history: buildHistory(id, asset.lastInspectionAt),
        alerts: alertRows((a) => a.assetId === id),
        workOrders: workOrderRows((w) => w.assetId === id),
        parts: PARTS,
        settings: { ...db.prediction },
        dataUpdatedAt: asset.lastDataAt,
      };
    };
    return read(produce, () => {
      const d = produce();
      if (!d) return null;
      // "Empty" = newly commissioned asset that is still collecting its baseline.
      return {
        ...d,
        asset: { ...d.asset, prediction: null, status: "healthy", healthDelta7d: 0, openAlerts: 0, primaryAlert: undefined, openWorkOrderId: undefined },
        health: [],
        history: [],
        alerts: [],
        workOrders: [],
      };
    });
  },

  async getSensorSeries(id: string, kind: SensorKind, range: TimeRange): Promise<SensorSeries | null> {
    return read(
      () => buildSensorSeries(id, kind, range),
      () => {
        const s = buildSensorSeries(id, kind, range);
        return s ? { ...s, points: [], latest: null, anomalyCount: 0 } : null;
      },
    );
  },

  async getAlertEvidence(alert: Alert): Promise<SensorPoint[]> {
    if (!alert.sensor) return [];
    return read(
      () => sensorWindow(alert.assetId, alert.sensor!, new Date(alert.triggeredAt).getTime() + 6 * HOUR, 48),
      () => [],
    );
  },

  async listAlerts(siteId: string | null): Promise<AlertRow[]> {
    return read(
      () => alertRows((a) => !siteId || a.assetId.startsWith(siteId)),
      () => [],
    );
  },

  async listWorkOrders(siteId: string | null): Promise<WorkOrderRow[]> {
    return read(
      () => workOrderRows((w) => !siteId || w.assetId.startsWith(siteId)),
      () => [],
    );
  },

  async listUsers(): Promise<User[]> {
    return read(() => db.users.map((u) => ({ ...u })), () => []);
  },

  async getSettings(): Promise<{ thresholds: ThresholdSetting[]; prediction: PredictionSettings; rules: NotificationRule[] }> {
    return read(
      () => ({ thresholds: structuredClone(db.thresholds), prediction: { ...db.prediction }, rules: structuredClone(db.rules) }),
      () => ({ thresholds: [], prediction: { ...db.prediction }, rules: [] }),
    );
  },

  // Synchronous lookups used by forms (reference data, not subject to simulation)
  parts(): Part[] {
    return PARTS;
  },
  users(): User[] {
    return db.users;
  },
  assetOptions(): AssetRow[] {
    return ASSETS.map(toRow);
  },

  // ---- writes -------------------------------------------------------------------------

  acknowledgeAlert(id: string) {
    return write(() => {
      const a = db.alerts.find((x) => x.id === id);
      if (!a || a.status === "resolved") return;
      a.status = "acknowledged";
      a.acknowledgedAt = new Date().toISOString();
      a.acknowledgedBy = CURRENT_USER_ID;
      a.snoozedUntil = undefined;
      a.events.push({ at: a.acknowledgedAt, text: `Acknowledged by ${userName(CURRENT_USER_ID)}`, by: CURRENT_USER_ID });
    });
  },

  assignAlert(id: string, userId: string | null) {
    return write(() => {
      const a = db.alerts.find((x) => x.id === id);
      if (!a) return;
      a.assigneeId = userId ?? undefined;
      a.events.push({ at: new Date().toISOString(), text: userId ? `Assigned to ${userName(userId)}` : "Unassigned", by: CURRENT_USER_ID });
    });
  },

  snoozeAlert(id: string, hours: number) {
    return write(() => {
      const a = db.alerts.find((x) => x.id === id);
      if (!a) return;
      a.status = "snoozed";
      a.snoozedUntil = new Date(Date.now() + hours * HOUR).toISOString();
      a.events.push({ at: new Date().toISOString(), text: `Snoozed for ${hours} h`, by: CURRENT_USER_ID });
    });
  },

  reopenAlert(id: string) {
    return write(() => {
      const a = db.alerts.find((x) => x.id === id);
      if (!a) return;
      a.status = "open";
      a.snoozedUntil = undefined;
      a.resolvedAt = undefined;
      a.events.push({ at: new Date().toISOString(), text: "Reopened", by: CURRENT_USER_ID });
    });
  },

  resolveAlert(id: string) {
    return write(() => {
      const a = db.alerts.find((x) => x.id === id);
      if (!a) return;
      a.status = "resolved";
      a.resolvedAt = new Date().toISOString();
      a.events.push({ at: a.resolvedAt, text: "Resolved", by: CURRENT_USER_ID });
    });
  },

  createWorkOrder(input: CreateWorkOrderInput) {
    return write(() => {
      const id = `WO-${db.nextWorkOrderSeq++}`;
      const wo: WorkOrder = { ...input, id, status: "open", createdAt: new Date().toISOString() };
      db.workOrders.unshift(wo);
      if (input.alertId) {
        const a = db.alerts.find((x) => x.id === input.alertId);
        if (a) {
          a.workOrderId = id;
          if (a.status === "open") {
            a.status = "acknowledged";
            a.acknowledgedAt = wo.createdAt;
            a.acknowledgedBy = CURRENT_USER_ID;
          }
          if (input.assigneeId && !a.assigneeId) a.assigneeId = input.assigneeId;
          a.events.push({ at: wo.createdAt, text: `Work order ${id} created`, by: CURRENT_USER_ID });
        }
      }
      return wo;
    });
  },

  updateWorkOrder(id: string, patch: Partial<Pick<WorkOrder, "status" | "assigneeId" | "priority" | "dueDate">>) {
    return write(() => {
      const w = db.workOrders.find((x) => x.id === id);
      if (!w) return;
      Object.assign(w, patch);
      if (patch.status === "done") w.completedAt = new Date().toISOString();
      if (patch.status && patch.status !== "done") w.completedAt = undefined;
    });
  },

  saveThresholds(thresholds: ThresholdSetting[], prediction: PredictionSettings) {
    return write(() => {
      db.thresholds = structuredClone(thresholds);
      db.prediction = { ...prediction };
    });
  },

  saveRule(rule: NotificationRule) {
    return write(() => {
      const idx = db.rules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) db.rules[idx] = structuredClone(rule);
      else db.rules.push({ ...structuredClone(rule), id: `nr${db.nextRuleSeq++}` });
    });
  },

  deleteRule(id: string) {
    return write(() => {
      db.rules = db.rules.filter((r) => r.id !== id);
    });
  },

  updateUser(id: string, patch: Partial<Pick<User, "role" | "active" | "siteIds">>) {
    return write(() => {
      const u = db.users.find((x) => x.id === id);
      if (u) Object.assign(u, patch);
    });
  },

  inviteUser(input: { name: string; email: string; role: User["role"]; siteIds: string[] }) {
    return write(() => {
      const initials = input.name
        .split(/\s+/)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .slice(0, 2)
        .join("");
      const user: User = { id: `u${db.users.length + 1}`, initials, active: true, ...input };
      db.users.push(user);
      return user;
    });
  },
};

export function userName(id?: string | null) {
  if (!id) return "Unassigned";
  return db.users.find((u) => u.id === id)?.name ?? "Unknown user";
}

export function partName(partNo: string) {
  return PARTS.find((p) => p.partNo === partNo)?.name ?? partNo;
}

export type { WorkOrderStatus };
export { SENSOR_LABELS } from "@/lib/mock/catalog";
