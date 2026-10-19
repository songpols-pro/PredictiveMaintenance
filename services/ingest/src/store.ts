// Writes one validated contract message to TimescaleDB: one function call, one round trip, one transaction.

import type pg from "pg";
import type { Decoded, TopicParts } from "../../../pdm-app/src/lib/telemetry/contract";

/** An alarm the message opened or closed (a row of the alarms table, plus names from fault_bits). */
export interface AlarmChange {
  change: "opened" | "closed";
  id: number;
  project: string;
  gateway: string;
  device: string;
  profile: string;
  word: string;
  bit: number;
  code: string;
  severity: "critical" | "warning";
  started_at: string;
  ended_at: string | null;
  acked_at?: string | null;
  acked_by?: string | null;
  en?: string | null;
  th?: string | null;
}

export interface WriteResult {
  /** New rows (0 means the broker redelivered a message that is already stored). */
  rows: number;
  /** Rows the message carried. */
  of: number;
  /** False for a cycle older than one already stored (from the gateway's buffer): not for the live view. */
  latest: boolean;
  alarmChanges: AlarmChange[];
  /** Status messages: whether the online state changed. */
  changed?: boolean;
}

interface IngestRow {
  stored: number;
  latest: boolean;
  alarm_changes: AlarmChange[] | null;
}

const toTime = (ts: number) => new Date(ts * 1000);

export async function write(pool: pg.Pool, topic: TopicParts, decoded: Decoded, receivedAt: Date): Promise<WriteResult> {
  const { project, gateway } = topic;
  switch (decoded.channel) {
    case "telemetry": {
      const m = decoded.message;
      const devices: string[] = [];
      const points: string[] = [];
      const values: (number | null)[] = [];
      for (const [device, readings] of Object.entries(m.devices)) {
        for (const [point, value] of Object.entries(readings)) {
          devices.push(device);
          points.push(point);
          values.push(value);
        }
      }
      const failed = Object.keys(m.errors ?? {});
      const reasons = failed.map((d) => m.errors![d]);
      const { rows } = await pool.query<IngestRow>("SELECT * FROM ingest_telemetry($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
        project,
        gateway,
        toTime(m.ts),
        m.seq,
        m.interval,
        devices,
        points,
        values,
        failed,
        reasons,
      ]);
      return { rows: rows[0].stored, of: values.length, latest: rows[0].latest, alarmChanges: rows[0].alarm_changes ?? [] };
    }
    case "event": {
      const m = decoded.message;
      const { rows } = await pool.query<IngestRow>("SELECT * FROM ingest_event($1, $2, $3, $4, $5, $6, $7)", [
        project,
        gateway,
        toTime(m.ts),
        m.seq,
        m.changes.map((c) => c.device),
        m.changes.map((c) => c.point),
        m.changes.map((c) => c.value),
      ]);
      return { rows: rows[0].stored, of: m.changes.length, latest: rows[0].latest, alarmChanges: rows[0].alarm_changes ?? [] };
    }
    case "status": {
      const m = decoded.message;
      // The Last Will has no ts (it is fixed when the gateway connects): use the time it arrived.
      const at = m.ts === undefined ? receivedAt : toTime(m.ts);
      const { rows } = await pool.query<{ changed: boolean }>("SELECT ingest_status($1, $2, $3, $4, $5) AS changed", [
        project,
        gateway,
        m.state,
        at,
        m.fw ?? null,
      ]);
      return { rows: rows[0].changed ? 1 : 0, of: 1, latest: true, alarmChanges: [], changed: rows[0].changed };
    }
  }
}
