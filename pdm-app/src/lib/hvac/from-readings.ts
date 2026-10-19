// Plant snapshot for the /hvac screens, built from what the gateways report: per device, the point
// keys of the telemetry contract (lib/telemetry/catalog.ts). The live view (Firestore) and every
// history sample (TimescaleDB) go through this one function, so screens, trends and reports agree.
//
// A point a device does not report (a Carrier 30RAM has no flow, kW or refrigerant pressures) becomes
// NaN, which the screens show as "—" or leave out. Values the gateways do not send are derived here, as in
// the simulation: tons = flow × 1.163 × ΔT ÷ 3.517, chiller kW = the meters that measure it (meterFor) when
// it has any, kW/Ton = chiller kW ÷ tons, plant kW = meter totals.

import { SIM_LAYOUT, type PlantLayout } from "./layout";
import type { AirSnap, ChillerSnap, MeterSnap, PanelSnap, PlantSnap, PumpSnap, RunState } from "./model";

export interface DeviceReading {
  /** Point key → value in engineering units; null when the gateway could not read it. */
  values: Record<string, number | null>;
  /** False when the device did not answer the gateway's last poll. */
  ok: boolean;
}

export type Readings = Record<string, DeviceReading | undefined>;

const num = (v: number | null | undefined): number => (typeof v === "number" ? v : Number.NaN);
const finite = (xs: number[]) => xs.filter((x) => Number.isFinite(x));
const avg = (xs: number[]) => {
  const f = finite(xs);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : Number.NaN;
};
/** Sum of the values, NaN when any is unknown (a partial plant total would mislead). */
const sumAll = (xs: number[]) => (xs.every((x) => Number.isFinite(x)) ? xs.reduce((a, b) => a + b, 0) : Number.NaN);

/** CMH × °C → refrigeration tons. */
const toTons = (flow: number, deltaT: number) => (flow * 1.163 * deltaT) / 3.517;

function baseState(r: DeviceReading | undefined, offline: boolean): RunState | null {
  if (!r || !r.ok || offline) return "offline";
  if (r.values.fault === 1) return "fault";
  return null;
}

/** A 0/1 state point; null when the device does not report it. */
const onOff = (v: number | null | undefined): boolean | null => (typeof v === "number" ? v === 1 : null);

/**
 * @param meters the meters that measure this chiller (registry meterFor) and their total kW: null when it
 *               has none, NaN when one of them is offline
 */
function chiller(id: string, r: DeviceReading | undefined, offline: boolean, meters: { ids: string[]; kw: number | null }): ChillerSnap {
  const v = r?.values ?? {};
  const state: RunState = baseState(r, offline) ?? (v.run === 1 ? "on" : v.enabled === 0 ? "off" : "standby");
  const on = state === "on";
  const chwIn = num(v.chwIn);
  const chwOut = num(v.chwOut);
  // A stopped chiller moves no water, unless it has no flow reading at all: then flow stays unknown.
  const measured = num(v.flow);
  const flow = on || !Number.isFinite(measured) ? measured : 0;
  const tons = on ? toTons(flow, chwIn - chwOut) : Number.isFinite(flow) ? 0 : Number.NaN;
  // An assigned meter measures the chiller's whole input, so it wins; the chiller's own reading is the fallback.
  const fromMeters = meters.kw !== null && Number.isFinite(meters.kw);
  const kw = fromMeters ? meters.kw! : num(v.kw);
  // Without a load reading, the share of compressors running: a modular unit loads in compressor steps.
  const compressors: ChillerSnap["compressors"] = [onOff(v.comp1a), onOff(v.comp1b), onOff(v.comp2a), onOff(v.comp2b)];
  const staged = compressors.filter((c) => c !== null);
  const loadFromStages = Number.isNaN(num(v.loadPct)) && staged.length > 0;
  const circuit = (n: 1 | 2) => ({
    suction: num(v[`suction${n}`]),
    discharge: num(v[`discharge${n}`]),
    coilOut: num(v[`coilOut${n}`]),
    lowP: num(v[`lowP${n}`]),
    highP: num(v[`highP${n}`]),
    innerCoil: num(v[`innerCoil${n}`]),
    fin: num(v[`fin${n}`]),
  });
  return {
    id,
    state,
    mode: on ? "cooling" : state === "standby" ? "standby" : "off",
    alarm: v.fault === 1,
    comp: [v.comp1 === 1, v.comp2 === 1],
    loadPct: loadFromStages ? (100 * staged.filter(Boolean).length) / staged.length : num(v.loadPct),
    loadFromStages,
    tons,
    kw,
    kwMeters: fromMeters ? meters.ids : [],
    kwPerTon: !Number.isFinite(tons) || !Number.isFinite(kw) ? Number.NaN : on && tons > 0 ? kw / tons : null,
    chwIn,
    chwOut,
    flow,
    ambient: num(v.ambient),
    circuits: [circuit(1), circuit(2)],
    setpoint: num(v.setpoint),
    modeCode: num(v.mode),
    compressors,
    fans: [onOff(v.fan1), onOff(v.fan2)],
    defrost: onOff(v.defrost),
    antifreeze: num(v.antifreeze),
    exv: [num(v.exv1), num(v.exv2), num(v.exv3), num(v.exv4)],
    headerIn: num(v.chwInTotal),
    headerOut: num(v.chwOutTotal),
  };
}

function air(id: string, kind: "ahu" | "oau", r: DeviceReading | undefined, offline: boolean): AirSnap {
  const v = r?.values ?? {};
  const state: RunState = baseState(r, offline) ?? (v.run === 1 ? "on" : "off");
  return {
    id,
    kind,
    state,
    mode: state === "on" ? "cool" : "off",
    temp: num(v.temp),
    humid: num(v.humid),
    setpoint: num(v.setpoint),
    supplyAir: num(v.supplyAir),
    valve: num(v.valve),
  };
}

function pump(id: string, duty: boolean, r: DeviceReading | undefined, offline: boolean): PumpSnap {
  const v = r?.values ?? {};
  const state: RunState = baseState(r, offline) ?? (v.run === 1 ? "on" : "standby");
  return { id, state, role: duty ? "duty" : "standby", speed: state === "on" ? num(v.speed) : 0, hours: num(v.hours) };
}

function panel(id: string, r: DeviceReading | undefined, offline: boolean): PanelSnap {
  const ok = Boolean(r?.ok) && !offline;
  return { id, state: ok ? "on" : "offline", mode: r?.values.auto === 0 ? "manual" : "auto", comm: ok };
}

function meter(id: string, chillerId: string | null, r: DeviceReading | undefined, offline: boolean): MeterSnap {
  const v = r?.values ?? {};
  const three = (a: string, b: string, c: string): [number, number, number] => [num(v[a]), num(v[b]), num(v[c])];
  return {
    id,
    chillerId,
    state: !r || !r.ok || offline ? "offline" : "on",
    vLN: three("vAN", "vBN", "vCN"),
    vLL: three("vAB", "vBC", "vCA"),
    amps: three("iA", "iB", "iC"),
    kw: three("kwA", "kwB", "kwC"),
    kvar: three("kvarA", "kvarB", "kvarC"),
    pf: three("pfA", "pfB", "pfC"),
    hz: num(v.hz),
    kwh: num(v.kwh),
  };
}

/**
 * @param t        time of the readings (ms)
 * @param readings device id → its latest (or bucket-averaged) values
 * @param offline  devices whose gateway is offline or silent: shown as offline whatever they last said
 * @param layout   the project's devices (registry); the simulation's equipment by default
 */
export function snapFromReadings(t: number, readings: Readings, offline: (deviceId: string) => boolean = () => false, layout: PlantLayout = SIM_LAYOUT): PlantSnap {
  const meters = layout.meters.map((d) => meter(d.id, d.meterFor ?? null, readings[d.id], offline(d.id)));
  const meterTotal = (mt: MeterSnap) => (mt.state === "on" ? mt.kw[0] + mt.kw[1] + mt.kw[2] : Number.NaN);
  const metersOf = (chillerId: string) => {
    const own = meters.filter((mt) => mt.chillerId === chillerId);
    return { ids: own.map((mt) => mt.id), kw: own.length ? sumAll(own.map(meterTotal)) : null };
  };
  const chillers = layout.chillers.map((d) => chiller(d.id, readings[d.id], offline(d.id), metersOf(d.id)));
  const airSide = layout.air.map((d) => air(d.id, d.kind === "oau" ? "oau" : "ahu", readings[d.id], offline(d.id)));
  // Pump role: as configured, else the first pump is the duty pump.
  const pumps = layout.pumps.map((d, i) => pump(d.id, d.role ? d.role === "duty" : i === 0, readings[d.id], offline(d.id)));
  const panels = layout.panels.map((d) => panel(d.id, readings[d.id], offline(d.id)));

  const running = chillers.filter((c) => c.state === "on");
  // The master module of a modular chiller reports the common header temperatures; else average the running units.
  const header = (key: "chwOutTotal" | "chwInTotal") => avg(layout.chillers.map((d) => num(readings[d.id]?.values[key])));
  const supplyHeader = header("chwOutTotal");
  const returnHeader = header("chwInTotal");
  const supply = Number.isFinite(supplyHeader) ? supplyHeader : avg(running.map((c) => c.chwOut));
  const ret = Number.isFinite(returnHeader) ? returnHeader : avg(running.map((c) => c.chwIn));
  const flow = running.length ? sumAll(running.map((c) => c.flow)) : 0;
  const tons = running.length ? sumAll(running.map((c) => c.tons)) : 0;
  // With meters, plant kW is their total: an offline meter (its values are the last ones it sent) makes it
  // unknown rather than a total that silently leaves that meter out.
  const meterKw = meters.map(meterTotal);
  const chillerKw = sumAll(running.map((c) => c.kw));
  const kw = meterKw.length ? sumAll(meterKw) : chillerKw;

  return {
    t,
    ambient: avg(chillers.map((c) => c.ambient)),
    supply,
    ret,
    deltaT: ret - supply,
    flow,
    tons,
    kw,
    kwPerTon: !Number.isFinite(tons) || !Number.isFinite(chillerKw) ? Number.NaN : tons > 0 ? chillerKw / tons : null,
    chillers,
    air: airSide,
    pumps,
    panels,
    meters,
  };
}
