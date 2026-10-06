// Deterministic chiller-plant simulation. Every value is a pure function of time, so the live
// view, trends, reports and alarm logs all agree with each other, and reloads give the same history.
// The physics is simplified but consistent: cooling load sets chiller staging, flow × ΔT gives tons,
// kW/Ton rises with ambient temperature and part load, meters add up to the plant total.
// Replace plantAt() with readings from the BMS / historian (BACnet, Modbus, OPC UA) when wiring real data.

import {
  AIR_SIDE,
  CHILLERS,
  METERS,
  PLANT,
  PUMPS,
  type AirSnap,
  type AlarmCode,
  type AlarmSeverity,
  type ChillerSnap,
  type CircuitSnap,
  type HvacPrediction,
  type MeterSnap,
  type PlantSnap,
  type PumpSnap,
} from "./model";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** The plant runs on Bangkok time (UTC+7) whatever the viewer's time zone. */
const BKK = 7 * HOUR;
/** Reference point for running-hour and energy counters. */
const EPOCH = Date.UTC(2026, 0, 1);

const hashes = new Map<string, number>();
function hash(key: string): number {
  let h = hashes.get(key);
  if (h === undefined) {
    h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h >>>= 0;
    hashes.set(key, h);
  }
  return h;
}

function rand01(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smooth noise in [-1, 1]: cosine interpolation between random knots every `period` ms. */
function noise(key: string, t: number, period: number): number {
  const k = hash(key);
  const x = t / period;
  const i = Math.floor(x);
  const f = x - i;
  const a = rand01(k ^ Math.imul(i, 0x9e3779b1)) * 2 - 1;
  const b = rand01(k ^ Math.imul(i + 1, 0x9e3779b1)) * 2 - 1;
  const w = (1 - Math.cos(f * Math.PI)) / 2;
  return a * (1 - w) + b * w;
}

/** Slow drift plus a little short-term jitter, in roughly [-1, 1]. */
function wobble(key: string, t: number): number {
  return 0.7 * noise(key, t, 3 * HOUR) + 0.3 * noise(`${key}~`, t, 20 * MIN);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function hourOf(t: number): number {
  return (((t + BKK) % DAY) + DAY) % DAY / HOUR;
}

/** 1 at `peak` o'clock, 0 twelve hours away. */
function dayCurve(t: number, peak: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * (hourOf(t) - peak)) / 24);
}

function isWeekend(t: number): boolean {
  const d = new Date(t + BKK).getUTCDay();
  return d === 0 || d === 6;
}

export function dayStart(t: number): number {
  return Math.floor((t + BKK) / DAY) * DAY - BKK;
}

// ---------------------------------------------------------------------------
// Scripted events (faults that are not threshold crossings)
// ---------------------------------------------------------------------------

export interface ScriptedEvent {
  id: string;
  deviceId: string;
  code: AlarmCode;
  severity: AlarmSeverity;
  start: number;
  end: number;
}

const dayEvents = new Map<number, ScriptedEvent[]>();

function eventsOfDay(index: number): ScriptedEvent[] {
  const cached = dayEvents.get(index);
  if (cached) return cached;
  const r = (n: number) => rand01(hash("events") ^ Math.imul(index + 1, 2654435761) ^ Math.imul(n, 40503));
  const start0 = index * DAY - BKK;
  const list: ScriptedEvent[] = [];
  const count = r(1) < 0.4 ? 0 : r(2) < 0.75 ? 1 : 2;
  for (let k = 0; k < count; k++) {
    const pick = r(10 + k);
    const start = start0 + Math.floor(r(20 + k) * DAY);
    let e: Omit<ScriptedEvent, "id" | "start" | "end"> & { dur: number };
    if (pick < 0.35) e = { deviceId: "CP-1", code: "commLoss", severity: "warning", dur: (3 + r(30 + k) * 12) * MIN };
    else if (pick < 0.6) e = { deviceId: "CHP-1", code: "pumpTrip", severity: "critical", dur: (12 + r(30 + k) * 35) * MIN };
    else e = { deviceId: CHILLERS[Math.floor(r(40 + k) * 3)].id, code: "compressorFault", severity: "critical", dur: (20 + r(30 + k) * 70) * MIN };
    list.push({ id: `ev-${index}-${k}`, deviceId: e.deviceId, code: e.code, severity: e.severity, start, end: start + Math.round(e.dur) });
  }
  // Weekly maintenance scenario: AHU-3's filter alarm raises on Monday 08:00 and is cleared on Sunday 18:00.
  const weekday = new Date(start0 + BKK).getUTCDay();
  if (weekday === 1) {
    const start = start0 + 8 * HOUR;
    list.push({ id: `filter-${index}`, deviceId: "AHU-3", code: "filterDirty", severity: "warning", start, end: start + 6 * DAY + 10 * HOUR });
  }
  dayEvents.set(index, list);
  return list;
}

/** Scripted events overlapping [from, to]. */
export function scriptedEvents(from: number, to: number): ScriptedEvent[] {
  const first = Math.floor((from + BKK) / DAY) - 7;
  const last = Math.floor((to + BKK) / DAY);
  const out: ScriptedEvent[] = [];
  for (let d = first; d <= last; d++) for (const e of eventsOfDay(d)) if (e.start <= to && e.end >= from) out.push(e);
  return out.sort((a, b) => a.start - b.start);
}

function activeAt(events: ScriptedEvent[], deviceId: string, code: AlarmCode): boolean {
  return events.some((e) => e.deviceId === deviceId && e.code === code);
}

// ---------------------------------------------------------------------------
// Plant model
// ---------------------------------------------------------------------------

const KWH_BASE: Record<string, number> = { "PM-CH-1": 612_480, "PM-CH-2": 598_210, "PM-CH-3": 341_905 };
const KW_MEAN: Record<string, number> = { "PM-CH-1": 82, "PM-CH-2": 86, "PM-CH-3": 41 };
const LEAD_ORDER = ["CH-1", "CH-2", "CH-3"];
/** CH-2's condenser coil is fouling: same load, more kW (what the PdM layer is expected to catch). */
const FOULING: Record<string, number> = { "CH-1": 0, "CH-2": 0.14, "CH-3": 0.02 };

export function plantAt(t: number): PlantSnap {
  const events = scriptedEvents(t, t).filter((e) => e.start <= t && e.end > t);
  const ambient = round(27.2 + 6.4 * dayCurve(t, 14) + 0.9 * wobble("amb", t));
  const loadFrac = (0.5 + 0.17 * dayCurve(t, 14) + 0.04 * wobble("load", t)) * (isWeekend(t) ? 0.88 : 1);
  const demand = loadFrac * PLANT.chillerCapacityTon * CHILLERS.length;

  // Staging: lead/lag order, faulted machines skipped. Shortfall lets supply temperature drift up.
  const needed = demand > 205 ? 3 : 2;
  const available = LEAD_ORDER.filter((id) => !activeAt(events, id, "compressorFault"));
  const running = available.slice(0, needed);
  const capacity = running.length * PLANT.chillerCapacityTon;
  const tons = Math.min(demand, capacity * 0.98);
  const shortfall = clamp((demand - capacity * 0.9) / PLANT.chillerCapacityTon, 0, 1.5);
  const avgLoad = running.length ? tons / capacity : 0;
  const supply = round(PLANT.supplySetpoint + 0.12 * wobble("sup", t) + 0.6 * Math.max(0, avgLoad - 0.85) + 1.3 * shortfall, 1);

  const chillers: ChillerSnap[] = [];
  let flow = 0;
  for (const def of CHILLERS) {
    const id = def.id;
    const on = running.includes(id);
    const fault = activeAt(events, id, "compressorFault");
    const share = on ? 1 + 0.03 * noise(`${id}share`, t, HOUR) : 0;
    const chTons = on ? (tons / running.length) * share : 0;
    const loadPct = on ? clamp(chTons / PLANT.chillerCapacityTon, 0, 1) : 0;
    const chFlow = on ? PLANT.flowPerChiller + 1.8 * noise(`${id}flow`, t, 40 * MIN) : 0;
    flow += chFlow;
    const kwPerTon = on ? 1.0 + 0.02 * (ambient - 30) + 0.25 * (1 - loadPct) ** 2 + FOULING[id] + 0.015 * wobble(`${id}eff`, t) : null;
    const kw = on && kwPerTon ? kwPerTon * chTons : 0;
    const comp2 = on && loadPct > 0.5;
    const circuit = (n: 1 | 2, active: boolean): CircuitSnap =>
      active
        ? {
            suction: round(supply - 4 + 0.4 * noise(`${id}s${n}`, t, 30 * MIN)),
            discharge: round(62 + 8 * loadPct + 0.4 * (ambient - 30) + noise(`${id}d${n}`, t, 30 * MIN)),
            coilOut: round(ambient + 7 + 0.6 * noise(`${id}c${n}`, t, 30 * MIN)),
            lowP: round(8.6 + 0.1 * (supply - 7) + 0.25 * noise(`${id}lp${n}`, t, 30 * MIN)),
            highP: round(26 + 0.55 * (ambient - 30) + 2 * loadPct + 0.5 * noise(`${id}hp${n}`, t, 30 * MIN) + (FOULING[id] > 0.1 ? 1.4 : 0)),
          }
        : {
            suction: round(ambient - 1),
            discharge: round(ambient + 1),
            coilOut: round(ambient),
            lowP: round(17.2 + 0.2 * noise(`${id}eq${n}`, t, HOUR)),
            highP: round(17.4 + 0.2 * noise(`${id}eq${n}`, t, HOUR)),
          };
    chillers.push({
      id,
      state: fault ? "fault" : on ? "on" : "standby",
      mode: on ? "cooling" : fault ? "off" : "standby",
      alarm: fault,
      comp: [on, comp2],
      loadPct: round(loadPct * 100, 0),
      tons: round(chTons, 1),
      kw: round(kw, 1),
      kwPerTon: kwPerTon ? round(kwPerTon, 2) : null,
      chwIn: 0, // filled in below, once the plant return temperature is known
      chwOut: on ? round(supply + 0.1 * noise(`${id}out`, t, 20 * MIN)) : 0,
      flow: round(chFlow, 1),
      ambient,
      circuits: [circuit(1, on), circuit(2, comp2)],
    });
  }

  const deltaT = flow > 0 ? (tons * 3.517) / (flow * 1.163) : 0;
  const ret = round(supply + deltaT);
  for (const c of chillers) {
    c.chwIn = c.state === "on" ? round(ret + 0.1 * noise(`${c.id}in`, t, 20 * MIN)) : round(ret);
    if (c.state !== "on") c.chwOut = round(ret);
  }

  const air: AirSnap[] = AIR_SIDE.map((def) => {
    const id = def.id;
    if (def.kind === "oau") {
      return {
        id,
        kind: "oau",
        state: "on",
        mode: "cool",
        temp: round(16.2 + 0.5 * wobble(`${id}t`, t) + 0.4 * shortfall),
        humid: round(60 + 3 * wobble(`${id}h`, t), 0),
        setpoint: 16,
        supplyAir: round(15.8 + 0.4 * wobble(`${id}sa`, t)),
        valve: round(clamp(55 + 30 * dayCurve(t, 14) + 6 * wobble(`${id}v`, t), 0, 100), 0),
      };
    }
    const bias = id === "AHU-3" ? 9 : 0;
    return {
      id,
      kind: "ahu",
      state: "on",
      mode: "cool",
      temp: round(23.3 + 0.45 * wobble(`${id}t`, t) + 0.7 * dayCurve(t, 15) + 0.9 * shortfall),
      humid: round(53 + 3.5 * wobble(`${id}h`, t) + 3 * dayCurve(t, 15) + bias, 0),
      setpoint: 24,
      supplyAir: round(supply + 6.2 + 0.4 * wobble(`${id}sa`, t)),
      valve: round(clamp(32 + 40 * dayCurve(t, 14) + 8 * wobble(`${id}v`, t) + (id === "AHU-3" ? 12 : 0), 0, 100), 0),
    };
  });

  const tripped = activeAt(events, "CHP-1", "pumpTrip");
  const pumps: PumpSnap[] = PUMPS.map((def, i) => {
    const duty = i === 0;
    const on = duty ? !tripped : tripped;
    return {
      id: def.id,
      state: duty && tripped ? "fault" : on ? "on" : "standby",
      role: duty ? "duty" : "standby",
      speed: on ? round(78 + 8 * dayCurve(t, 14) + 2 * wobble(`${def.id}sp`, t), 0) : 0,
      hours: Math.floor((duty ? 18_240 : 9_115) + ((t - EPOCH) / HOUR) * (duty ? 0.97 : 0.03)),
    };
  });

  const commLoss = activeAt(events, "CP-1", "commLoss");
  const panel = { id: "CP-1", state: commLoss ? ("offline" as const) : ("on" as const), mode: "auto" as const, comm: !commLoss };

  const meters: MeterSnap[] = METERS.map((def) => {
    const ch = chillers.find((c) => c.id === def.chillerId)!;
    const on = ch.state === "on";
    const total = ch.kw + 0.8;
    const pfBase = on ? 0.885 - (def.chillerId === "CH-2" ? 0.025 : 0) : 0.62;
    const phases = [0, 1, 2].map((p) => {
      const vLN = 229.6 + 1.3 * noise(`${def.id}v${p}`, t, 45 * MIN);
      const pf = clamp(pfBase + 0.012 * noise(`${def.id}pf${p}`, t, 30 * MIN), 0.4, 0.99);
      const kw = (total / 3) * (1 + 0.02 * noise(`${def.id}im${p}`, t, 2 * HOUR));
      const amps = (kw * 1000) / (vLN * pf);
      const kvar = kw * Math.tan(Math.acos(pf));
      return { vLN, pf, kw, amps, kvar };
    });
    const vLL = [0, 1, 2].map((p) => ((phases[p].vLN + phases[(p + 1) % 3].vLN) / 2) * Math.sqrt(3));
    return {
      id: def.id,
      chillerId: def.chillerId,
      state: "on",
      vLN: phases.map((p) => round(p.vLN, 1)) as [number, number, number],
      vLL: vLL.map((v) => round(v, 1)) as [number, number, number],
      amps: phases.map((p) => round(p.amps, 1)) as [number, number, number],
      kw: phases.map((p) => round(p.kw, 2)) as [number, number, number],
      kvar: phases.map((p) => round(p.kvar, 2)) as [number, number, number],
      pf: phases.map((p) => round(p.pf, 2)) as [number, number, number],
      hz: round(50 + 0.03 * noise(`${def.id}hz`, t, 10 * MIN), 2),
      kwh: Math.round(KWH_BASE[def.id] + (KW_MEAN[def.id] * (t - EPOCH)) / HOUR),
    };
  });

  const plantKw = meters.reduce((sum, mt) => sum + mt.kw[0] + mt.kw[1] + mt.kw[2], 0);
  const chillerKw = chillers.reduce((sum, c) => sum + c.kw, 0);
  return {
    t,
    ambient,
    supply,
    ret,
    deltaT: round(deltaT),
    flow: round(flow, 0),
    tons: round(tons, 0),
    kw: round(plantKw, 1),
    kwPerTon: tons > 0 ? round(chillerKw / tons, 2) : null,
    chillers,
    air,
    pumps,
    panel,
    meters,
  };
}

/** Energy used by one meter between two instants, kWh (15-minute integration). */
export function energyBetween(meterId: string, from: number, to: number): number {
  const step = 15 * MIN;
  let kwh = 0;
  for (let t = from; t < to; t += step) {
    const span = Math.min(step, to - t);
    const mt = plantAt(t + span / 2).meters.find((x) => x.id === meterId)!;
    kwh += ((mt.kw[0] + mt.kw[1] + mt.kw[2]) * span) / HOUR;
  }
  return kwh;
}

/** Predictive-maintenance layer: model output per device, refreshed hourly. */
export function predictions(now: number): HvacPrediction[] {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const modelRunAt = now - hourStart >= 7 * MIN ? hourStart + 7 * MIN : hourStart - 53 * MIN;
  return [
    { deviceId: "CH-1", health: 93, finding: "none", daysLow: 180, daysHigh: 365, confidence: 0.86, modelRunAt },
    { deviceId: "CH-2", health: 71, finding: "condenserFouling", daysLow: 21, daysHigh: 35, confidence: 0.82, modelRunAt },
    { deviceId: "CH-3", health: 90, finding: "none", daysLow: 180, daysHigh: 365, confidence: 0.84, modelRunAt },
    { deviceId: "CHP-1", health: 84, finding: "bearingWear", daysLow: 60, daysHigh: 110, confidence: 0.68, modelRunAt },
  ];
}
