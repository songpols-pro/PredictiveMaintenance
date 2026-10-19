// Virtual gateway (PLC) fleet: publishes contract v1 messages for every gateway in a fleet file,
// the same way the real PLC must (TELEMETRY.md). Use it to build and test the cloud side before
// the hardware is on site, and as a reference while programming the PLC.
//
//   npm start                          fleet.example.json → local broker (npm run broker)
//   npm start -- --interval 10         faster cycles for testing (production: 60 s or slower)
//   npm start -- --once --print        one cycle per gateway, print the payloads, exit
//   EMQX Cloud: set MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD in .env (see .env.example)

import "./env";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import mqtt, { type MqttClient } from "mqtt";
import { eventPoints, isDeviceKind } from "../../../pdm-app/src/lib/telemetry/catalog";
import {
  DEVICE_ID,
  LIMITS,
  SLUG,
  topicFor,
  type Channel,
  type DeviceReadings,
  type EventMessage,
  type PointChange,
  type StatusMessage,
  type TelemetryMessage,
} from "../../../pdm-app/src/lib/telemetry/contract";
import { chance, poll, type SimDevice } from "./readings";

const FW = "virtual-plc/0.1.0";
/** How often state points (run, fault, ...) are checked for an immediate event message. */
const EVENT_SCAN_MS = 5_000;

const { values: args } = parseArgs({
  options: {
    fleet: { type: "string", default: "fleet.example.json" },
    interval: { type: "string" },
    once: { type: "boolean", default: false },
    print: { type: "boolean", default: false },
  },
});

const url = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const nowSec = () => Math.floor(Date.now() / 1000);
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en-GB");

interface GatewayConfig {
  project: string;
  id: string;
  interval: number;
  /** Simulation time shift, ms (see readings.ts). */
  shift: number;
  devices: SimDevice[];
}

interface FleetFile {
  projects?: {
    id: string;
    gateways?: { id: string; interval?: number; simShiftMinutes?: number; devices?: { id: string; kind: string }[] }[];
  }[];
}

function loadFleet(path: string, intervalOverride?: number): GatewayConfig[] {
  const fleet = JSON.parse(readFileSync(path, "utf8")) as FleetFile;
  const problems: string[] = [];
  const gateways: GatewayConfig[] = [];
  for (const p of fleet.projects ?? []) {
    if (!SLUG.test(p.id)) problems.push(`project id "${p.id}" (lowercase letters, digits and "-")`);
    for (const g of p.gateways ?? []) {
      const where = `${p.id}/${g.id}`;
      if (!SLUG.test(g.id)) problems.push(`gateway id "${where}" (lowercase letters, digits and "-")`);
      const perKind = new Map<string, number>();
      const devices: SimDevice[] = [];
      for (const d of g.devices ?? []) {
        if (!DEVICE_ID.test(d.id) || devices.some((x) => x.id === d.id)) problems.push(`${where}: device id "${d.id}" is not allowed or repeated`);
        if (!isDeviceKind(d.kind)) {
          problems.push(`${where}/${d.id}: unknown kind "${d.kind}"`);
          continue;
        }
        const index = perKind.get(d.kind) ?? 0;
        perKind.set(d.kind, index + 1);
        devices.push({ id: d.id, uid: `${where}/${d.id}`, kind: d.kind, index });
      }
      const interval = intervalOverride ?? g.interval ?? 60;
      if (interval < LIMITS.minInterval) problems.push(`${where}: interval ${interval} s is below ${LIMITS.minInterval} s`);
      const shiftMinutes = g.simShiftMinutes ?? Math.floor(chance(where) * 120);
      gateways.push({ project: p.id, id: g.id, interval, shift: shiftMinutes * 60_000, devices });
    }
  }
  if (gateways.length === 0) problems.push("no gateways");
  if (problems.length) throw new Error(`${path}:\n  ${problems.join("\n  ")}`);
  return gateways;
}

/** Split one cycle into messages under the size limit; device errors ride in the first one. */
function splitCycle(base: Omit<TelemetryMessage, "devices" | "errors" | "seq">, devices: Record<string, DeviceReadings>, errors: Record<string, string>) {
  const head = JSON.stringify({ ...base, seq: 0xffff_ffff, devices: {}, errors }).length;
  const parts: { devices: Record<string, DeviceReadings>; errors?: Record<string, string> }[] = [];
  let chunk: Record<string, DeviceReadings> = {};
  let size = head;
  for (const [id, readings] of Object.entries(devices)) {
    const add = id.length + JSON.stringify(readings).length + 4;
    if (size + add > LIMITS.maxBytes && Object.keys(chunk).length > 0) {
      parts.push({ devices: chunk });
      chunk = {};
      size = head;
    }
    chunk[id] = readings;
    size += add;
  }
  parts.push({ devices: chunk });
  if (Object.keys(errors).length > 0) parts[0].errors = errors;
  return parts;
}

class Gateway {
  readonly name: string;
  private client: MqttClient;
  private seq = 0;
  /** Last value of every state point, "device.point" → 0/1. */
  private states = new Map<string, number>();
  private cycleTimer?: NodeJS.Timeout;
  private scanTimer?: NodeJS.Timeout;

  constructor(private cfg: GatewayConfig) {
    this.name = `${cfg.project}/${cfg.id}`;
    const offline: StatusMessage = { v: 1, state: "offline" };
    this.client = mqtt.connect(url, {
      clientId: `${cfg.project}.${cfg.id}`,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      keepalive: 60,
      reconnectPeriod: 5_000,
      will: { topic: this.topic("status"), payload: Buffer.from(JSON.stringify(offline)), qos: 1, retain: true },
    });
    this.client.on("connect", () => {
      console.log(`● ${this.name} connected (${cfg.devices.length} devices, every ${cfg.interval} s)`);
      const online: StatusMessage = { v: 1, state: "online", ts: nowSec(), fw: FW };
      void this.publish("status", online, true);
    });
    this.client.on("offline", () => console.log(`○ ${this.name} offline: messages are queued until the link is back`));
    this.client.on("error", (e) => console.error(`✗ ${this.name}: ${e.message}`));
  }

  private topic(channel: Channel) {
    return topicFor(this.cfg.project, this.cfg.id, channel);
  }

  private nextSeq() {
    const seq = this.seq;
    this.seq = (this.seq + 1) >>> 0;
    return seq;
  }

  private publish(channel: Channel, message: TelemetryMessage | EventMessage | StatusMessage, retain = false) {
    const payload = JSON.stringify(message);
    if (args.print) console.log(`${this.topic(channel)}\n${JSON.stringify(message, null, 2)}`);
    return this.client.publishAsync(this.topic(channel), payload, { qos: 1, retain });
  }

  /** Poll every device for the cycle that starts at `ts` (Unix seconds) and publish it. */
  async cycle(ts: number) {
    const devices: Record<string, DeviceReadings> = {};
    const errors: Record<string, string> = {};
    for (const d of this.cfg.devices) {
      const r = poll(d, ts * 1000, this.cfg.shift);
      if (r.ok) devices[d.id] = r.values;
      else errors[d.id] = r.reason;
    }
    const base = { v: 1 as const, ts, interval: this.cfg.interval };
    for (const part of splitCycle(base, devices, errors)) {
      const message: TelemetryMessage = { ...base, seq: this.nextSeq(), ...part };
      const bytes = JSON.stringify(message).length;
      const failed = part.errors ? ` no-answer=${Object.keys(part.errors).join(",")}` : "";
      console.log(`→ ${this.name} telemetry ${clock(ts)} seq=${message.seq} devices=${Object.keys(part.devices).length}${failed} ${(bytes / 1024).toFixed(1)} KB`);
      await this.publish("telemetry", message);
    }
  }

  /** Publish changes of state, mode and fault-word points at once instead of waiting for the next cycle. */
  private scan() {
    const now = Date.now();
    const changes: PointChange[] = [];
    for (const d of this.cfg.devices) {
      const r = poll(d, now, this.cfg.shift);
      if (!r.ok) continue;
      for (const point of eventPoints(d.kind)) {
        const value = r.values[point];
        if (value === null || value === undefined) continue; // a failed read is not a change
        const key = `${d.id}.${point}`;
        const before = this.states.get(key);
        this.states.set(key, value);
        if (before !== undefined && before !== value) changes.push({ device: d.id, point, value });
      }
    }
    if (changes.length === 0) return;
    const message: EventMessage = { v: 1, ts: Math.floor(now / 1000), seq: this.nextSeq(), changes };
    console.log(`⚡ ${this.name} event seq=${message.seq} ${changes.map((c) => `${c.device}.${c.point}=${c.value}`).join(" ")}`);
    void this.publish("event", message);
  }

  start() {
    const ms = this.cfg.interval * 1000;
    const schedule = () => {
      const next = Math.floor(Date.now() / ms) * ms + ms;
      this.cycleTimer = setTimeout(() => {
        void this.cycle(next / 1000);
        schedule();
      }, next - Date.now());
    };
    schedule();
    this.scan();
    this.scanTimer = setInterval(() => this.scan(), EVENT_SCAN_MS);
  }

  /** The current cycle (aligned to the interval), published right after the "online" status. */
  async runOnce() {
    if (!this.client.connected) await new Promise<void>((resolve) => this.client.once("connect", () => resolve()));
    const ms = this.cfg.interval * 1000;
    await this.cycle(Math.floor(Date.now() / ms) * (ms / 1000));
  }

  /** Graceful stop: say "offline" ourselves (the Last Will only fires when the link drops). */
  async stop() {
    clearTimeout(this.cycleTimer);
    clearInterval(this.scanTimer);
    if (this.client.connected) await this.publish("status", { v: 1, state: "offline", ts: nowSec(), fw: FW }, true);
    await this.client.endAsync();
  }
}

const interval = args.interval === undefined ? undefined : Number(args.interval);
if (interval !== undefined && !Number.isInteger(interval)) throw new Error("--interval must be whole seconds");

const gateways = loadFleet(args.fleet, interval).map((cfg) => new Gateway(cfg));
console.log(`Virtual PLC fleet: ${gateways.length} gateways → ${url.replace(/\/\/.*@/, "//")}`);

if (args.once) {
  await Promise.all(gateways.map((g) => g.runOnce()));
  await Promise.all(gateways.map((g) => g.stop()));
} else {
  for (const g of gateways) g.start();
  process.once("SIGINT", async () => {
    console.log("\nStopping…");
    await Promise.all(gateways.map((g) => g.stop()));
    process.exit(0);
  });
}
