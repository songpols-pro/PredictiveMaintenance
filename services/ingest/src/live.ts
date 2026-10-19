// Live view in Firestore, for screens that update by themselves (onSnapshot). TimescaleDB stays the
// record: a Firestore failure is logged and the message is still acknowledged, and active alarms are
// re-synced from TimescaleDB at start and every few minutes, so Firestore catches up on its own.
//
//   projects/{project}/gateways/{gateway}   one document per gateway, written once per message:
//     state, stateAt, fw                      online state (status channel)
//     interval, lastTs, seq, lastSeen         latest cycle; lastSeen is the server time it arrived
//     devices.{id}.values.{point}             latest good value of every point: a failed read (null) is
//                                             left out, so the screen keeps the last value instead of a gap
//                                             (history in TimescaleDB still records the null)
//     devices.{id}.ts / ok / error / errorAt  cycle time, whether the device answered, last error
//     devices.{id}.changedAt                  time of the latest event-channel change
//   projects/{project}/alarms/{id}          active alarms only (deleted when they clear); id = alarms.id
//
// Browsers read these with sign-in: firestore.rules allows projects/{project}/** to accounts whose
// custom claims list the project (or admin), and denies every write from a browser.

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type pg from "pg";
import type { Decoded, TopicParts } from "../../../pdm-app/src/lib/telemetry/contract";
import { log } from "./log";
import type { AlarmChange, WriteResult } from "./store";

const at = (ts: number) => Timestamp.fromMillis(ts * 1000);

export class LiveView {
  readonly db: Firestore;

  constructor(projectId: string) {
    // Credentials: Application Default Credentials (gcloud locally, the service account on Cloud Run).
    const app = getApps()[0] ?? initializeApp({ projectId });
    this.db = getFirestore(app);
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  private gatewayDoc(t: TopicParts): DocumentReference {
    return this.db.doc(`projects/${t.project}/gateways/${t.gateway}`);
  }

  private alarmDoc(project: string, id: number | string): DocumentReference {
    return this.db.doc(`projects/${project}/alarms/${id}`);
  }

  /** Apply one stored message: the gateway document and any alarm changes, in one atomic batch. */
  async write(topic: TopicParts, decoded: Decoded, result: WriteResult): Promise<void> {
    const batch = this.db.batch();
    const doc = this.gatewayDoc(topic);
    const base = { project: topic.project, gateway: topic.gateway, updatedAt: FieldValue.serverTimestamp() };

    switch (decoded.channel) {
      case "telemetry": {
        if (!result.latest) break; // an older cycle from the gateway's buffer: history only
        const m = decoded.message;
        const devices: Record<string, object> = {};
        for (const [id, values] of Object.entries(m.devices)) devices[id] = { values: readOnly(values), ts: at(m.ts), ok: true };
        for (const [id, reason] of Object.entries(m.errors ?? {})) devices[id] = { ok: false, error: reason, errorAt: at(m.ts) };
        batch.set(doc, { ...base, interval: m.interval, lastTs: at(m.ts), seq: m.seq, lastSeen: FieldValue.serverTimestamp(), devices }, { merge: true });
        break;
      }
      case "event": {
        if (!result.latest) break;
        const m = decoded.message;
        const devices: Record<string, { values: Record<string, number | null>; changedAt: Timestamp }> = {};
        for (const c of m.changes) {
          devices[c.device] ??= { values: {}, changedAt: at(m.ts) };
          if (c.value !== null) devices[c.device].values[c.point] = c.value;
        }
        batch.set(doc, { ...base, seq: m.seq, lastSeen: FieldValue.serverTimestamp(), devices }, { merge: true });
        break;
      }
      case "status": {
        const m = decoded.message;
        batch.set(doc, { ...base, state: m.state, ...(result.changed ? { stateAt: m.ts === undefined ? FieldValue.serverTimestamp() : at(m.ts) } : {}), fw: m.fw }, { merge: true });
        break;
      }
    }

    for (const a of result.alarmChanges) {
      if (a.change === "closed") batch.delete(this.alarmDoc(a.project, a.id));
      else batch.set(this.alarmDoc(a.project, a.id), alarmData(a));
    }
    await batch.commit();
  }

  /**
   * Make Firestore's active alarms equal to TimescaleDB's open alarms (after a Firestore outage, or
   * alarms opened before the live view existed). Returns how many documents it added and removed.
   */
  async syncAlarms(pool: pg.Pool): Promise<{ added: number; removed: number }> {
    const { rows } = await pool.query<AlarmChange>(
      `SELECT a.*, 'opened' AS change, b.en, b.th
       FROM alarms a LEFT JOIN fault_bits b ON b.profile = a.profile AND b.word = a.word AND b.bit = a.bit
       WHERE a.ended_at IS NULL`,
    );
    const open = new Map(rows.map((r) => [`${r.project}/${r.id}`, r]));
    const snap = await this.db.collectionGroup("alarms").get();
    const present = new Set<string>();
    let added = 0;
    let removed = 0;
    let batch = this.db.batch();
    let pending = 0;
    const flush = async () => {
      if (pending) await batch.commit();
      batch = this.db.batch();
      pending = 0;
    };
    for (const d of snap.docs) {
      const key = `${d.ref.parent.parent?.id}/${d.id}`;
      present.add(key);
      if (!open.has(key)) {
        batch.delete(d.ref);
        removed++;
        if (++pending === 400) await flush();
      }
    }
    for (const [key, a] of open) {
      if (present.has(key)) continue;
      batch.set(this.alarmDoc(a.project, a.id), alarmData(a));
      added++;
      if (++pending === 400) await flush();
    }
    await flush();
    return { added, removed };
  }
}

/** The values that were read (a merge write then keeps the previous value of a point that failed). */
function readOnly(values: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).filter((e): e is [string, number] => e[1] !== null));
}

function alarmData(a: AlarmChange) {
  return {
    project: a.project,
    gateway: a.gateway,
    device: a.device,
    profile: a.profile,
    word: a.word,
    bit: a.bit,
    code: a.code,
    severity: a.severity,
    en: a.en ?? `Unknown fault (${a.word} bit ${a.bit})`,
    th: a.th ?? `fault ที่ไม่มีในเอกสาร (${a.word} bit ${a.bit})`,
    startedAt: Timestamp.fromDate(new Date(a.started_at)),
    ...(a.acked_at ? { ackedAt: Timestamp.fromDate(new Date(a.acked_at)), ackedBy: a.acked_by ?? null } : {}),
  };
}

/** Run Firestore work without ever failing the message: TimescaleDB already has it. */
export async function bestEffort(what: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (e) {
    log.warn(`Firestore: ${what} failed (history is stored; the live view catches up)`, { error: (e as Error).message });
    return false;
  }
}
