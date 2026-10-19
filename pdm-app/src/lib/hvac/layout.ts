// Plant layout: which devices a project has, of which kind, under which name. The /hvac screens draw
// from it, so every project shows its own equipment.
//   sim:  SIM_LAYOUT, the equipment of the customer's mock-up (model.ts)
//   live: the project's device registry in Firestore, projects/{project}.devices, written from the
//         admin page (/hvac/admin, Plants tab) or `npm run registry` in services/ingest (lib/access/registry.ts)

import type { DeviceKind } from "@/lib/telemetry/catalog";
import { AIR_SIDE, CHILLERS, METERS, PANEL, PLANT, PUMPS } from "./model";

export interface LayoutDevice {
  id: string;
  kind: DeviceKind;
  /** Name on the screens ("CHILLER-1"). */
  name: string;
  /** Short tag under the name (meters: "PM-CH-1"). */
  label?: string;
  /** Meters: the chiller this meter measures. */
  meterFor?: string;
  /** Chillers: rated capacity, for the load KPI. */
  capacityTon?: number;
  /** Pumps: configured role (else the first pump is duty). */
  role?: "duty" | "standby";
}

export interface PlantLayout {
  chillers: LayoutDevice[];
  pumps: LayoutDevice[];
  /** AHU and OAU, in registry order. */
  air: LayoutDevice[];
  panels: LayoutDevice[];
  meters: LayoutDevice[];
  /** Sum of the chillers' rated capacity; null when any is unknown. */
  capacityTon: number | null;
}

/** One entry of projects/{project}.devices in Firestore. */
export interface RegistryEntry {
  kind: string;
  name?: string;
  label?: string;
  order?: number;
  meterFor?: string;
  capacityTon?: number;
  role?: "duty" | "standby";
}

const KINDS = new Set<DeviceKind>(["chiller", "pump", "ahu", "oau", "meter", "panel"]);

function build(devices: LayoutDevice[]): PlantLayout {
  const of = (...kinds: DeviceKind[]) => devices.filter((d) => kinds.includes(d.kind));
  const chillers = of("chiller");
  const caps = chillers.map((c) => c.capacityTon);
  return {
    chillers,
    pumps: of("pump"),
    air: of("ahu", "oau"),
    panels: of("panel"),
    meters: of("meter"),
    capacityTon: chillers.length && caps.every((c): c is number => typeof c === "number" && c > 0) ? caps.reduce((a, b) => a + b, 0) : null,
  };
}

export const SIM_LAYOUT: PlantLayout = build([
  ...AIR_SIDE.map((d) => ({ id: d.id, kind: d.kind as DeviceKind, name: d.name })),
  ...CHILLERS.map((d) => ({ id: d.id, kind: d.kind as DeviceKind, name: d.name, capacityTon: PLANT.chillerCapacityTon })),
  ...PUMPS.map((d, i) => ({ id: d.id, kind: d.kind as DeviceKind, name: d.name, role: (i === 0 ? "duty" : "standby") as "duty" | "standby" })),
  { id: PANEL.id, kind: "panel", name: PANEL.name },
  ...METERS.map((d) => ({ id: d.id, kind: d.kind as DeviceKind, name: d.name, label: d.label, meterFor: d.chillerId })),
]);

const byOrderThenId = (a: [string, RegistryEntry], b: [string, RegistryEntry]) =>
  (a[1].order ?? Number.MAX_SAFE_INTEGER) - (b[1].order ?? Number.MAX_SAFE_INTEGER) || a[0].localeCompare(b[0], "en", { numeric: true });

/** Layout from a project's registry; entries with an unknown kind are left out (shown as unassigned). */
export function layoutFromRegistry(devices: Record<string, RegistryEntry> | undefined): PlantLayout {
  const list = Object.entries(devices ?? {})
    .filter(([, e]) => KINDS.has(e.kind as DeviceKind))
    .sort(byOrderThenId)
    .map(([id, e]): LayoutDevice => ({
      id,
      kind: e.kind as DeviceKind,
      name: e.name || id,
      ...(e.label ? { label: e.label } : {}),
      ...(e.meterFor ? { meterFor: e.meterFor } : {}),
      ...(typeof e.capacityTon === "number" ? { capacityTon: e.capacityTon } : {}),
      ...(e.role ? { role: e.role } : {}),
    }));
  return build(list);
}

export const EMPTY_LAYOUT: PlantLayout = build([]);

export function allDevices(layout: PlantLayout): LayoutDevice[] {
  return [...layout.air, ...layout.chillers, ...layout.pumps, ...layout.panels, ...layout.meters];
}

export function findDevice(layout: PlantLayout, id: string): LayoutDevice | undefined {
  return allDevices(layout).find((d) => d.id === id);
}

// Names of the layout on screen, for deviceLabel() in alarm lists, charts and dialogs. Set by the live
// store when a project's registry arrives (one plant is on screen at a time).
let names = new Map(allDevices(SIM_LAYOUT).map((d) => [d.id, d.name]));

export function setLayoutNames(layout: PlantLayout) {
  names = new Map(allDevices(layout).map((d) => [d.id, d.name]));
}

export function layoutName(id: string): string | undefined {
  return names.get(id);
}
