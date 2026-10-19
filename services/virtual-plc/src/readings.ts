// What a gateway would read from each device over Modbus, taken from the web app's plant simulation
// (pdm-app/src/lib/hvac/sim.ts) and shaped as the contract's point keys (catalog.ts).
// The simulation has 3 chillers, 2 pumps, 4 AHU, 1 OAU, 3 meters and 1 panel. A gateway with more
// devices of a kind reuses them, each extra copy running COPY_SHIFT behind so duplicates differ.

import { AIR_SIDE, CHILLERS, METERS, PUMPS, type PlantSnap } from "../../../pdm-app/src/lib/hvac/model";
import { MIN, plantAt, scriptedEvents } from "../../../pdm-app/src/lib/hvac/sim";
import type { DeviceKind, ReadingsOf } from "../../../pdm-app/src/lib/telemetry/catalog";
import type { DeviceReadings } from "../../../pdm-app/src/lib/telemetry/contract";

const AHU_IDS = AIR_SIDE.filter((d) => d.kind === "ahu").map((d) => d.id);
const OAU_IDS = AIR_SIDE.filter((d) => d.kind === "oau").map((d) => d.id);

const SIM_COUNT: Record<DeviceKind, number> = {
  chiller: CHILLERS.length,
  pump: PUMPS.length,
  ahu: AHU_IDS.length,
  oau: OAU_IDS.length,
  meter: METERS.length,
  panel: 1,
};

const COPY_SHIFT = 17 * MIN;

/** A device on a gateway: `index` counts devices of the same kind on that gateway, from 0. */
export interface SimDevice {
  id: string;
  /** Unique across the fleet ("project/gateway/device"): keeps simulated dropouts independent. */
  uid: string;
  kind: DeviceKind;
  index: number;
}

export type Reading = { ok: true; values: DeviceReadings } | { ok: false; reason: string };

const bit = (x: boolean) => (x ? 1 : 0);
/** Simulated device id that a gateway device copies. */
const source = (ids: readonly string[], index: number) => ids[index % ids.length];

function chiller(s: PlantSnap, index: number): ReadingsOf<"chiller"> {
  const c = s.chillers.find((x) => x.id === source(CHILLERS.map((d) => d.id), index))!;
  const [k1, k2] = c.circuits;
  const on = c.state === "on";
  // Modular-chiller points (Carrier 30RAM profile): the second compressor of each tandem pair
  // starts at high load, EXV opening follows load, the first chiller on a gateway is the master.
  const master = index === 0;
  const exv = (open: boolean, extra: number) => (open ? Math.round(140 + 2.6 * c.loadPct + extra) : 0);
  return {
    run: bit(c.state === "on"),
    fault: bit(c.alarm),
    comp1: bit(c.comp[0]),
    comp2: bit(c.comp[1]),
    loadPct: c.loadPct,
    chwIn: c.chwIn,
    chwOut: c.chwOut,
    flow: c.flow,
    kw: c.kw,
    ambient: c.ambient,
    suction1: k1.suction,
    discharge1: k1.discharge,
    coilOut1: k1.coilOut,
    lowP1: k1.lowP,
    highP1: k1.highP,
    suction2: k2.suction,
    discharge2: k2.discharge,
    coilOut2: k2.coilOut,
    lowP2: k2.lowP,
    highP2: k2.highP,
    enabled: 1,
    mode: 1,
    comp1a: bit(c.comp[0]),
    comp1b: bit(c.comp[0] && c.loadPct > 75),
    comp2a: bit(c.comp[1]),
    comp2b: bit(c.comp[1] && c.loadPct > 90),
    fan1: bit(c.comp[0]),
    fan2: bit(c.comp[1]),
    defrost: 0,
    innerCoil1: k1.suction,
    innerCoil2: k2.suction,
    fin1: k1.coilOut,
    fin2: k2.coilOut,
    exv1: exv(c.comp[0], 0),
    exv2: exv(c.comp[1], 6),
    exv3: exv(c.comp[0] && c.loadPct > 75, -10),
    exv4: exv(c.comp[1] && c.loadPct > 90, -4),
    antifreeze: on ? Math.round((c.chwOut - 1.6) * 10) / 10 : c.chwOut,
    setpoint: 7,
    chwInTotal: master ? s.ret : null,
    chwOutTotal: master ? s.supply : null,
    // A scripted compressor fault shows up as "circuit 1 overload" (fault1 bit 14).
    fault1: c.alarm ? 1 << 14 : 0,
    fault2: 0,
    fault3: 0,
    fault4: master ? 0 : null,
  };
}

function pump(s: PlantSnap, index: number): ReadingsOf<"pump"> {
  const p = s.pumps.find((x) => x.id === source(PUMPS.map((d) => d.id), index))!;
  return { run: bit(p.state === "on"), fault: bit(p.state === "fault"), speed: p.speed, hours: p.hours };
}

function air(s: PlantSnap, ids: string[], index: number): ReadingsOf<"ahu"> {
  const id = source(ids, index);
  const a = s.air.find((x) => x.id === id)!;
  const filter = scriptedEvents(s.t, s.t).some((e) => e.deviceId === id && e.code === "filterDirty" && e.start <= s.t && e.end > s.t);
  return {
    run: bit(a.state === "on"),
    fault: bit(a.state === "fault"),
    filter: bit(filter),
    temp: a.temp,
    humid: a.humid,
    setpoint: a.setpoint,
    supplyAir: a.supplyAir,
    valve: a.valve,
  };
}

function meter(s: PlantSnap, index: number): ReadingsOf<"meter"> {
  const m = s.meters.find((x) => x.id === source(METERS.map((d) => d.id), index))!;
  return {
    vAN: m.vLN[0],
    vBN: m.vLN[1],
    vCN: m.vLN[2],
    vAB: m.vLL[0],
    vBC: m.vLL[1],
    vCA: m.vLL[2],
    iA: m.amps[0],
    iB: m.amps[1],
    iC: m.amps[2],
    kwA: m.kw[0],
    kwB: m.kw[1],
    kwC: m.kw[2],
    kvarA: m.kvar[0],
    kvarB: m.kvar[1],
    kvarC: m.kvar[2],
    pfA: m.pf[0],
    pfB: m.pf[1],
    pfC: m.pf[2],
    hz: m.hz,
    kwh: m.kwh,
  };
}

function panel(s: PlantSnap): ReadingsOf<"panel"> {
  return { auto: bit(s.panels[0].mode === "auto"), fault: 0 };
}

const hash = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Deterministic "random" in [0, 1) per key, so a rerun gives the same dropouts. */
export const chance = (key: string) => hash(key) / 4294967296;

/** Share of polls where a device does not answer, and share of single reads that fail. */
const TIMEOUT_RATE = 0.01;
const BAD_READ_RATE = 0.002;

/**
 * Poll one device at time `t` (ms). `shift` (ms) moves the gateway's whole plant back in time, so
 * gateways do not all report the same values; devices on one gateway stay consistent with each other.
 */
export function poll(device: SimDevice, t: number, shift: number): Reading {
  const simT = t - shift - Math.floor(device.index / SIM_COUNT[device.kind]) * COPY_SHIFT;
  const s = plantAt(simT);
  // The simulation's panel loses its link now and then: the gateway sees that as a Modbus timeout.
  if (device.kind === "panel" && !s.panels[0].comm) return { ok: false, reason: "timeout" };
  if (chance(`${device.uid}@${t}`) < TIMEOUT_RATE) return { ok: false, reason: "timeout" };

  const values: DeviceReadings = (() => {
    switch (device.kind) {
      case "chiller":
        return chiller(s, device.index);
      case "pump":
        return pump(s, device.index);
      case "ahu":
        return air(s, AHU_IDS, device.index);
      case "oau":
        return air(s, OAU_IDS, device.index);
      case "meter":
        return meter(s, device.index);
      case "panel":
        return panel(s);
    }
  })();
  for (const key of Object.keys(values)) if (chance(`${device.uid}.${key}@${t}`) < BAD_READ_RATE) values[key] = null;
  return { ok: true, values };
}
