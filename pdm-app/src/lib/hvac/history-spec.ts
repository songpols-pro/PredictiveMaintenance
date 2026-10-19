// History of the /hvac points (points.ts) from the stored gateway readings (TimescaleDB):
//  1. dependencies(): the raw device points each chart point needs, so a query fetches only those
//     (the free database is far away, and a plant total needs several devices);
//  2. the server averages analog points per time bucket and takes the last value of states, codes
//     and counters (a "running" average of 0.5 means nothing);
//  3. rowsFromBuckets(): every bucket goes through snapFromReadings, the function the live view uses,
//     and each chart point is read from that snapshot, so history and live screens agree.

import { POINT_CATALOG, type PointType } from "@/lib/telemetry/catalog";
import { snapFromReadings, type Readings } from "./from-readings";
import { SIM_LAYOUT, type PlantLayout } from "./layout";
import { pointById, type PointDef, type SampleRow } from "./points";

const CHILLER_STATE = ["run", "fault", "enabled"];
const METER_KW = ["kwA", "kwB", "kwC"];

/** Raw keys a chart point needs from its own device. */
const OWN: Record<string, Record<string, string[]>> = {
  chiller: {
    chwIn: ["chwIn"],
    chwOut: ["chwOut"],
    flow: ["flow", ...CHILLER_STATE],
    loadPct: ["loadPct", "comp1a", "comp1b", "comp2a", "comp2b"],
    kw: ["kw"],
    kwPerTon: ["kw", "flow", "chwIn", "chwOut", ...CHILLER_STATE],
    running: CHILLER_STATE,
    lowP1: ["lowP1"],
    highP1: ["highP1"],
    lowP2: ["lowP2"],
    highP2: ["highP2"],
    discharge1: ["discharge1"],
    discharge2: ["discharge2"],
  },
  ahu: { temp: ["temp"], humid: ["humid"], supplyAir: ["supplyAir"], valve: ["valve"], running: ["run", "fault"] },
  pump: { speed: ["speed", "run", "fault"], running: ["run", "fault"] },
  meter: {
    kw: METER_KW,
    pf: ["pfA", "pfB", "pfC"],
    amps: ["iA", "iB", "iC"],
    vLN: ["vAN", "vBN", "vCN"],
    kwh: ["kwh"],
  },
};

/** Plant points are computed from every chiller (and the meters for power). */
const PLANT: Record<string, { chillers?: string[]; meters?: string[] }> = {
  supply: { chillers: ["chwOutTotal", "chwOut", ...CHILLER_STATE] },
  ret: { chillers: ["chwInTotal", "chwIn", ...CHILLER_STATE] },
  deltaT: { chillers: ["chwOutTotal", "chwInTotal", "chwOut", "chwIn", ...CHILLER_STATE] },
  flow: { chillers: ["flow", ...CHILLER_STATE] },
  tons: { chillers: ["flow", "chwIn", "chwOut", ...CHILLER_STATE] },
  kw: { chillers: ["kw", ...CHILLER_STATE], meters: METER_KW },
  kwPerTon: { chillers: ["kw", "flow", "chwIn", "chwOut", ...CHILLER_STATE], meters: METER_KW },
  ambient: { chillers: ["ambient"] },
};

/** Chiller points that use its power, which comes from the meters that measure it (meterFor) when it has any. */
const CHILLER_KW = new Set(["kw", "kwPerTon"]);

/** device → raw point keys needed for these chart points (plant totals take every chiller and meter of the layout). */
export function dependencies(pointIds: string[], layout: PlantLayout = SIM_LAYOUT): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (device: string, keys: string[]) => {
    const set = out.get(device) ?? new Set<string>();
    for (const k of keys) set.add(k);
    out.set(device, set);
  };
  for (const id of pointIds) {
    const def = pointById(id, layout);
    if (!def) continue;
    if (def.group === "plant") {
      const need = PLANT[def.key] ?? {};
      if (need.chillers) for (const c of layout.chillers) add(c.id, need.chillers);
      if (need.meters) for (const mt of layout.meters) add(mt.id, need.meters);
    } else {
      add(def.deviceId, OWN[def.group]?.[def.key] ?? [def.key]);
      if (def.group === "chiller" && CHILLER_KW.has(def.key)) for (const mt of layout.meters) if (mt.meterFor === def.deviceId) add(mt.id, METER_KW);
    }
  }
  return out;
}

const KEY_TYPE = new Map<string, PointType>();
for (const list of Object.values(POINT_CATALOG)) for (const p of list) if (!KEY_TYPE.has(p.key)) KEY_TYPE.set(p.key, p.type);

/** How a key is reduced to one value per time bucket: analog points average, the rest keep the last value. */
export function reduceBy(key: string): "avg" | "last" {
  return (KEY_TYPE.get(key) ?? "analog") === "analog" ? "avg" : "last";
}

export interface Bucket {
  /** Bucket start (ms). */
  t: number;
  readings: Readings;
}

/** One row per step in [from, min(to, now)], like the simulation; a step with no stored data gives nulls. */
export function rowsFromBuckets(pointIds: string[], buckets: Bucket[], from: number, to: number, step: number, now = Date.now(), layout: PlantLayout = SIM_LAYOUT): SampleRow[] {
  const defs = pointIds.map((id) => pointById(id, layout)).filter((p): p is PointDef => Boolean(p));
  const byTime = new Map(buckets.map((b) => [b.t, b.readings]));
  const rows: SampleRow[] = [];
  const end = Math.min(to, now);
  for (let t = Math.ceil(from / step) * step; t <= end; t += step) {
    const readings = byTime.get(t);
    if (!readings) {
      rows.push({ t, values: defs.map(() => null) });
      continue;
    }
    const snap = snapFromReadings(t, readings, undefined, layout);
    rows.push({
      t,
      values: defs.map((d) => {
        const v = d.read(snap);
        return v === null || !Number.isFinite(v) ? null : v;
      }),
    });
  }
  return rows;
}
