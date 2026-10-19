// Point catalog (tag list) per device kind: the keys a gateway sends for each kind of device,
// in engineering units after scaling. The PLC program maps each key to the vendor's Modbus register.
// Gateways may send extra keys; the cloud stores them and flags keys that are not in this list.
// Values derived from several devices (ΔT, plant tons, kW/Ton) are computed in the cloud, not sent.

export type PointType = "analog" | "state" | "counter" | "code" | "bits";

export interface PointSpec<K extends string = string> {
  key: K;
  unit: string;
  /**
   * state: 0/1 (1 = running / fault active / auto). counter: only ever grows (kWh, run hours).
   * code: a whole number from a list (operating mode 1 = cooling, ...).
   * bits: a raw 16-bit status or fault word sent as an integer; the cloud decodes each bit
   * with the device's register profile (profiles/), so new fault names need no PLC change.
   */
  type: PointType;
}

const analog = <K extends string>(key: K, unit: string): PointSpec<K> => ({ key, unit, type: "analog" });
const state = <K extends string>(key: K): PointSpec<K> => ({ key, unit: "", type: "state" });
const counter = <K extends string>(key: K, unit: string): PointSpec<K> => ({ key, unit, type: "counter" });
const code = <K extends string>(key: K): PointSpec<K> => ({ key, unit: "", type: "code" });
const bits = <K extends string>(key: K): PointSpec<K> => ({ key, unit: "", type: "bits" });

/** Refrigerant circuit n of a chiller. */
const circuit = <N extends 1 | 2>(n: N) =>
  [
    analog(`suction${n}`, "°C"),
    analog(`discharge${n}`, "°C"),
    analog(`coilOut${n}`, "°C"),
    analog(`lowP${n}`, "bar"),
    analog(`highP${n}`, "bar"),
  ] as const;

const airHandler = [
  state("run"),
  state("fault"),
  state("filter"),
  analog("temp", "°C"),
  analog("humid", "%RH"),
  analog("setpoint", "°C"),
  analog("supplyAir", "°C"),
  analog("valve", "%"),
] as const;

export const POINT_CATALOG = {
  chiller: [
    state("run"),
    state("fault"),
    state("comp1"),
    state("comp2"),
    analog("loadPct", "%"),
    analog("chwIn", "°C"),
    analog("chwOut", "°C"),
    analog("flow", "CMH"),
    analog("kw", "kW"),
    analog("ambient", "°C"),
    ...circuit(1),
    ...circuit(2),
    // Points that modular chillers report (first mapped: Carrier 30RAM/RHM-X, profiles/carrier-30ram.ts).
    // A model sends the ones it has; the rest are simply left out of the message.
    state("enabled"), // unit switched on (it may still be idle in standby)
    code("mode"), // 1 cooling, 2 heating, 4 water pump only
    state("comp1a"),
    state("comp1b"),
    state("comp2a"),
    state("comp2b"), // each compressor of a tandem circuit; comp1 / comp2 = either one running
    state("fan1"),
    state("fan2"),
    state("defrost"),
    analog("innerCoil1", "°C"),
    analog("innerCoil2", "°C"), // refrigerant temperature at the water-side heat exchanger
    analog("fin1", "°C"),
    analog("fin2", "°C"), // outdoor (air-side) coil fin temperature
    analog("exv1", "step"),
    analog("exv2", "step"),
    analog("exv3", "step"),
    analog("exv4", "step"), // electronic expansion valve opening, 0-480 steps
    analog("antifreeze", "°C"),
    analog("setpoint", "°C"), // chilled-water outlet set point
    analog("chwInTotal", "°C"),
    analog("chwOutTotal", "°C"), // common header temperatures, sent by the master module only
    bits("fault1"),
    bits("fault2"),
    bits("fault3"),
    bits("fault4"),
  ],
  pump: [state("run"), state("fault"), analog("speed", "%"), counter("hours", "h")],
  ahu: airHandler,
  oau: airHandler,
  meter: [
    analog("vAN", "V"),
    analog("vBN", "V"),
    analog("vCN", "V"),
    analog("vAB", "V"),
    analog("vBC", "V"),
    analog("vCA", "V"),
    analog("iA", "A"),
    analog("iB", "A"),
    analog("iC", "A"),
    analog("kwA", "kW"),
    analog("kwB", "kW"),
    analog("kwC", "kW"),
    analog("kvarA", "kvar"),
    analog("kvarB", "kvar"),
    analog("kvarC", "kvar"),
    analog("pfA", ""),
    analog("pfB", ""),
    analog("pfC", ""),
    analog("hz", "Hz"),
    counter("kwh", "kWh"),
  ],
  panel: [state("auto"), state("fault")],
} as const satisfies Record<string, readonly PointSpec[]>;

export type DeviceKind = keyof typeof POINT_CATALOG;
export const DEVICE_KINDS = Object.keys(POINT_CATALOG) as DeviceKind[];

export type PointKeyOf<K extends DeviceKind> = (typeof POINT_CATALOG)[K][number]["key"];

/** One cycle's readings for a device of kind K, typed so a missing or misspelled key fails to compile. */
export type ReadingsOf<K extends DeviceKind> = Record<PointKeyOf<K>, number | null>;

export function isDeviceKind(x: string): x is DeviceKind {
  return x in POINT_CATALOG;
}

export function pointSpec(kind: DeviceKind, key: string): PointSpec | undefined {
  return (POINT_CATALOG[kind] as readonly PointSpec[]).find((p) => p.key === key);
}

/** State points (0/1). */
export function statePoints(kind: DeviceKind): string[] {
  return (POINT_CATALOG[kind] as readonly PointSpec[]).filter((p) => p.type === "state").map((p) => p.key);
}

/** Points whose change is published at once on the event channel: state, code and bits. */
export function eventPoints(kind: DeviceKind): string[] {
  return (POINT_CATALOG[kind] as readonly PointSpec[]).filter((p) => p.type === "state" || p.type === "code" || p.type === "bits").map((p) => p.key);
}
