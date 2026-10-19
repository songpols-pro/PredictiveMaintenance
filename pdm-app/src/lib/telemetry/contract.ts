// MQTT data contract between site gateways (PLC) and the cloud, version 1.
// One definition shared by the gateway simulator, the ingestion service and the web app.
// The spec for PLC programmers, with examples, is TELEMETRY.md at the repository root.
//
//   pdm/v1/{project}/{gateway}/telemetry   every cycle (60 s or slower), QoS 1
//   pdm/v1/{project}/{gateway}/event       at once when a state point changes (run, fault, ...), QoS 1
//   pdm/v1/{project}/{gateway}/status      "online" on connect and "offline" as the Last Will, retained
//
// Project and gateway come from the topic, never from the payload: the broker only lets a
// gateway's credentials publish under its own topic, so the topic is the trusted identity.

export const CONTRACT_VERSION = 1;
export const TOPIC_ROOT = "pdm/v1";

export type Channel = "telemetry" | "event" | "status";
export const CHANNELS: readonly Channel[] = ["telemetry", "event", "status"];

/** Project and gateway ids: lowercase slug, e.g. "mf-hq", "plc-01". */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Device ids as printed on the plant, e.g. "CH-1", "AHU_3". No dots: "CH-1.chwOut" names a point. */
export const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
/** Point keys in camelCase, e.g. "chwOut", "lowP1". */
export const POINT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export const LIMITS = {
  /** Larger cycles are split into several telemetry messages with the same ts. */
  maxBytes: 64 * 1024,
  maxDevices: 500,
  maxPointsPerDevice: 200,
  maxChanges: 500,
  /** Seconds. Production gateways send every 60 s or slower; shorter is for testing. */
  minInterval: 5,
  maxInterval: 86_400,
  /** Seconds a gateway clock may run ahead of the cloud before its messages are rejected. */
  maxFutureSkew: 300,
  /** Oldest buffered (store-and-forward) message accepted, seconds. */
  maxAge: 30 * 86_400,
} as const;

export type PointValue = number | null;
/** Readings of one device: point key → value in engineering units, null when the read failed. */
export type DeviceReadings = Record<string, PointValue>;

export interface TelemetryMessage {
  v: 1;
  /** Start of the sampling cycle, Unix time in whole seconds (UTC). */
  ts: number;
  /** +1 for every message the gateway publishes (telemetry and event), wraps at 2^32. */
  seq: number;
  /** Seconds between cycles; the cloud marks the gateway stale after 2.5 × interval without data. */
  interval: number;
  devices: Record<string, DeviceReadings>;
  /** Devices that did not answer this cycle, with a short reason ("timeout", "crc"). */
  errors?: Record<string, string>;
}

export interface PointChange {
  device: string;
  point: string;
  value: PointValue;
}

export interface EventMessage {
  v: 1;
  ts: number;
  seq: number;
  changes: PointChange[];
}

export interface StatusMessage {
  v: 1;
  state: "online" | "offline";
  /** Absent in the Last Will, which is fixed when the gateway connects. */
  ts?: number;
  /** Gateway program version. */
  fw?: string;
  /** Messages waiting in the store-and-forward buffer. */
  buffered?: number;
}

export interface TopicParts {
  project: string;
  gateway: string;
  channel: Channel;
}

export function topicFor(project: string, gateway: string, channel: Channel): string {
  return `${TOPIC_ROOT}/${project}/${gateway}/${channel}`;
}

export function parseTopic(topic: string): TopicParts | null {
  const parts = topic.split("/");
  if (parts.length !== 5 || `${parts[0]}/${parts[1]}` !== TOPIC_ROOT) return null;
  const [, , project, gateway, channel] = parts;
  if (!SLUG.test(project) || !SLUG.test(gateway) || !CHANNELS.includes(channel as Channel)) return null;
  return { project, gateway, channel: channel as Channel };
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Stop collecting after this many problems: one bad PLC mapping repeats on every device. */
const MAX_ERRORS = 20;

class Problems {
  list: string[] = [];
  add(message: string) {
    if (this.list.length < MAX_ERRORS) this.list.push(message);
  }
  result<T>(value: T): Result<T> {
    return this.list.length ? { ok: false, errors: this.list } : { ok: true, value };
  }
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function checkVersion(m: Record<string, unknown>, p: Problems) {
  if (m.v !== CONTRACT_VERSION) p.add(`v must be ${CONTRACT_VERSION}, got ${JSON.stringify(m.v)}`);
}

/** `now` in Unix seconds: when given, ts must not be in the future or older than the buffer limit. */
function checkTs(ts: unknown, p: Problems, now?: number, field = "ts") {
  if (!isInt(ts) || ts <= 0) {
    p.add(`${field} must be Unix time in whole seconds, got ${JSON.stringify(ts)}`);
    return;
  }
  if (ts > 1e11) {
    p.add(`${field} looks like milliseconds (${ts}); send seconds`);
    return;
  }
  if (now === undefined) return;
  if (ts > now + LIMITS.maxFutureSkew) p.add(`${field} is ${ts - now} s in the future: check the gateway clock (NTP)`);
  if (ts < now - LIMITS.maxAge) p.add(`${field} is older than ${LIMITS.maxAge / 86_400} days`);
}

function checkSeq(seq: unknown, p: Problems) {
  if (!isInt(seq) || seq < 0 || seq > 0xffff_ffff) p.add(`seq must be an integer 0..4294967295, got ${JSON.stringify(seq)}`);
}

function checkValue(value: unknown, where: string, p: Problems) {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) p.add(`${where} must be a number or null, got ${JSON.stringify(value)}`);
}

export function validateTelemetry(input: unknown, now?: number): Result<TelemetryMessage> {
  const p = new Problems();
  if (!isRecord(input)) return { ok: false, errors: ["payload must be a JSON object"] };
  checkVersion(input, p);
  checkTs(input.ts, p, now);
  checkSeq(input.seq, p);
  const { interval, devices, errors } = input;
  if (!isInt(interval) || interval < LIMITS.minInterval || interval > LIMITS.maxInterval) {
    p.add(`interval must be whole seconds ${LIMITS.minInterval}..${LIMITS.maxInterval}, got ${JSON.stringify(interval)}`);
  }

  if (!isRecord(devices)) {
    p.add("devices must be an object of device id → readings");
  } else {
    const ids = Object.keys(devices);
    if (ids.length > LIMITS.maxDevices) p.add(`too many devices (${ids.length} > ${LIMITS.maxDevices}): split the cycle into several messages`);
    for (const id of ids) {
      if (!DEVICE_ID.test(id)) p.add(`device id "${id}" is not allowed (letters, digits, "-" and "_", up to 32)`);
      const readings = devices[id];
      if (!isRecord(readings)) {
        p.add(`devices.${id} must be an object of point key → value`);
        continue;
      }
      const keys = Object.keys(readings);
      if (keys.length > LIMITS.maxPointsPerDevice) p.add(`devices.${id} has ${keys.length} points (> ${LIMITS.maxPointsPerDevice})`);
      for (const key of keys) {
        if (!POINT_KEY.test(key)) p.add(`point key "${id}.${key}" is not allowed (camelCase, up to 32)`);
        checkValue(readings[key], `devices.${id}.${key}`, p);
      }
    }
  }

  if (errors !== undefined) {
    if (!isRecord(errors)) {
      p.add("errors must be an object of device id → reason");
    } else {
      for (const [id, reason] of Object.entries(errors)) {
        if (!DEVICE_ID.test(id)) p.add(`errors: device id "${id}" is not allowed`);
        if (typeof reason !== "string" || reason.length === 0 || reason.length > 64) p.add(`errors.${id} must be a short text (1–64 characters)`);
        if (isRecord(devices) && id in devices) p.add(`device "${id}" is in both devices and errors`);
      }
    }
  }

  if (isRecord(devices) && Object.keys(devices).length === 0 && !(isRecord(errors) && Object.keys(errors).length > 0)) {
    p.add("no devices and no errors: a cycle must report every device it polled");
  }
  return p.result(input as unknown as TelemetryMessage);
}

export function validateEvent(input: unknown, now?: number): Result<EventMessage> {
  const p = new Problems();
  if (!isRecord(input)) return { ok: false, errors: ["payload must be a JSON object"] };
  checkVersion(input, p);
  checkTs(input.ts, p, now);
  checkSeq(input.seq, p);
  const { changes } = input;
  if (!Array.isArray(changes) || changes.length === 0) {
    p.add("changes must be a non-empty array");
  } else {
    if (changes.length > LIMITS.maxChanges) p.add(`too many changes (${changes.length} > ${LIMITS.maxChanges})`);
    changes.forEach((c, i) => {
      if (!isRecord(c)) {
        p.add(`changes[${i}] must be an object { device, point, value }`);
        return;
      }
      if (typeof c.device !== "string" || !DEVICE_ID.test(c.device)) p.add(`changes[${i}].device "${String(c.device)}" is not allowed`);
      if (typeof c.point !== "string" || !POINT_KEY.test(c.point)) p.add(`changes[${i}].point "${String(c.point)}" is not allowed`);
      checkValue(c.value, `changes[${i}].value`, p);
    });
  }
  return p.result(input as unknown as EventMessage);
}

export function validateStatus(input: unknown, now?: number): Result<StatusMessage> {
  const p = new Problems();
  if (!isRecord(input)) return { ok: false, errors: ["payload must be a JSON object"] };
  checkVersion(input, p);
  if (input.state !== "online" && input.state !== "offline") p.add(`state must be "online" or "offline", got ${JSON.stringify(input.state)}`);
  if (input.ts !== undefined) checkTs(input.ts, p, now);
  if (input.fw !== undefined && (typeof input.fw !== "string" || input.fw.length > 32)) p.add("fw must be a short text (up to 32 characters)");
  if (input.buffered !== undefined && (!isInt(input.buffered) || input.buffered < 0)) p.add("buffered must be a whole number ≥ 0");
  return p.result(input as unknown as StatusMessage);
}

export type Decoded =
  | { channel: "telemetry"; message: TelemetryMessage }
  | { channel: "event"; message: EventMessage }
  | { channel: "status"; message: StatusMessage };

/** Size check, JSON parse and validation of one MQTT payload. `now` in Unix seconds. */
export function decode(channel: Channel, payload: Uint8Array | string, now?: number): Result<Decoded> {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
  if (bytes > LIMITS.maxBytes) return { ok: false, errors: [`payload is ${bytes} bytes (> ${LIMITS.maxBytes}): split it`] };
  let json: unknown;
  try {
    json = JSON.parse(typeof payload === "string" ? payload : new TextDecoder().decode(payload));
  } catch {
    return { ok: false, errors: ["payload is not valid JSON"] };
  }
  switch (channel) {
    case "telemetry": {
      const r = validateTelemetry(json, now);
      return r.ok ? { ok: true, value: { channel, message: r.value } } : r;
    }
    case "event": {
      const r = validateEvent(json, now);
      return r.ok ? { ok: true, value: { channel, message: r.value } } : r;
    }
    case "status": {
      const r = validateStatus(json, now);
      return r.ok ? { ok: true, value: { channel, message: r.value } } : r;
    }
  }
}
