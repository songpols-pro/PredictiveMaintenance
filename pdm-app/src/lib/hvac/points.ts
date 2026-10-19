// Trend / report point catalog: every value a user can chart or export, read from a plant snapshot.
// The catalog follows the plant layout: the simulation's equipment, or a project's registered devices.

import { SIM_LAYOUT, type PlantLayout } from "./layout";
import type { PlantSnap } from "./model";
import { MIN, plantAt } from "./sim";

const POINT_KEY_LIST = [
  "supply",
  "ret",
  "deltaT",
  "flow",
  "tons",
  "kw",
  "kwPerTon",
  "ambient",
  "chwIn",
  "chwOut",
  "loadPct",
  "running",
  "lowP1",
  "highP1",
  "lowP2",
  "highP2",
  "discharge1",
  "discharge2",
  // Points of modular chillers (first mapped: Carrier 30RAM, lib/telemetry/profiles/carrier-30ram.ts)
  "setpoint",
  "innerCoil1",
  "innerCoil2",
  "fin1",
  "fin2",
  "exv1",
  "exv2",
  "exv3",
  "exv4",
  "antifreeze",
  "comp1a",
  "comp1b",
  "comp2a",
  "comp2b",
  "fan1",
  "fan2",
  "defrost",
  "temp",
  "humid",
  "supplyAir",
  "valve",
  "speed",
  "pf",
  "amps",
  "vLN",
  "kwh",
] as const;

export type PointKey = (typeof POINT_KEY_LIST)[number];

export type PointGroup = "chiller" | "pump" | "ahu" | "plant" | "meter";

export interface PointDef {
  id: string;
  deviceId: string;
  group: PointGroup;
  key: PointKey;
  unit: string;
  digits: number;
  /** "state" points are 1 = on (running), 0 = off. */
  kind: "analog" | "state";
  read: (s: PlantSnap) => number | null;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** An on/off value as 1 / 0; NaN when the device does not report it. */
const state = (v: boolean | null | undefined) => (v === null || v === undefined ? Number.NaN : v ? 1 : 0);

function def(deviceId: string, group: PointGroup, key: PointKey, unit: string, digits: number, read: PointDef["read"], kind: PointDef["kind"] = "analog"): PointDef {
  return { id: `${deviceId}.${key}`, deviceId, group, key, unit, digits, kind, read };
}

const plant: PointDef[] = [
  def("PLANT", "plant", "supply", "°C", 1, (s) => s.supply),
  def("PLANT", "plant", "ret", "°C", 1, (s) => s.ret),
  def("PLANT", "plant", "deltaT", "°C", 1, (s) => s.deltaT),
  def("PLANT", "plant", "flow", "CMH", 0, (s) => s.flow),
  def("PLANT", "plant", "tons", "Ton", 0, (s) => s.tons),
  def("PLANT", "plant", "kw", "kW", 1, (s) => s.kw),
  def("PLANT", "plant", "kwPerTon", "kW/Ton", 2, (s) => s.kwPerTon),
  def("PLANT", "plant", "ambient", "°C", 1, (s) => s.ambient),
];

/** The points of each device of a layout. A missing device (not in this snapshot) reads as null. */
function devicePoints(layout: PlantLayout): PointDef[] {
  const chillers = layout.chillers.flatMap(({ id }) => {
    const c = (s: PlantSnap) => s.chillers.find((x) => x.id === id);
    return [
      def(id, "chiller", "chwIn", "°C", 1, (s) => c(s)?.chwIn ?? null),
      def(id, "chiller", "chwOut", "°C", 1, (s) => c(s)?.chwOut ?? null),
      def(id, "chiller", "flow", "CMH", 1, (s) => c(s)?.flow ?? null),
      def(id, "chiller", "loadPct", "%", 0, (s) => c(s)?.loadPct ?? null),
      def(id, "chiller", "kw", "kW", 1, (s) => c(s)?.kw ?? null),
      def(id, "chiller", "kwPerTon", "kW/Ton", 2, (s) => c(s)?.kwPerTon ?? null),
      def(id, "chiller", "lowP1", "bar", 1, (s) => c(s)?.circuits[0].lowP ?? null),
      def(id, "chiller", "highP1", "bar", 1, (s) => c(s)?.circuits[0].highP ?? null),
      def(id, "chiller", "lowP2", "bar", 1, (s) => c(s)?.circuits[1].lowP ?? null),
      def(id, "chiller", "highP2", "bar", 1, (s) => c(s)?.circuits[1].highP ?? null),
      def(id, "chiller", "discharge1", "°C", 1, (s) => c(s)?.circuits[0].discharge ?? null),
      def(id, "chiller", "discharge2", "°C", 1, (s) => c(s)?.circuits[1].discharge ?? null),
      def(id, "chiller", "running", "", 0, (s) => (c(s) ? (c(s)!.state === "on" ? 1 : 0) : null), "state"),
      def(id, "chiller", "setpoint", "°C", 1, (s) => c(s)?.setpoint ?? null),
      def(id, "chiller", "ambient", "°C", 1, (s) => c(s)?.ambient ?? null),
      def(id, "chiller", "innerCoil1", "°C", 1, (s) => c(s)?.circuits[0].innerCoil ?? null),
      def(id, "chiller", "innerCoil2", "°C", 1, (s) => c(s)?.circuits[1].innerCoil ?? null),
      def(id, "chiller", "fin1", "°C", 1, (s) => c(s)?.circuits[0].fin ?? null),
      def(id, "chiller", "fin2", "°C", 1, (s) => c(s)?.circuits[1].fin ?? null),
      def(id, "chiller", "antifreeze", "°C", 1, (s) => c(s)?.antifreeze ?? null),
      ...([1, 2, 3, 4] as const).map((n) => def(id, "chiller", `exv${n}`, "step", 0, (s) => c(s)?.exv[n - 1] ?? null)),
      ...(["comp1a", "comp1b", "comp2a", "comp2b"] as const).map((key, i) => def(id, "chiller", key, "", 0, (s) => (c(s) ? state(c(s)!.compressors[i]) : null), "state")),
      def(id, "chiller", "fan1", "", 0, (s) => (c(s) ? state(c(s)!.fans[0]) : null), "state"),
      def(id, "chiller", "fan2", "", 0, (s) => (c(s) ? state(c(s)!.fans[1]) : null), "state"),
      def(id, "chiller", "defrost", "", 0, (s) => (c(s) ? state(c(s)!.defrost) : null), "state"),
    ];
  });
  const air = layout.air.flatMap(({ id }) => {
    const a = (s: PlantSnap) => s.air.find((x) => x.id === id);
    return [
      def(id, "ahu", "temp", "°C", 1, (s) => a(s)?.temp ?? null),
      def(id, "ahu", "humid", "%RH", 0, (s) => a(s)?.humid ?? null),
      def(id, "ahu", "supplyAir", "°C", 1, (s) => a(s)?.supplyAir ?? null),
      def(id, "ahu", "valve", "%", 0, (s) => a(s)?.valve ?? null),
      def(id, "ahu", "running", "", 0, (s) => (a(s) ? (a(s)!.state === "on" ? 1 : 0) : null), "state"),
    ];
  });
  const pumps = layout.pumps.flatMap(({ id }) => {
    const p = (s: PlantSnap) => s.pumps.find((x) => x.id === id);
    return [def(id, "pump", "speed", "%", 0, (s) => p(s)?.speed ?? null), def(id, "pump", "running", "", 0, (s) => (p(s) ? (p(s)!.state === "on" ? 1 : 0) : null), "state")];
  });
  const meters = layout.meters.flatMap(({ id }) => {
    const m = (s: PlantSnap) => s.meters.find((x) => x.id === id);
    return [
      def(id, "meter", "kw", "kW", 1, (s) => (m(s) ? m(s)!.kw[0] + m(s)!.kw[1] + m(s)!.kw[2] : null)),
      def(id, "meter", "pf", "", 2, (s) => (m(s) ? avg(m(s)!.pf) : null)),
      def(id, "meter", "amps", "A", 1, (s) => (m(s) ? avg(m(s)!.amps) : null)),
      def(id, "meter", "vLN", "V", 1, (s) => (m(s) ? avg(m(s)!.vLN) : null)),
      def(id, "meter", "kwh", "kWh", 0, (s) => m(s)?.kwh ?? null),
    ];
  });
  return [...chillers, ...air, ...pumps, ...meters];
}

// One catalog per layout object (the simulation's, or a project's registry as it arrives).
const catalogs = new WeakMap<PlantLayout, PointDef[]>();

/** Every point a user can chart for this layout: plant totals, then each device's points. */
export function pointsFor(layout: PlantLayout = SIM_LAYOUT): PointDef[] {
  let list = catalogs.get(layout);
  if (!list) {
    list = [...plant, ...devicePoints(layout)];
    catalogs.set(layout, list);
  }
  return list;
}

export function pointGroups(layout: PlantLayout = SIM_LAYOUT): { group: PointGroup; devices: string[] }[] {
  return [
    { group: "chiller" as const, devices: layout.chillers.map((d) => d.id) },
    { group: "pump" as const, devices: layout.pumps.map((d) => d.id) },
    { group: "ahu" as const, devices: layout.air.map((d) => d.id) },
    { group: "plant" as const, devices: ["PLANT"] },
    { group: "meter" as const, devices: layout.meters.map((d) => d.id) },
  ].filter((g) => g.devices.length > 0);
}

export function pointById(id: string, layout: PlantLayout = SIM_LAYOUT): PointDef | undefined {
  return pointsFor(layout).find((p) => p.id === id);
}

export function pointsOf(deviceId: string, layout: PlantLayout = SIM_LAYOUT): PointDef[] {
  return pointsFor(layout).filter((p) => p.deviceId === deviceId);
}

/**
 * The points of a device worth offering in the pickers: those it reports. A device point that reads NaN
 * from the current snapshot is not reported by the device, or cannot be derived from what it reports (a
 * chiller without a flow meter has no cooling load); null, such as efficiency while stopped, still counts.
 * Plant totals are offered whatever they read now (a meter offline for a moment must not hide plant
 * power), except those that need a flow reading no chiller has. The ids in `keep` (already selected, so
 * they can be removed) are always offered; without a snapshot (nothing received yet) every point is.
 */
export function offeredPointsOf(deviceId: string, layout: PlantLayout, snap: PlantSnap | null | undefined, keep: readonly string[] = []): PointDef[] {
  const points = pointsOf(deviceId, layout);
  if (!snap) return points;
  const flowMeasured = snap.chillers.some((c) => !Number.isNaN(c.flow));
  const offered = (p: PointDef) => (p.group === "plant" ? flowMeasured || !NEEDS_FLOW.has(p.key) : !Number.isNaN(p.read(snap)));
  return points.filter((p) => keep.includes(p.id) || offered(p));
}

const NEEDS_FLOW = new Set<PointKey>(["flow", "tons", "kwPerTon"]);

const POINT_KEYS = new Set<string>(POINT_KEY_LIST);

/** Looks like a point id ("CH-1.chwOut"), before the layout that resolves it has loaded. */
export function isPointId(id: string): boolean {
  const dot = id.lastIndexOf(".");
  return dot > 0 && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id.slice(0, dot)) && POINT_KEYS.has(id.slice(dot + 1));
}

export const SAMPLING_MINUTES = [1, 5, 15, 60] as const;
/** Most points one history request may ask for (/api/hvac/history), so a report never selects more. */
export const MAX_HISTORY_POINTS = 24;
/** Keep charts and tables responsive: never more than this many samples per series. */
export const MAX_SAMPLES = 2000;

/** The requested sampling, coarsened if the range would produce too many samples. */
export function effectiveStep(from: number, to: number, minutes: number): number {
  const requested = minutes * MIN;
  const options = SAMPLING_MINUTES.map((m) => m * MIN).filter((s) => s >= requested);
  for (const step of options) if ((to - from) / step <= MAX_SAMPLES) return step;
  return Math.ceil((to - from) / MAX_SAMPLES / (60 * MIN)) * 60 * MIN;
}

export interface SampleRow {
  t: number;
  values: (number | null)[];
}

/** One row per sample time with a value per point (null after "now": the future is not known). */
export function sampleRows(pointIds: string[], from: number, to: number, step: number, now = Date.now()): SampleRow[] {
  const defs = pointIds.map((id) => pointById(id)).filter((p): p is PointDef => Boolean(p));
  const rows: SampleRow[] = [];
  const end = Math.min(to, now);
  for (let t = Math.ceil(from / step) * step; t <= end; t += step) {
    const snap = plantAt(t);
    rows.push({ t, values: defs.map((p) => p.read(snap)) });
  }
  return rows;
}
