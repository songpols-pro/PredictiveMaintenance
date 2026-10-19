// Ingestion service: MQTT (contract v1) → TimescaleDB.
//
// Delivery: QoS 1 with a persistent session (clean: false, fixed client id). A message is acknowledged
// to the broker only after its database write commits, so a crash or a database outage loses nothing:
// the broker redelivers, and the unique keys make the redelivered rows a no-op.
// Messages the contract rejects are logged and acknowledged; redelivering them would never help.
//
//   npm start        reads .env (MQTT_*, DATABASE_URL, ...); GET /healthz on PORT for Cloud Run

import "./env";
import http from "node:http";
import mqtt, { type IPublishPacket } from "mqtt";
import { decode, parseTopic } from "../../../pdm-app/src/lib/telemetry/contract";
import { config } from "./config";
import { createPool, isTransient } from "./db";
import { LiveView, bestEffort } from "./live";
import { log } from "./log";
import { Notifier } from "./notify";
import { migrate } from "./schema";
import { write } from "./store";

const RETRIES = [1_000, 2_000, 4_000];

const stats = {
  startedAt: new Date().toISOString(),
  received: 0,
  stored: 0,
  duplicates: 0,
  rejected: 0,
  dbErrors: 0,
  alarmsOpened: 0,
  alarmsClosed: 0,
  liveWrites: 0,
  liveErrors: 0,
  lastWriteAt: null as string | null,
  lastError: null as string | null,
};

const pool = createPool(config.databaseUrl, config.dbCaFile);
const applied = await migrate(pool, { compressAfter: config.compressAfter, retention: config.retention });
log.info(`schema up to date: ${applied.join(", ")}`);

const live = config.firebaseProjectId ? new LiveView(config.firebaseProjectId) : null;
const ALARM_SYNC_MS = 10 * 60_000;
async function syncAlarms() {
  if (!live) return;
  await bestEffort("alarm sync", async () => {
    const r = await live.syncAlarms(pool);
    if (r.added || r.removed) log.info(`Firestore alarms re-synced: +${r.added} -${r.removed}`);
  });
}
if (live) {
  log.info(`live view: Firestore of ${config.firebaseProjectId}`);
  await syncAlarms();
  setInterval(() => void syncAlarms(), ALARM_SYNC_MS).unref();
} else {
  log.info("live view off (FIREBASE_PROJECT_ID not set): history only");
}

const notifier = live && config.notifyEmail ? new Notifier(live.db, config.notifySiteUrl) : null;
if (notifier) {
  notifier.start();
  log.info(`alarm emails on (link: ${config.notifySiteUrl || "none, NOTIFY_SITE_URL not set"})`);
} else if (config.notifyEmail) {
  log.warn("NOTIFY_EMAIL=on needs the live view (FIREBASE_PROJECT_ID): alarm emails stay off");
}

/** Last seq per gateway, to report gaps (messages lost before the broker, or a gateway restart). */
const lastSeq = new Map<string, number>();
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en-GB");

async function handle(packet: IPublishPacket): Promise<void> {
  stats.received++;
  const receivedAt = new Date();
  const payload = typeof packet.payload === "string" ? Buffer.from(packet.payload) : packet.payload;
  const topic = parseTopic(packet.topic);
  if (!topic) {
    stats.rejected++;
    log.warn("rejected: topic is outside the contract", { topic: packet.topic });
    return;
  }
  if (payload.length === 0) return; // a retained message being cleared
  const name = `${topic.project}/${topic.gateway}`;
  const decoded = decode(topic.channel, payload, Math.floor(receivedAt.getTime() / 1000));
  if (!decoded.ok) {
    stats.rejected++;
    log.warn(`rejected ${name} ${topic.channel}`, { errors: decoded.errors });
    return;
  }

  const d = decoded.value;
  if (d.channel !== "status") {
    const prev = lastSeq.get(name);
    if (prev !== undefined && d.message.seq !== ((prev + 1) >>> 0) && d.message.seq !== prev) {
      log.warn(`${name} seq ${prev} → ${d.message.seq}: messages lost or gateway restarted`);
    }
    lastSeq.set(name, d.message.seq);
  } else if (d.message.state === "online") {
    lastSeq.delete(name);
  }

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const r = await write(pool, topic, d, receivedAt);
      stats.lastWriteAt = new Date().toISOString();
      if (r.rows === 0 && d.channel !== "status") stats.duplicates++;
      else stats.stored++;
      const opened = r.alarmChanges.filter((a) => a.change === "opened");
      const closed = r.alarmChanges.filter((a) => a.change === "closed");
      stats.alarmsOpened += opened.length;
      stats.alarmsClosed += closed.length;
      const dbMs = Date.now() - started;
      if (live) {
        const ok = await bestEffort(`${name} ${topic.channel}`, () => live.write(topic, d, r));
        if (ok) stats.liveWrites++;
        else stats.liveErrors++;
      }
      const ms = Date.now() - started;
      const alarms = [...opened.map((a) => ` +${a.device}:${a.code}`), ...closed.map((a) => ` -${a.device}:${a.code}`)].join("");
      const timing = live ? ` ${dbMs}+${ms - dbMs} ms` : ` ${ms} ms`;
      if (d.channel === "telemetry") {
        const dup = r.rows === 0 ? " (already stored)" : r.rows < r.of ? ` (${r.of - r.rows} already stored)` : "";
        log.info(`${name} telemetry ${clock(d.message.ts)} seq=${d.message.seq} ${r.rows}/${r.of} rows${dup}${r.latest ? "" : " (older cycle: history only)"}${alarms}${timing}`);
      } else if (d.channel === "event") {
        log.info(`${name} event seq=${d.message.seq} ${d.message.changes.map((c) => `${c.device}.${c.point}=${c.value}`).join(" ")}${alarms}${timing}`);
      } else {
        log.info(`${name} status ${d.message.state}${packet.retain ? " (retained)" : ""}${r.changed ? "" : " (unchanged)"}${timing}`);
      }
      return;
    } catch (e) {
      stats.dbErrors++;
      stats.lastError = (e as Error).message;
      if (!isTransient(e)) {
        // The database refused this message itself (bad value, constraint): it will never succeed.
        stats.rejected++;
        log.error(`dropped ${name} ${topic.channel}: database refused it`, { error: (e as Error).message, code: (e as { code?: string }).code });
        return;
      }
      if (attempt >= RETRIES.length) throw e; // not acknowledged: the broker redelivers after reconnecting
      log.warn(`database unavailable, retrying in ${RETRIES[attempt] / 1000} s`, { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, RETRIES[attempt]));
    }
  }
}

const client = mqtt.connect(config.mqttUrl, {
  clientId: config.mqttClientId,
  clean: false,
  username: config.mqttUsername,
  password: config.mqttPassword,
  keepalive: 60,
  reconnectPeriod: 5_000,
});

// mqtt.js sends the PUBACK only after this callback: that is what makes the database write durable.
client.handleMessage = (packet, done) => {
  handle(packet).then(
    () => done(),
    (e: Error) => {
      log.error("message not stored, the broker will redeliver it", { topic: packet.topic, error: e.message });
      done(e);
    },
  );
};

client.on("connect", async (connack) => {
  log.info(`connected to ${config.mqttUrl} as ${config.mqttClientId}${connack.sessionPresent ? " (session resumed: queued messages follow)" : " (new session)"}`);
  try {
    const granted = await client.subscribeAsync(config.mqttTopic, { qos: 1 });
    if (granted.some((g) => g.qos & 0x80)) throw new Error("refused");
  } catch {
    log.error(`the broker refused the subscription to ${config.mqttTopic}: give ${config.mqttUsername ?? "this user"} subscribe rights`);
    process.exit(1);
  }
});
client.on("offline", () => log.warn("MQTT offline, reconnecting"));
client.on("error", (e) => log.error("MQTT error", { error: e.message }));

const server = http
  .createServer((req, res) => {
    const ok = client.connected;
    res.writeHead(req.url === "/healthz" ? (ok ? 200 : 503) : 404, { "content-type": "application/json" });
    res.end(req.url === "/healthz" ? JSON.stringify({ ok, mqtt: ok ? "connected" : "disconnected", ...stats, ...(notifier ? { alarmEmails: notifier.stats } : {}) }) : "{}");
  })
  .listen(config.port, () => log.info(`health check on http://localhost:${config.port}/healthz`));

async function shutdown(signal: string) {
  log.info(`${signal}: stopping`);
  server.close();
  await client.endAsync().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
