// Chiller plant (BMS) module: equipment catalog, snapshot types and site branding.
// Layout follows the customer's mock-up: 4 AHU + 1 OAU on the air side, 3 air-cooled chillers,
// 2 chilled-water pumps (duty / standby), 1 control kit and 1 power meter per chiller.

export type DeviceKind = "ahu" | "oau" | "chiller" | "pump" | "panel" | "meter";

/** Run state shown on every device. Never conveyed by color alone: the badge always has an icon and a word. */
export type RunState = "on" | "off" | "standby" | "fault" | "offline";

export interface DeviceDef {
  id: string;
  kind: DeviceKind;
  /** Label printed on the plant diagram, as in the mock-up ("CHILLER-1", "Power Meter-1"). */
  name: string;
}

export const AIR_SIDE: DeviceDef[] = [
  { id: "AHU-1", kind: "ahu", name: "AHU-1" },
  { id: "AHU-2", kind: "ahu", name: "AHU-2" },
  { id: "AHU-3", kind: "ahu", name: "AHU-3" },
  { id: "AHU-4", kind: "ahu", name: "AHU-4" },
  { id: "OAU-1", kind: "oau", name: "OAU-1" },
];

export const CHILLERS: DeviceDef[] = [
  { id: "CH-1", kind: "chiller", name: "CHILLER-1" },
  { id: "CH-2", kind: "chiller", name: "CHILLER-2" },
  { id: "CH-3", kind: "chiller", name: "CHILLER-3" },
];

export const PUMPS: DeviceDef[] = [
  { id: "CHP-1", kind: "pump", name: "CHP-1" },
  { id: "CHP-2", kind: "pump", name: "CHP-2" },
];

export const PANEL: DeviceDef = { id: "CP-1", kind: "panel", name: "Control Kit" };

export const METERS: (DeviceDef & { chillerId: string; label: string })[] = [
  { id: "PM-CH-1", kind: "meter", name: "Power Meter-1", label: "PM-CH-1", chillerId: "CH-1" },
  { id: "PM-CH-2", kind: "meter", name: "Power Meter-2", label: "PM-CH-2", chillerId: "CH-2" },
  { id: "PM-CH-3", kind: "meter", name: "Power Meter-3", label: "PM-CH-3", chillerId: "CH-3" },
];

export const ALL_DEVICES: DeviceDef[] = [...AIR_SIDE, ...CHILLERS, ...PUMPS, PANEL, ...METERS];

export function deviceById(id: string): DeviceDef | undefined {
  return ALL_DEVICES.find((d) => d.id === id);
}

/** Plant design figures used by the simulation and the KPI captions. */
export const PLANT = {
  chillerCapacityTon: 120,
  /** Design chilled-water flow per running chiller, m³/h (CMH). */
  flowPerChiller: 60,
  supplySetpoint: 7,
  /** Efficiency bands for an air-cooled plant, kW/Ton (lower is better). */
  efficiencyGood: 1.05,
  efficiencyFair: 1.25,
};

/**
 * Branding slots from the mock-up ("Can add owner logo", "Can add any logo", "Designed by").
 * Logos are left empty in the repository; drop files into /public/hvac and set the paths.
 * With live data, a project's registry can set its own owner logo, which replaces ownerLogo here
 * (`ownerLogo` of the registry, lib/access/registry.ts).
 */
export const HVAC_SITE = {
  ownerLogo: null as string | null,
  partnerLogos: [null, null] as (string | null)[],
  designedBy: null as string | null,
};

// Values a device does not report are NaN (numbers) or null (on/off), so screens can leave them out.

export interface CircuitSnap {
  suction: number;
  discharge: number;
  coilOut: number;
  lowP: number;
  highP: number;
  /** Refrigerant temperature at the water-side heat exchanger (modular chillers). */
  innerCoil: number;
  /** Outdoor (air-side) coil fin temperature. */
  fin: number;
}

export interface ChillerSnap {
  id: string;
  state: RunState;
  mode: "cooling" | "standby" | "off";
  alarm: boolean;
  comp: [boolean, boolean];
  loadPct: number;
  /** loadPct is the share of compressors running: the chiller reports no load of its own. */
  loadFromStages: boolean;
  /** 0 while stopped; NaN when it cannot be computed (no flow reading). */
  tons: number;
  /** Power: the chiller's own power meters (registry meterFor) when it has any, else its own reading. */
  kw: number;
  /** The meters kW comes from; empty when it is the chiller's own reading. */
  kwMeters: string[];
  /** null while not running; NaN when it cannot be computed (no flow or power reading). */
  kwPerTon: number | null;
  chwIn: number;
  chwOut: number;
  /** 0 while stopped; NaN when the chiller does not measure flow. */
  flow: number;
  ambient: number;
  circuits: [CircuitSnap, CircuitSnap];
  /** Chilled-water outlet set point. */
  setpoint: number;
  /**
   * Operating mode code of the chiller's controller (Carrier 30RAM: 1 cooling, 2 heating, 4 water pump
   * only, 8 heating + hot water, 16 cooling + heat recovery).
   */
  modeCode: number;
  /** Each compressor of the tandem circuits: 1A, 1B, 2A, 2B. */
  compressors: [boolean | null, boolean | null, boolean | null, boolean | null];
  /** Condenser fan of circuit 1 and 2. */
  fans: [boolean | null, boolean | null];
  defrost: boolean | null;
  /** Freeze-protection (antifreeze) temperature. */
  antifreeze: number;
  /** Electronic expansion valve openings EXV 1–4, in steps (0–480). */
  exv: [number, number, number, number];
  /** Common header temperatures, reported by the master module of a modular chiller. */
  headerIn: number;
  headerOut: number;
}

export interface AirSnap {
  id: string;
  kind: "ahu" | "oau";
  state: RunState;
  mode: "cool" | "fan" | "off";
  temp: number;
  humid: number;
  setpoint: number;
  supplyAir: number;
  valve: number;
}

export interface PumpSnap {
  id: string;
  state: RunState;
  role: "duty" | "standby";
  speed: number;
  hours: number;
}

export interface PanelSnap {
  id: string;
  state: RunState;
  mode: "auto" | "manual";
  comm: boolean;
}

export interface MeterSnap {
  id: string;
  /** The chiller this meter measures, if any. */
  chillerId: string | null;
  state: RunState;
  vLN: [number, number, number];
  vLL: [number, number, number];
  amps: [number, number, number];
  kw: [number, number, number];
  kvar: [number, number, number];
  pf: [number, number, number];
  hz: number;
  kwh: number;
}

export interface PlantSnap {
  t: number;
  ambient: number;
  supply: number;
  ret: number;
  deltaT: number;
  flow: number;
  tons: number;
  kw: number;
  /** null while no chiller runs; NaN when it cannot be computed (no flow or power reading). */
  kwPerTon: number | null;
  chillers: ChillerSnap[];
  air: AirSnap[];
  pumps: PumpSnap[];
  /** Control panels (none, one or several, as the plant has them). */
  panels: PanelSnap[];
  meters: MeterSnap[];
}

export type AlarmCode = "chwSupplyHigh" | "humidityHigh" | "roomTempHigh" | "kwPerTonHigh" | "compressorFault" | "pumpTrip" | "commLoss" | "filterDirty";
export type AlarmSeverity = "critical" | "warning";

export interface HvacAlarm {
  id: string;
  deviceId: string;
  /** A built-in code (simulation, threshold rules, communication) or a fault code of a register profile. */
  code: AlarmCode | (string & {});
  severity: AlarmSeverity;
  start: number;
  /** null while the alarm is still active. */
  end: number | null;
  /** Reading that tripped a threshold alarm, with its unit. */
  value?: number;
  unit?: string;
  /** Names that came with the alarm (fault bits of a register profile); built-in codes use the messages. */
  label?: { en: string; th: string };
  /** Live data: when and by whom a fault alarm was acknowledged (stored, so every screen sees it). */
  ackedAt?: number;
  ackedBy?: string;
}

/** Predictive-maintenance finding attached to a device (the PdM Monitor layer on top of the BMS). */
export interface HvacPrediction {
  deviceId: string;
  health: number;
  finding: "condenserFouling" | "none" | "bearingWear";
  /** Days until the finding needs action, 80% interval. */
  daysLow: number;
  daysHigh: number;
  confidence: number;
  modelRunAt: number;
}
