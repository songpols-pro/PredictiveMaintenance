import "server-only";
import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { COMM_ACK_HISTORY, type CommAckRecord } from "@/lib/hvac/comm-acks";
import { DEVICE_ID } from "@/lib/telemetry/contract";

// Acknowledgements of communication losses: projects/{project}/commAcks/{key}, one document per gateway
// or device ("gateway:<id>" / "comm:<device>"). Its since / ackedAt / ackedBy are the latest acknowledged
// outage, which the live screens read; history keeps the last COMM_ACK_HISTORY of them for the alarm log.

export interface CommLoss {
  /** The alarm id the screen sent, "<key>@<since>". */
  id: string;
  key: string;
  since: number;
}

/** A communication-loss alarm id (commAlarmId in lib/hvac/live-alarms.ts), or null. */
export function parseCommLoss(id: string): CommLoss | null {
  const m = /^(gateway|comm):([^@]+)@(\d{1,15})$/.exec(id);
  if (!m || !DEVICE_ID.test(m[2])) return null;
  return { id, key: `${m[1]}:${m[2]}`, since: Number(m[3]) };
}

interface StoredAck {
  since: number;
  ackedAt: Timestamp | Date;
  ackedBy?: string;
}

const ms = (t: Timestamp | Date) => (t instanceof Date ? t.getTime() : t.toMillis());

/**
 * Acknowledge communication losses of gateways and devices the project has; returns the ones that were
 * not acknowledged before (the first acknowledgement of an outage is kept).
 */
export async function ackCommLosses(db: Firestore, project: string, items: CommLoss[], who: string): Promise<string[]> {
  const gateways = await db.collection(`projects/${project}/gateways`).get();
  const known = new Set(gateways.docs.flatMap((g) => [`gateway:${g.id}`, ...Object.keys((g.get("devices") as Record<string, unknown> | undefined) ?? {}).map((d) => `comm:${d}`)]));
  // One acknowledgement per key: the last one listed wins if a request names two outages of one device.
  const wanted = [...new Map(items.filter((i) => known.has(i.key)).map((i) => [i.key, i])).values()];
  if (wanted.length === 0) return [];
  const refs = wanted.map((i) => db.doc(`projects/${project}/commAcks/${i.key}`));
  return db.runTransaction(async (tx) => {
    const current = await tx.getAll(...refs);
    const acked: string[] = [];
    const ackedAt = new Date();
    wanted.forEach((item, i) => {
      const doc = current[i];
      if (doc.get("since") === item.since) return;
      const ack: StoredAck = { since: item.since, ackedAt, ackedBy: who };
      tx.set(refs[i], { ...ack, history: [...previous(doc.data()), ack].slice(-COMM_ACK_HISTORY) });
      acked.push(item.id);
    });
    return acked;
  });
}

/** The acknowledgements a document holds (documents written before history existed have the latest only). */
function previous(data: Record<string, unknown> | undefined): StoredAck[] {
  if (!data) return [];
  if (Array.isArray(data.history)) return data.history as StoredAck[];
  return typeof data.since === "number" && data.ackedAt ? [{ since: data.since, ackedAt: data.ackedAt as Timestamp, ...(typeof data.ackedBy === "string" ? { ackedBy: data.ackedBy } : {}) }] : [];
}

/** Every stored acknowledgement of the project's communication losses, for the alarm log. */
export async function readCommAcks(db: Firestore, project: string): Promise<CommAckRecord[]> {
  const snap = await db.collection(`projects/${project}/commAcks`).get();
  return snap.docs.flatMap((d) => previous(d.data()).map((a) => ({ key: d.id, since: a.since, ackedAt: ms(a.ackedAt), ...(a.ackedBy ? { ackedBy: a.ackedBy } : {}) })));
}
