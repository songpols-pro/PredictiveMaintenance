// Trend / report point catalog: every value a user can chart or export, read from a plant snapshot.

import { AIR_SIDE, CHILLERS, METERS, PUMPS, type PlantSnap } from "./model";
import { MIN, plantAt } from "./sim";

export type PointKey =
  | "supply"
  | "ret"
  | "deltaT"
  | "flow"
  | "tons"
  | "kw"
  | "kwPerTon"
  | "ambient"
  | "chwIn"
  | "chwOut"
  | "loadPct"
  | "running"
  | "lowP1"
  | "highP1"
  | "lowP2"
  | "highP2"
  | "discharge1"
  | "discharge2"
  | "temp"
  | "humid"
  | "supplyAir"
  | "valve"
  | "speed"
  | "pf"
  | "amps"
  | "vLN"
  | "kwh";

export type PointGroup = "chiller" | "pump" | "ahu" | "plant" | "meter";

export interface PointDef {
  id: string;
  deviceId: string;
  group: PointGroup;
  key: PointKey;
  unit: string;
  digits: number;
  /** "state" points are 1 = running, 0 = stopped. */
  kind: "analog" | "state";
  read: (s: PlantSnap) => number | null;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

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

const chillers: PointDef[] = CHILLERS.flatMap(({ id }) => {
  const c = (s: PlantSnap) => s.chillers.find((x) => x.id === id)!;
  const on = (s: PlantSnap) => c(s).state === "on";
  return [
    def(id, "chiller", "chwIn", "°C", 1, (s) => c(s).chwIn),
    def(id, "chiller", "chwOut", "°C", 1, (s) => c(s).chwOut),
    def(id, "chiller", "flow", "CMH", 1, (s) => c(s).flow),
    def(id, "chiller", "loadPct", "%", 0, (s) => c(s).loadPct),
    def(id, "chiller", "kw", "kW", 1, (s) => c(s).kw),
    def(id, "chiller", "kwPerTon", "kW/Ton", 2, (s) => c(s).kwPerTon),
    def(id, "chiller", "lowP1", "bar", 1, (s) => c(s).circuits[0].lowP),
    def(id, "chiller", "highP1", "bar", 1, (s) => c(s).circuits[0].highP),
    def(id, "chiller", "lowP2", "bar", 1, (s) => c(s).circuits[1].lowP),
    def(id, "chiller", "highP2", "bar", 1, (s) => c(s).circuits[1].highP),
    def(id, "chiller", "discharge1", "°C", 1, (s) => c(s).circuits[0].discharge),
    def(id, "chiller", "discharge2", "°C", 1, (s) => c(s).circuits[1].discharge),
    def(id, "chiller", "running", "", 0, (s) => (on(s) ? 1 : 0), "state"),
  ];
});

const air: PointDef[] = AIR_SIDE.flatMap(({ id }) => {
  const a = (s: PlantSnap) => s.air.find((x) => x.id === id)!;
  return [
    def(id, "ahu", "temp", "°C", 1, (s) => a(s).temp),
    def(id, "ahu", "humid", "%RH", 0, (s) => a(s).humid),
    def(id, "ahu", "supplyAir", "°C", 1, (s) => a(s).supplyAir),
    def(id, "ahu", "valve", "%", 0, (s) => a(s).valve),
    def(id, "ahu", "running", "", 0, (s) => (a(s).state === "on" ? 1 : 0), "state"),
  ];
});

const pumps: PointDef[] = PUMPS.flatMap(({ id }) => {
  const p = (s: PlantSnap) => s.pumps.find((x) => x.id === id)!;
  return [def(id, "pump", "speed", "%", 0, (s) => p(s).speed), def(id, "pump", "running", "", 0, (s) => (p(s).state === "on" ? 1 : 0), "state")];
});

const meters: PointDef[] = METERS.flatMap(({ id }) => {
  const m = (s: PlantSnap) => s.meters.find((x) => x.id === id)!;
  return [
    def(id, "meter", "kw", "kW", 1, (s) => m(s).kw[0] + m(s).kw[1] + m(s).kw[2]),
    def(id, "meter", "pf", "", 2, (s) => avg(m(s).pf)),
    def(id, "meter", "amps", "A", 1, (s) => avg(m(s).amps)),
    def(id, "meter", "vLN", "V", 1, (s) => avg(m(s).vLN)),
    def(id, "meter", "kwh", "kWh", 0, (s) => m(s).kwh),
  ];
});

export const POINTS: PointDef[] = [...plant, ...chillers, ...air, ...pumps, ...meters];

export const POINT_GROUPS: { group: PointGroup; devices: string[] }[] = [
  { group: "chiller", devices: CHILLERS.map((d) => d.id) },
  { group: "pump", devices: PUMPS.map((d) => d.id) },
  { group: "ahu", devices: AIR_SIDE.map((d) => d.id) },
  { group: "plant", devices: ["PLANT"] },
  { group: "meter", devices: METERS.map((d) => d.id) },
];

export function pointById(id: string): PointDef | undefined {
  return POINTS.find((p) => p.id === id);
}

export function pointsOf(deviceId: string): PointDef[] {
  return POINTS.filter((p) => p.deviceId === deviceId);
}

export const SAMPLING_MINUTES = [1, 5, 15, 60] as const;
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
  const defs = pointIds.map(pointById).filter((p): p is PointDef => Boolean(p));
  const rows: SampleRow[] = [];
  const end = Math.min(to, now);
  for (let t = Math.ceil(from / step) * step; t <= end; t += step) {
    const snap = plantAt(t);
    rows.push({ t, values: defs.map((p) => p.read(snap)) });
  }
  return rows;
}
