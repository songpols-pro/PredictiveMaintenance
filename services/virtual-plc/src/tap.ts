// Contract checker: subscribes to pdm/v1/# and validates every message against the contract.
// Point it at the production broker while commissioning a real PLC to see at once what is wrong
// (bad JSON, milliseconds instead of seconds, clock drift, lost messages, misspelled point keys).
//
//   npm run tap                                   local broker (npm run broker)
//   npm run tap -- --print                        also print every payload
//   npm run tap -- --topic "pdm/v1/factory-b/#"   one project only

import "./env";
import { parseArgs } from "node:util";
import mqtt from "mqtt";
import { POINT_CATALOG } from "../../../pdm-app/src/lib/telemetry/catalog";
import { TOPIC_ROOT, decode, parseTopic } from "../../../pdm-app/src/lib/telemetry/contract";

const { values: args } = parseArgs({
  options: {
    topic: { type: "string", default: `${TOPIC_ROOT}/#` },
    print: { type: "boolean", default: false },
  },
});

const url = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const KNOWN_KEYS = new Set<string>(Object.values(POINT_CATALOG).flatMap((list) => list.map((p) => p.key)));
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en-GB");
const lastSeq = new Map<string, number>();

const client = mqtt.connect(url, {
  clientId: `tap-${Math.random().toString(36).slice(2, 8)}`,
  username: process.env.MQTT_TAP_USERNAME || process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_TAP_PASSWORD || process.env.MQTT_PASSWORD || undefined,
});

client.on("connect", async () => {
  // A refused subscription (ACL) comes back as SUBACK ≥ 0x80 (MQTT 3.1.1) or as an error (MQTT 5);
  // without this check the tap would just stay silent.
  const granted = await client.subscribeAsync(args.topic, { qos: 1 }).catch(() => [{ qos: 0x80 }]);
  if (granted.some((g) => g.qos & 0x80)) {
    console.error(`✗ The broker refused the subscription to ${args.topic}: give this user subscribe rights (MQTT_TAP_USERNAME)`);
    process.exit(1);
  }
  console.log(`Listening on ${url.replace(/\/\/.*@/, "//")} for ${args.topic}`);
});
client.on("error", (e) => console.error(`✗ ${e.message}`));

client.on("message", (topic, payload, packet) => {
  const now = Math.floor(Date.now() / 1000);
  const parts = parseTopic(topic);
  if (!parts) {
    console.log(`✗ ${topic}: not a contract topic (${TOPIC_ROOT}/{project}/{gateway}/telemetry|event|status)`);
    return;
  }
  const name = `${parts.project}/${parts.gateway}`;
  if (payload.length === 0) {
    console.log(`· ${name} ${parts.channel}: empty (retained message cleared)`);
    return;
  }
  const r = decode(parts.channel, payload, now);
  if (!r.ok) {
    console.log(`✗ ${name} ${parts.channel} rejected:`);
    for (const e of r.errors) console.log(`    ${e}`);
    return;
  }

  const notes: string[] = [];
  const d = r.value;
  if (d.channel === "status") {
    // A gateway that (re)starts may begin counting from 0 again.
    if (d.message.state === "online") lastSeq.delete(name);
  } else {
    const prev = lastSeq.get(name);
    const seq = d.message.seq;
    if (prev !== undefined && seq !== ((prev + 1) >>> 0)) {
      notes.push(seq === prev ? "same seq again (QoS 1 redelivery: the cloud must store it once)" : `seq ${prev} → ${seq}: messages lost or gateway restarted`);
    }
    lastSeq.set(name, seq);
  }

  switch (d.channel) {
    case "telemetry": {
      const m = d.message;
      const ids = Object.keys(m.devices);
      let points = 0;
      let nulls = 0;
      const unknown = new Set<string>();
      for (const readings of Object.values(m.devices)) {
        for (const [key, value] of Object.entries(readings)) {
          points++;
          if (value === null) nulls++;
          if (!KNOWN_KEYS.has(key)) unknown.add(key);
        }
      }
      const failed = m.errors ? ` no-answer=${Object.keys(m.errors).join(",")}` : "";
      console.log(`✓ ${name} telemetry ${clock(m.ts)} seq=${m.seq} devices=${ids.length} points=${points}${nulls ? ` null=${nulls}` : ""}${failed} ${(payload.length / 1024).toFixed(1)} KB`);
      if (now - m.ts > 2 * m.interval) notes.push(`${now - m.ts} s old: sent from the buffer after an outage, or the gateway clock is behind`);
      if (m.ts % m.interval !== 0) notes.push(`ts is not on a ${m.interval} s boundary: sample at the start of each cycle`);
      if (unknown.size) notes.push(`keys not in the catalog (typo, or a new point to add to catalog.ts): ${[...unknown].slice(0, 8).join(", ")}`);
      break;
    }
    case "event": {
      const m = d.message;
      console.log(`✓ ${name} event ${clock(m.ts)} seq=${m.seq} ${m.changes.map((c) => `${c.device}.${c.point}=${c.value}`).join(" ")}`);
      break;
    }
    case "status": {
      const m = d.message;
      console.log(`✓ ${name} status ${m.state}${packet.retain ? " (retained)" : ""}${m.fw ? ` fw=${m.fw}` : ""}${m.buffered ? ` buffered=${m.buffered}` : ""}`);
      break;
    }
  }
  for (const n of notes) console.log(`  ! ${n}`);
  if (args.print) console.log(JSON.stringify(JSON.parse(payload.toString()), null, 2));
});
