// A plant's device registry as data: the project file of `npm run registry`, its checks, and the
// Firestore entries it becomes. The web screens draw the plant from projects/{project} (name,
// ownerLogo, devices); each device's register profile goes to TimescaleDB (devices.profile) so fault
// words become named alarms. Shared by the admin page (browser), its API (/api/hvac/admin) and the
// CLI in services/ingest (npm run registry), so it imports no SDK and uses relative imports only.
//
// Project file: { "project": "hq-chiller", "name": "HQ chiller plant", "ownerLogo": "/hvac/owners/hq.png", "devices": [ ...entries ] }
//   name:        plant name customers see in the project switcher (default: the project id)
//   ownerLogo:   optional logo of the plant owner at the top of the menu: a path under pdm-app/public
//                ("/hvac/owners/hq.png") or an https:// URL; without it the site-wide logo is shown
// Entry: { "id": "CH-1", "kind": "chiller", "name": "CHILLER-1", "capacityTon": 120, "profile": "carrier-30ram" }
//   kind:        chiller | pump | ahu | oau | meter | panel
//   optional:    name, label (short tag), profile, capacityTon (chillers), meterFor (meters: chiller id),
//                role (pumps: duty | standby)
// The file replaces the project's registry: devices left out leave the screens (their stored data
// stays), and so does an ownerLogo left out. The customer the project belongs to (org) stays.
// Screens show the order of the file.

import { DEVICE_KINDS, type DeviceKind } from "../telemetry/catalog";
import { DEVICE_ID, LIMITS, SLUG } from "../telemetry/contract";
import type { ModelSummary } from "../telemetry/register-map";
import { NAME_MAX } from "./model";

export interface RegistryDevice {
  id: string;
  kind: string;
  name?: string;
  label?: string;
  profile?: string;
  capacityTon?: number;
  meterFor?: string;
  role?: string;
}

export interface RegistryFile {
  project: string;
  name?: string;
  ownerLogo?: string;
  devices: RegistryDevice[];
}

/** One device in Firestore, projects/{project}.devices.{id} (read by lib/hvac/layout.ts). */
export interface StoredDevice {
  kind: string;
  name: string;
  order: number;
  label?: string;
  meterFor?: string;
  capacityTon?: number;
  role?: string;
}

/** A plant's registry as the admin page edits it (GET /api/hvac/admin?registry=<project>). */
export interface RegistryView {
  file: RegistryFile;
  /** The customer it belongs to; null when none. */
  org: string | null;
  /** When the registry was last saved (ms), sent back with a save so it cannot overwrite a newer one. */
  version: number | null;
  /** False for a plant that sends data but has no registry yet: saving registers it. */
  registered: boolean;
  /** False when TimescaleDB could not be read: the profiles are unknown, so the registry cannot be saved. */
  profiles: boolean;
  /** Device models a device can use (TimescaleDB profiles); empty when the database could not be read. */
  models: ModelSummary[];
  /** Devices that send data but are not in the registry, by id. */
  seen: { device: string; gateway: string; lastSeen: number }[];
}

/** Most devices a plant can have: as many as one gateway message may carry. */
export const DEVICES_MAX = LIMITS.maxDevices;
/** Longest device name and label on the screens. */
export const DEVICE_NAME_MAX = 64;
export const DEVICE_LABEL_MAX = 32;
/** Longest owner logo path or URL. */
export const LOGO_MAX = 500;
/** A path served by the web app (not "//host") or an https URL. */
export const LOGO = /^(\/(?!\/)|https:\/\/)\S+$/;

/** Fields each kind of device uses besides id, kind, name, label and profile. */
export const KIND_FIELDS: Record<DeviceKind, ("capacityTon" | "meterFor" | "role")[]> = {
  chiller: ["capacityTon"],
  pump: ["role"],
  ahu: [],
  oau: [],
  meter: ["meterFor"],
  panel: [],
};

/** The device models a file is checked against: model id → its kind of device. */
export type ModelKinds = Record<string, { kind: string }>;

export type RegistryProblemCode =
  | "project-id"
  | "name"
  | "owner-logo"
  | "devices"
  | "device-id"
  | "kind"
  | "device-name"
  | "label"
  | "profile"
  | "profile-kind"
  | "capacity"
  | "role"
  | "meter-for";

/** Something in a project file that cannot be saved; `index` is the device's place in the list. */
export interface RegistryProblem {
  code: RegistryProblemCode;
  index?: number;
  device?: string;
}

const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

/** Everything wrong with the file, given the device models in the database; empty when it can be saved. */
export function registryProblems(p: RegistryFile, models: ModelKinds): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  if (typeof p.project !== "string" || !SLUG.test(p.project)) problems.push({ code: "project-id" });
  if (p.name !== undefined && !isText(p.name, NAME_MAX)) problems.push({ code: "name" });
  if (p.ownerLogo !== undefined && !(typeof p.ownerLogo === "string" && p.ownerLogo.length <= LOGO_MAX && LOGO.test(p.ownerLogo))) problems.push({ code: "owner-logo" });
  if (!Array.isArray(p.devices) || p.devices.length > DEVICES_MAX) {
    problems.push({ code: "devices" });
    return problems;
  }
  const ids = new Set<string>();
  p.devices.forEach((d, index) => {
    const at = { index, device: String(d.id) };
    if (typeof d.id !== "string" || !DEVICE_ID.test(d.id) || ids.has(d.id)) problems.push({ code: "device-id", ...at });
    ids.add(d.id);
    if (!(DEVICE_KINDS as string[]).includes(d.kind)) problems.push({ code: "kind", ...at });
    if (d.name !== undefined && !isText(d.name, DEVICE_NAME_MAX)) problems.push({ code: "device-name", ...at });
    if (d.label !== undefined && !isText(d.label, DEVICE_LABEL_MAX)) problems.push({ code: "label", ...at });
    if (d.profile !== undefined) {
      const profile = typeof d.profile === "string" && Object.hasOwn(models, d.profile) ? models[d.profile] : undefined;
      if (!profile) problems.push({ code: "profile", ...at });
      else if ((DEVICE_KINDS as string[]).includes(d.kind) && profile.kind !== d.kind) problems.push({ code: "profile-kind", ...at });
    }
    if (d.capacityTon !== undefined && !(typeof d.capacityTon === "number" && Number.isFinite(d.capacityTon) && d.capacityTon > 0)) problems.push({ code: "capacity", ...at });
    if (d.role !== undefined && d.role !== "duty" && d.role !== "standby") problems.push({ code: "role", ...at });
  });
  p.devices.forEach((d, index) => {
    if (d.meterFor !== undefined && !p.devices.some((x) => x.id === d.meterFor && x.kind === "chiller")) problems.push({ code: "meter-for", index, device: String(d.id) });
  });
  return problems;
}

/** A problem in words, as `npm run registry` prints it. */
export function problemText(p: RegistryFile, problem: RegistryProblem, models: ModelKinds): string {
  const d = problem.index !== undefined && Array.isArray(p.devices) ? p.devices[problem.index] : undefined;
  const at = `${p.project}/${d?.id}`;
  switch (problem.code) {
    case "project-id":
      return `project id "${p.project}" (lowercase letters, digits and "-")`;
    case "name":
      return `${p.project}: name must be a non-empty text of up to ${NAME_MAX} characters`;
    case "owner-logo":
      return `${p.project}: ownerLogo must be a path such as "/hvac/owners/hq.png" or an https:// URL`;
    case "devices":
      return `${p.project}: devices must be a list of up to ${DEVICES_MAX} devices`;
    case "device-id":
      return `${at}: device id not allowed or repeated`;
    case "kind":
      return `${at}: kind "${d?.kind}" (one of ${DEVICE_KINDS.join(", ")})`;
    case "device-name":
      return `${at}: name must be a non-empty text of up to ${DEVICE_NAME_MAX} characters`;
    case "label":
      return `${at}: label must be a non-empty text of up to ${DEVICE_LABEL_MAX} characters`;
    case "profile":
      return `${at}: unknown profile "${d?.profile}" (${Object.keys(models).join(", ") || "no device models in the database"})`;
    case "profile-kind":
      return `${at}: profile "${d?.profile}" is for a ${models[d?.profile ?? ""]?.kind}, not a ${d?.kind}`;
    case "capacity":
      return `${at}: capacityTon must be a positive number`;
    case "role":
      return `${at}: role must be "duty" or "standby"`;
    case "meter-for":
      return `${at}: meterFor "${d?.meterFor}" is not a chiller of this project`;
  }
}

/** The file's plant name, or its id when it has none. */
export const plantNameOf = (p: RegistryFile) => p.name?.trim() || p.project;

/** Firestore entries of a checked file: the devices by id, numbered in file order. */
export function storedDevices(p: RegistryFile): Record<string, StoredDevice> {
  return Object.fromEntries(
    p.devices.map((d, i) => [
      d.id,
      {
        kind: d.kind,
        name: d.name?.trim() || d.id,
        order: i + 1,
        ...(d.label?.trim() ? { label: d.label.trim() } : {}),
        ...(d.meterFor ? { meterFor: d.meterFor } : {}),
        ...(d.capacityTon ? { capacityTon: d.capacityTon } : {}),
        ...(d.role ? { role: d.role } : {}),
      },
    ]),
  );
}

const byOrderThenId = (a: [string, Partial<StoredDevice>], b: [string, Partial<StoredDevice>]) =>
  (a[1].order ?? Number.MAX_SAFE_INTEGER) - (b[1].order ?? Number.MAX_SAFE_INTEGER) || a[0].localeCompare(b[0], "en", { numeric: true });

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** The project file of a registry as stored: Firestore document plus profiles (device → profile id). */
export function fileFromStored(
  project: string,
  data: { name?: unknown; ownerLogo?: unknown; devices?: unknown } | undefined,
  profiles: Record<string, string | null> = {},
): RegistryFile {
  const devices = Object.entries((data?.devices ?? {}) as Record<string, Partial<StoredDevice>>).sort(byOrderThenId);
  const name = str(data?.name);
  const ownerLogo = str(data?.ownerLogo);
  return {
    project,
    ...(name ? { name } : {}),
    ...(ownerLogo ? { ownerLogo } : {}),
    devices: devices.map(([id, e]) => ({
      id,
      kind: String(e.kind ?? ""),
      ...(str(e.name) && e.name !== id ? { name: e.name } : {}),
      ...(str(e.label) ? { label: e.label } : {}),
      ...(profiles[id] ? { profile: profiles[id]! } : {}),
      ...(typeof e.capacityTon === "number" ? { capacityTon: e.capacityTon } : {}),
      ...(str(e.meterFor) ? { meterFor: e.meterFor } : {}),
      ...(str(e.role) ? { role: e.role } : {}),
    })),
  };
}

/** A project file read from JSON, or null when it is not shaped like one (field values are checked by registryProblems). */
export function readRegistryFile(v: unknown): RegistryFile | null {
  const x = v as Record<string, unknown> | null;
  if (typeof x !== "object" || x === null || Array.isArray(x) || !Array.isArray(x.devices)) return null;
  if (!x.devices.every((d) => typeof d === "object" && d !== null && !Array.isArray(d))) return null;
  return x as unknown as RegistryFile;
}

/** What a save changes, for the audit log: devices added, removed and changed, by id. */
export interface RegistryChange {
  added: string[];
  removed: string[];
  changed: string[];
  reordered: boolean;
  renamed: boolean;
  logo: boolean;
}

const sameEntry = (a: Partial<StoredDevice>, b: Partial<StoredDevice>) =>
  a.kind === b.kind && a.name === b.name && a.label === b.label && a.meterFor === b.meterFor && a.capacityTon === b.capacityTon && a.role === b.role;

export function registryChange(
  before: { name?: unknown; ownerLogo?: unknown; devices?: unknown } | undefined,
  after: { name: string; ownerLogo: string | null; devices: Record<string, StoredDevice> },
  profilesChanged: string[] = [],
): RegistryChange {
  const old = (before?.devices ?? {}) as Record<string, Partial<StoredDevice>>;
  const ids = Object.keys(after.devices);
  const kept = ids.filter((id) => id in old);
  const oldOrder = Object.entries(old)
    .sort(byOrderThenId)
    .map(([id]) => id)
    .filter((id) => id in after.devices);
  return {
    added: ids.filter((id) => !(id in old)),
    removed: Object.keys(old).filter((id) => !(id in after.devices)),
    changed: kept.filter((id) => !sameEntry(old[id], after.devices[id]) || profilesChanged.includes(id)),
    reordered: kept.join() !== oldOrder.join(),
    renamed: str(before?.name) !== after.name,
    logo: (str(before?.ownerLogo) ?? null) !== after.ownerLogo,
  };
}

export const changesAnything = (c: RegistryChange) => c.added.length > 0 || c.removed.length > 0 || c.changed.length > 0 || c.reordered || c.renamed || c.logo;
