// Register maps: how a gateway (PLC) reads each device over Modbus and which point key each register
// becomes, and what the bits of a model's fault words mean. Stored in TimescaleDB (services/ingest/src/schema.ts):
//   profiles         one row per device model: kind, vendor, model, and its spec (addressing, serial
//                    defaults, modules, registers); edited on the admin page (/hvac/admin, Models tab)
//   fault_bits       the meaning of each fault-word bit per model; the ingest functions decode with it
//   devices.modbus   per device (DeviceModbus): the gateway and port it is wired to, slave id, module,
//                    and how its map differs from its model's (changed, left-out and own registers)
// The cloud never reads Modbus itself: the map is the specification of the PLC program, exported from the
// admin page (CSV). Models in profiles/ are added to the database when missing and never overwritten.
// Shared by the admin page (browser), its API and services/ingest, so it imports no SDK and uses relative imports only.

import { DEVICE_KINDS, POINT_CATALOG, type DeviceKind, type PointSpec } from "./catalog";
import { POINT_KEY, SLUG } from "./contract";

/** How the vendor document prints addresses. modicon: 30001 / 40001 / 10001 / 00001 (5 or 6 digits); pdu: 0-based; one: 1-based. */
export type Addressing = "modicon" | "pdu" | "one";
export const ADDRESSINGS: readonly Addressing[] = ["modicon", "pdu", "one"];
/** Modbus read functions: 1 coils, 2 discrete inputs, 3 holding registers, 4 input registers. Gateways never write. */
export type FunctionCode = 1 | 2 | 3 | 4;
export const FUNCTION_CODES: readonly FunctionCode[] = [4, 3, 2, 1];
export type DataType = "bool" | "int16" | "uint16" | "int32" | "uint32" | "float32";
export const DATA_TYPES: readonly DataType[] = ["int16", "uint16", "int32", "uint32", "float32", "bool"];
/** 32-bit values: which of the two registers holds the high word. */
export type WordOrder = "high-first" | "low-first";
export const WORD_ORDERS: readonly WordOrder[] = ["high-first", "low-first"];
/** module: every module has its own copy, block size apart. master: read once, from module 0. */
export type Scope = "module" | "master";
export type Severity = "critical" | "warning";
export const SEVERITIES: readonly Severity[] = ["critical", "warning"];
export type Parity = "none" | "even" | "odd";
export const PARITIES: readonly Parity[] = ["none", "even", "odd"];

export interface RegisterRow {
  /** Point key the gateway sends: a catalog point of the model's kind, or one of its own. */
  key: string;
  fc: FunctionCode;
  /** Address as printed in the vendor document (see Addressing), e.g. 30019. */
  register: number;
  type: DataType;
  /** 32-bit types only; high-first when left out. */
  wordOrder?: WordOrder;
  /** Engineering value = raw × scale (1 when left out). */
  scale?: number;
  /** State points: 1 when any of these bits is set (bit 0 = least significant). */
  bits?: number[];
  /** module when left out. */
  scope?: Scope;
  /** Something to confirm on site against the device's own display. */
  verify?: string;
}

export interface SerialSettings {
  protocol: "rtu" | "tcp";
  baud?: number;
  dataBits?: 7 | 8;
  parity?: Parity;
  stopBits?: 1 | 2;
  /** Modbus slave (unit) id. */
  slaveId: number;
}

export interface ModelSpec {
  /** Vendor document the map comes from. */
  document?: string;
  addressing: Addressing;
  serial: SerialSettings;
  /** Devices made of modules on one connection (one device per module), each with its own register block. */
  modules?: { max: number; blockSize: number };
  registers: RegisterRow[];
  /** Catalog points of this kind the model does not report (the gateway leaves them out). */
  notAvailable?: string[];
  notes?: string;
}

export interface FaultBitRow {
  /** A register key of the model holding a 16- or 32-bit fault word, e.g. "fault1". */
  word: string;
  bit: number;
  /** Alarm code, unique in the model, e.g. "highPressure1". */
  code: string;
  severity: Severity;
  en: string;
  th: string;
}

/** A device model, as stored and as the JSON file the admin page imports and exports. */
export interface ModelDef {
  id: string;
  kind: string;
  vendor: string;
  model: string;
  spec: ModelSpec;
  faultBits: FaultBitRow[];
}

/** A model in lists (the Models tab, the model select of the device list). */
export interface ModelSummary {
  id: string;
  kind: string;
  vendor: string;
  model: string;
  registers: number;
  faultBits: number;
  /** Devices that use it. */
  devices: number;
  updatedAt: number | null;
  updatedBy: string | null;
}

/** A change to one register of the device's model, a register left out, or a register of the device's own. */
export type RegisterOverride = { key: string; omit: true } | ({ key: string; omit?: undefined } & Partial<Omit<RegisterRow, "key">>);

/** How one device is wired and read (devices.modbus). Everything is optional; the model gives the rest. */
export interface DeviceModbus {
  /** Gateway (PLC) the device is wired to, as planned; the gateway seen in its data is shown beside it. */
  gateway?: string;
  /** Serial port or bus of the gateway ("RS485-1"), or host:port for Modbus TCP. */
  port?: string;
  slaveId?: number;
  /** Module of a modular device: 0 = master (default), n = slave module n. */
  module?: number;
  /** Serial settings that differ from the model's. */
  serial?: Partial<Omit<SerialSettings, "slaveId">>;
  /** Devices without a model: how their registers are printed (modicon when left out). */
  addressing?: Addressing;
  registers?: RegisterOverride[];
  notes?: string;
}

export const MODEL_TEXT_MAX = 100;
export const DOCUMENT_MAX = 200;
export const NOTES_MAX = 4000;
export const VERIFY_MAX = 200;
export const PORT_MAX = 100;
export const REGISTERS_MAX = 500;
export const FAULT_BITS_MAX = 512;
export const FAULT_TEXT_MAX = 200;
export const FAULT_CODE = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
export const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;
export const DEFAULT_SERIAL: SerialSettings = { protocol: "rtu", baud: 9600, dataBits: 8, parity: "none", stopBits: 1, slaveId: 1 };

const is32 = (t: DataType | undefined) => t === "int32" || t === "uint32" || t === "float32";
const isInt = (t: DataType | undefined) => t === "int16" || t === "uint16" || t === "int32" || t === "uint32";
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const optText = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.length <= max);
const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Catalog points of a kind, by key (unit and type for exports and suggestions). */
export function catalogPoints(kind: string): readonly PointSpec[] {
  return (DEVICE_KINDS as string[]).includes(kind) ? (POINT_CATALOG[kind as DeviceKind] as readonly PointSpec[]) : [];
}

/**
 * Modbus PDU address (0-based, what most PLCs ask for) of a register for module `module`, or null when
 * the printed address does not fit the function under this addressing.
 */
export function pduAddress(row: Pick<RegisterRow, "fc" | "register" | "scope">, addressing: Addressing, module = 0, blockSize = 0): number | null {
  const r = row.register;
  if (!Number.isInteger(r)) return null;
  let base: number | null;
  if (addressing === "pdu") base = r;
  else if (addressing === "one") base = r - 1;
  else {
    // Modicon: a leading 0/1/3/4 names the table; 6-digit addresses (400001) reach the whole 16-bit range.
    const prefix = { 1: 0, 2: 1, 3: 4, 4: 3 }[row.fc];
    const six = r >= 100_000;
    const start = prefix * (six ? 100_000 : 10_000) + 1;
    const end = prefix * (six ? 100_000 : 10_000) + (six ? 65_536 : 9_999);
    base = r >= start && r <= end ? r - start : null;
  }
  if (base === null || base < 0 || base > 65_535) return null;
  const at = base + ((row.scope ?? "module") === "module" ? blockSize * module : 0);
  return at <= 65_535 ? at : null;
}

/** A register's description in the form "×0.1", "bit 0 / 3", for exports. */
export const conversionText = (row: RegisterRow) =>
  [row.bits?.length ? `bit ${row.bits.join(" / ")}` : null, row.scale !== undefined && row.scale !== 1 ? `×${row.scale}` : null, is32(row.type) ? (row.wordOrder ?? "high-first") : null]
    .filter(Boolean)
    .join(", ");

// ---- Checks ---------------------------------------------------------------------------------

export type ModelProblemCode =
  | "id"
  | "gateway"
  | "port"
  | "module"
  | "kind"
  | "vendor"
  | "model"
  | "document"
  | "addressing"
  | "protocol"
  | "baud"
  | "data-bits"
  | "parity"
  | "stop-bits"
  | "slave-id"
  | "modules"
  | "registers"
  | "key"
  | "key-repeated"
  | "fc"
  | "address"
  | "type"
  | "type-fc"
  | "word-order"
  | "scale"
  | "bits"
  | "scope"
  | "verify"
  | "not-available"
  | "notes"
  | "fault-bits"
  | "fault-word"
  | "fault-bit"
  | "fault-bit-repeated"
  | "fault-code"
  | "fault-code-repeated"
  | "severity"
  | "fault-en"
  | "fault-th";

/** Something in a model that cannot be saved; `section` and `index` place it in the register or fault-bit list. */
export interface ModelProblem {
  code: ModelProblemCode;
  section?: "registers" | "faultBits";
  index?: number;
}

function serialProblems(s: Partial<SerialSettings> | undefined, whole: boolean, out: ModelProblem[]) {
  if (s === undefined || s === null || typeof s !== "object") {
    if (whole) out.push({ code: "protocol" });
    return;
  }
  if ((whole || s.protocol !== undefined) && s.protocol !== "rtu" && s.protocol !== "tcp") out.push({ code: "protocol" });
  if (s.baud !== undefined && !int(s.baud, 300, 1_000_000)) out.push({ code: "baud" });
  if (s.dataBits !== undefined && s.dataBits !== 7 && s.dataBits !== 8) out.push({ code: "data-bits" });
  if (s.parity !== undefined && !(PARITIES as string[]).includes(s.parity)) out.push({ code: "parity" });
  if (s.stopBits !== undefined && s.stopBits !== 1 && s.stopBits !== 2) out.push({ code: "stop-bits" });
  if ((whole || s.slaveId !== undefined) && !int(s.slaveId, 0, 255)) out.push({ code: "slave-id" });
}

/** Problems of one register row (index `index` of `section`), given the addressing it is printed in. */
function rowProblems(r: Partial<RegisterRow>, index: number, addressing: Addressing, out: ModelProblem[]) {
  const at = { section: "registers" as const, index };
  if (typeof r.key !== "string" || !POINT_KEY.test(r.key)) out.push({ code: "key", ...at });
  const fcOk = (FUNCTION_CODES as number[]).includes(r.fc as number);
  if (!fcOk) out.push({ code: "fc", ...at });
  if (fcOk && pduAddress({ fc: r.fc!, register: r.register as number, scope: "master" }, addressing) === null) out.push({ code: "address", ...at });
  const typeOk = (DATA_TYPES as string[]).includes(r.type as string);
  if (!typeOk) out.push({ code: "type", ...at });
  else if (fcOk && (r.fc === 1 || r.fc === 2) !== (r.type === "bool")) out.push({ code: "type-fc", ...at });
  if (r.wordOrder !== undefined && !(is32(r.type) && (WORD_ORDERS as string[]).includes(r.wordOrder))) out.push({ code: "word-order", ...at });
  if (r.scale !== undefined && !(typeof r.scale === "number" && Number.isFinite(r.scale) && r.scale !== 0)) out.push({ code: "scale", ...at });
  if (r.bits !== undefined) {
    const max = is32(r.type) ? 31 : 15;
    const ok = Array.isArray(r.bits) && r.bits.length > 0 && r.bits.length <= 32 && isInt(r.type) && r.bits.every((b) => int(b, 0, max)) && new Set(r.bits).size === r.bits.length;
    if (!ok) out.push({ code: "bits", ...at });
  }
  if (r.scope !== undefined && r.scope !== "module" && r.scope !== "master") out.push({ code: "scope", ...at });
  if (!optText(r.verify, VERIFY_MAX)) out.push({ code: "verify", ...at });
}

/** Everything wrong with a model; empty when it can be saved. */
export function modelProblems(m: ModelDef): ModelProblem[] {
  const out: ModelProblem[] = [];
  if (typeof m.id !== "string" || !SLUG.test(m.id)) out.push({ code: "id" });
  if (!(DEVICE_KINDS as string[]).includes(m.kind)) out.push({ code: "kind" });
  if (!text(m.vendor, MODEL_TEXT_MAX)) out.push({ code: "vendor" });
  if (!text(m.model, MODEL_TEXT_MAX)) out.push({ code: "model" });
  const spec = (m.spec ?? {}) as Partial<ModelSpec>;
  if (!optText(spec.document, DOCUMENT_MAX)) out.push({ code: "document" });
  const addressing = (ADDRESSINGS as string[]).includes(spec.addressing as string) ? spec.addressing! : null;
  if (!addressing) out.push({ code: "addressing" });
  serialProblems(spec.serial, true, out);
  if (spec.modules !== undefined && !(spec.modules && int(spec.modules.max, 2, 64) && int(spec.modules.blockSize, 1, 10_000))) out.push({ code: "modules" });
  if (!Array.isArray(spec.registers) || spec.registers.length > REGISTERS_MAX) out.push({ code: "registers" });
  const registers = Array.isArray(spec.registers) ? spec.registers : [];
  const keys = new Set<string>();
  registers.forEach((r, index) => {
    rowProblems(r, index, addressing ?? "pdu", out);
    if (typeof r.key === "string" && keys.has(r.key)) out.push({ code: "key-repeated", section: "registers", index });
    keys.add(r.key);
  });
  // The highest module must still fit the 16-bit address range.
  if (addressing && spec.modules && int(spec.modules.max, 2, 64) && int(spec.modules.blockSize, 1, 10_000)) {
    registers.forEach((r, index) => {
      if (pduAddress(r, addressing, 0, 0) !== null && pduAddress(r, addressing, spec.modules!.max - 1, spec.modules!.blockSize) === null) out.push({ code: "address", section: "registers", index });
    });
  }
  if (spec.notAvailable !== undefined && !(Array.isArray(spec.notAvailable) && spec.notAvailable.length <= 200 && spec.notAvailable.every((k) => typeof k === "string" && POINT_KEY.test(k)))) out.push({ code: "not-available" });
  if (!optText(spec.notes, NOTES_MAX)) out.push({ code: "notes" });

  if (!Array.isArray(m.faultBits) || m.faultBits.length > FAULT_BITS_MAX) out.push({ code: "fault-bits" });
  const bits = Array.isArray(m.faultBits) ? m.faultBits : [];
  const seen = new Set<string>();
  const codes = new Set<string>();
  bits.forEach((b, index) => {
    const at = { section: "faultBits" as const, index };
    const word = registers.find((r) => r.key === b.word);
    if (!word || !isInt(word.type) || word.bits !== undefined) out.push({ code: "fault-word", ...at });
    if (!int(b.bit, 0, word && is32(word.type) ? 31 : 15)) out.push({ code: "fault-bit", ...at });
    else if (seen.has(`${b.word}/${b.bit}`)) out.push({ code: "fault-bit-repeated", ...at });
    seen.add(`${b.word}/${b.bit}`);
    if (typeof b.code !== "string" || !FAULT_CODE.test(b.code)) out.push({ code: "fault-code", ...at });
    else if (codes.has(b.code)) out.push({ code: "fault-code-repeated", ...at });
    codes.add(b.code);
    if (!(SEVERITIES as string[]).includes(b.severity)) out.push({ code: "severity", ...at });
    if (!text(b.en, FAULT_TEXT_MAX)) out.push({ code: "fault-en", ...at });
    if (!text(b.th, FAULT_TEXT_MAX)) out.push({ code: "fault-th", ...at });
  });
  return out;
}

const PROBLEM_TEXT: Record<ModelProblemCode, string> = {
  id: 'id: lowercase letters, digits and "-", up to 32',
  gateway: 'gateway: a gateway id (lowercase letters, digits and "-", up to 32)',
  port: `port: up to ${PORT_MAX} characters`,
  module: "module: 0 (master) up to the model's last module",
  kind: `kind: one of ${DEVICE_KINDS.join(", ")}`,
  vendor: `vendor: 1 to ${MODEL_TEXT_MAX} characters`,
  model: `model: 1 to ${MODEL_TEXT_MAX} characters`,
  document: `document: up to ${DOCUMENT_MAX} characters`,
  addressing: `addressing: one of ${ADDRESSINGS.join(", ")}`,
  protocol: 'serial.protocol: "rtu" or "tcp"',
  baud: "serial.baud: a whole number of bits per second",
  "data-bits": "serial.dataBits: 7 or 8",
  parity: `serial.parity: one of ${PARITIES.join(", ")}`,
  "stop-bits": "serial.stopBits: 1 or 2",
  "slave-id": "slaveId: 0 to 255",
  modules: "modules: max 2 to 64 and blockSize 1 to 10000",
  registers: `registers: a list of up to ${REGISTERS_MAX}`,
  key: "key: a point key such as chwOut (letters, digits and _, starting with a letter)",
  "key-repeated": "key: used by another register",
  fc: "fc: 1, 2, 3 or 4",
  address: "register: not an address of this function under the model's addressing (or past 65535 for the last module)",
  type: `type: one of ${DATA_TYPES.join(", ")}`,
  "type-fc": "type: bool for functions 1 and 2, a number type for 3 and 4",
  "word-order": "wordOrder: high-first or low-first, for 32-bit types only",
  scale: "scale: a number other than 0",
  bits: "bits: distinct bit numbers of an integer register (0-15, or 0-31 for 32-bit)",
  scope: 'scope: "module" or "master"',
  verify: `verify: up to ${VERIFY_MAX} characters`,
  "not-available": "notAvailable: point keys",
  notes: `notes: up to ${NOTES_MAX} characters`,
  "fault-bits": `faultBits: a list of up to ${FAULT_BITS_MAX}`,
  "fault-word": "word: an integer register of this model without bits",
  "fault-bit": "bit: 0-15 (0-31 for a 32-bit word)",
  "fault-bit-repeated": "bit: this word and bit are listed twice",
  "fault-code": "code: letters, digits and _, starting with a letter, up to 48",
  "fault-code-repeated": "code: used by another bit",
  severity: 'severity: "critical" or "warning"',
  "fault-en": `en: 1 to ${FAULT_TEXT_MAX} characters`,
  "fault-th": `th: 1 to ${FAULT_TEXT_MAX} characters`,
};

/** A model problem in words, for the CLIs and server messages. */
export function modelProblemText(m: Pick<ModelDef, "id">, p: ModelProblem): string {
  const at = p.section !== undefined && p.index !== undefined ? ` (${p.section} #${p.index + 1})` : "";
  return `${m.id}${at}: ${PROBLEM_TEXT[p.code]}`;
}

/** Problems of a device's settings, given its model (null when it has none); register problems point into `registers`. */
export function deviceModbusProblems(d: DeviceModbus, model: ModelDef | null): ModelProblem[] {
  const out: ModelProblem[] = [];
  if (d.gateway !== undefined && !(typeof d.gateway === "string" && SLUG.test(d.gateway))) out.push({ code: "gateway" });
  if (!optText(d.port, PORT_MAX)) out.push({ code: "port" });
  if (d.slaveId !== undefined && !int(d.slaveId, 0, 255)) out.push({ code: "slave-id" });
  const modules = model?.spec.modules;
  if (d.module !== undefined && !int(d.module, 0, modules ? modules.max - 1 : 0)) out.push({ code: "module" });
  serialProblems(d.serial, false, out);
  if (d.addressing !== undefined && !(ADDRESSINGS as string[]).includes(d.addressing)) out.push({ code: "addressing" });
  if (!optText(d.notes, NOTES_MAX)) out.push({ code: "notes" });
  if (d.registers !== undefined && !(Array.isArray(d.registers) && d.registers.length <= REGISTERS_MAX)) {
    out.push({ code: "registers" });
    return out;
  }
  const addressing = model?.spec.addressing ?? d.addressing ?? "modicon";
  const keys = new Set<string>();
  (d.registers ?? []).forEach((o, index) => {
    const base = model?.spec.registers.find((r) => r.key === o.key);
    if (typeof o.key !== "string" || !POINT_KEY.test(o.key)) out.push({ code: "key", section: "registers", index });
    else if (keys.has(o.key)) out.push({ code: "key-repeated", section: "registers", index });
    keys.add(o.key);
    if (o.omit === true) {
      if (!base) out.push({ code: "key", section: "registers", index });
      return;
    }
    const merged = { ...base, ...stripUndefined(o) } as Partial<RegisterRow>;
    rowProblems(merged, index, addressing, out);
    const block = modules?.blockSize ?? 0;
    if (pduAddress(merged as RegisterRow, addressing, 0, 0) !== null && pduAddress(merged as RegisterRow, addressing, d.module ?? 0, block) === null) out.push({ code: "address", section: "registers", index });
  });
  return out;
}

const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ---- The map of one device ------------------------------------------------------------------

/** One register of a device's map, as the gateway reads it. */
export interface MapRow extends RegisterRow {
  /** PDU address for this device's module; null when it does not fit (see the checks). */
  pdu: number | null;
  /** model: as in the model; changed: changed for this device; device: the device's own. */
  source: "model" | "changed" | "device";
}

export interface DeviceMap {
  serial: SerialSettings;
  addressing: Addressing;
  module: number;
  rows: MapRow[];
  /** Model registers left out for this device. */
  omitted: string[];
  /** Model registers read from the master module only, so not by this module. */
  masterOnly: string[];
}

/** The register map of a device: its model's registers with the device's changes, for its module. */
export function deviceMap(model: ModelDef | null, d: DeviceModbus | null): DeviceMap {
  const settings = d ?? {};
  const spec = model?.spec;
  const moduleNo = settings.module ?? 0;
  const block = spec?.modules?.blockSize ?? 0;
  const addressing = spec?.addressing ?? settings.addressing ?? "modicon";
  const serial: SerialSettings = { ...(spec?.serial ?? DEFAULT_SERIAL), ...stripUndefined(settings.serial ?? {}), slaveId: settings.slaveId ?? spec?.serial.slaveId ?? DEFAULT_SERIAL.slaveId };
  const overrides = new Map((settings.registers ?? []).map((o) => [o.key, o]));
  const rows: MapRow[] = [];
  const omitted: string[] = [];
  const masterOnly: string[] = [];
  for (const base of spec?.registers ?? []) {
    const o = overrides.get(base.key);
    if (o?.omit) {
      omitted.push(base.key);
      continue;
    }
    const row: RegisterRow = o ? ({ ...base, ...stripUndefined(o), key: base.key } as RegisterRow) : base;
    if ((row.scope ?? "module") === "master" && moduleNo > 0) {
      masterOnly.push(base.key);
      continue;
    }
    rows.push({ ...row, pdu: pduAddress(row, addressing, moduleNo, block), source: o ? "changed" : "model" });
  }
  for (const o of settings.registers ?? []) {
    if (o.omit || spec?.registers.some((r) => r.key === o.key)) continue;
    const row = { ...o } as RegisterRow & { omit?: boolean };
    delete row.omit;
    if ((row.scope ?? "module") === "master" && moduleNo > 0) {
      masterOnly.push(row.key);
      continue;
    }
    rows.push({ ...row, pdu: pduAddress(row, addressing, moduleNo, block), source: "device" });
  }
  return { serial, addressing, module: moduleNo, rows, omitted, masterOnly };
}

// ---- Known fields only --------------------------------------------------------------------------

const pick = <T extends object>(o: unknown, keys: readonly (keyof T)[]): Partial<T> => {
  if (typeof o !== "object" || o === null) return {};
  const src = o as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => Object.hasOwn(src, k as string) && src[k as string] !== undefined).map((k) => [k, src[k as string]])) as Partial<T>;
};
const REGISTER_KEYS = ["key", "fc", "register", "type", "wordOrder", "scale", "bits", "scope", "verify"] as const;
const SERIAL_KEYS = ["protocol", "baud", "dataBits", "parity", "stopBits", "slaveId"] as const;

/** A model with only the fields this file knows, for storing (values are checked by modelProblems). */
export function cleanModel(m: ModelDef): ModelDef {
  const spec = (m.spec ?? {}) as Partial<ModelSpec>;
  return {
    id: m.id,
    kind: m.kind,
    vendor: typeof m.vendor === "string" ? m.vendor.trim() : m.vendor,
    model: typeof m.model === "string" ? m.model.trim() : m.model,
    spec: {
      ...pick<ModelSpec>(spec, ["document", "addressing", "notAvailable", "notes"]),
      serial: pick<SerialSettings>(spec.serial, SERIAL_KEYS) as SerialSettings,
      ...(spec.modules !== undefined ? { modules: pick<{ max: number; blockSize: number }>(spec.modules, ["max", "blockSize"]) as ModelSpec["modules"] } : {}),
      registers: (Array.isArray(spec.registers) ? spec.registers : []).map((r) => pick<RegisterRow>(r, REGISTER_KEYS) as RegisterRow),
    } as ModelSpec,
    faultBits: (Array.isArray(m.faultBits) ? m.faultBits : []).map((b) => pick<FaultBitRow>(b, ["word", "bit", "code", "severity", "en", "th"]) as FaultBitRow),
  };
}

/** Device settings with only the fields this file knows (values are checked by deviceModbusProblems). */
export function cleanDeviceModbus(d: DeviceModbus): DeviceModbus {
  const out = pick<DeviceModbus>(d, ["gateway", "port", "slaveId", "module", "addressing", "notes"]);
  if (d.serial !== undefined) out.serial = pick<SerialSettings>(d.serial, SERIAL_KEYS);
  if (d.registers !== undefined) {
    out.registers = Array.isArray(d.registers)
      ? d.registers.map((o) => ((o as { omit?: unknown }).omit === true ? { key: (o as { key: string }).key, omit: true as const } : (pick<RegisterRow>(o, REGISTER_KEYS) as RegisterOverride)))
      : d.registers;
  }
  return out;
}

// ---- Files -----------------------------------------------------------------------------------

/** A model read from JSON, or null when it is not shaped like one (values are checked by modelProblems). */
export function readModelFile(v: unknown): ModelDef | null {
  const x = v as Record<string, unknown> | null;
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const spec = x.spec as Record<string, unknown> | null;
  if (typeof spec !== "object" || spec === null || !Array.isArray(spec.registers)) return null;
  if (!spec.registers.every((r) => typeof r === "object" && r !== null && !Array.isArray(r))) return null;
  const bits = x.faultBits ?? [];
  if (!Array.isArray(bits) || !bits.every((b) => typeof b === "object" && b !== null && !Array.isArray(b))) return null;
  return { ...(x as unknown as ModelDef), faultBits: bits as FaultBitRow[] };
}

/** One line of a plant's register export. */
export interface ExportDevice {
  device: string;
  name: string;
  kind: string;
  gateway: string;
  model: ModelDef | null;
  modbus: DeviceModbus | null;
}

const CSV_COLUMNS = [
  "gateway",
  "port",
  "protocol",
  "serial",
  "slave_id",
  "device",
  "device_name",
  "kind",
  "model",
  "module",
  "key",
  "unit",
  "point_type",
  "fc",
  "register",
  "pdu_address",
  "data_type",
  "conversion",
  "scope",
  "source",
  "verify",
] as const;

const csvField = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The register maps of a plant's devices as CSV, one line per register, for the PLC programmer.
 * Starts with a byte order mark so spreadsheet programs read Thai names correctly.
 */
export function registerCsv(devices: ExportDevice[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const d of devices) {
    const map = deviceMap(d.model, d.modbus);
    const s = map.serial;
    const serial = s.protocol === "tcp" ? "" : `${s.baud ?? ""} ${s.dataBits ?? ""}${(s.parity ?? "none")[0].toUpperCase()}${s.stopBits ?? ""}`.trim();
    const points = catalogPoints(d.kind);
    for (const r of map.rows) {
      const p = points.find((x) => x.key === r.key);
      const values: Record<(typeof CSV_COLUMNS)[number], unknown> = {
        gateway: d.modbus?.gateway || d.gateway,
        port: d.modbus?.port,
        protocol: s.protocol,
        serial,
        slave_id: s.slaveId,
        device: d.device,
        device_name: d.name,
        kind: d.kind,
        model: d.model ? `${d.model.vendor} ${d.model.model}` : "",
        module: d.model?.spec.modules ? map.module : "",
        key: r.key,
        unit: p?.unit,
        point_type: p?.type ?? "",
        fc: r.fc,
        register: r.register,
        pdu_address: r.pdu,
        data_type: r.type,
        conversion: conversionText(r),
        scope: r.scope ?? "module",
        source: r.source,
        verify: r.verify,
      };
      lines.push(CSV_COLUMNS.map((c) => csvField(values[c])).join(","));
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
