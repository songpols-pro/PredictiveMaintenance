import "server-only";
import type { Readings } from "@/lib/hvac/from-readings";
import { dependencies, reduceBy, type Bucket } from "@/lib/hvac/history-spec";
import type { PlantLayout } from "@/lib/hvac/layout";
import { attachCommAcks, type CommAckRecord } from "@/lib/hvac/comm-acks";
import type { HvacAlarm } from "@/lib/hvac/model";
import { timescale } from "./timescale";

// Queries behind the /hvac history API. Every query is scoped to one project (checked by the caller).

/** Stored readings of the raw points the chart points need, reduced per time bucket. */
export async function historyBuckets(project: string, pointIds: string[], from: number, to: number, step: number, layout: PlantLayout): Promise<Bucket[]> {
  const devices: string[] = [];
  const points: string[] = [];
  for (const [device, keys] of dependencies(pointIds, layout)) {
    for (const key of keys) {
      devices.push(device);
      points.push(key);
    }
  }
  if (devices.length === 0) return [];
  const { rows } = await timescale().query<{ t: string; device: string; point: string; avg: number | null; last: number | null }>(
    `SELECT (extract(epoch FROM time_bucket(make_interval(secs => $4), ts)) * 1000)::bigint AS t, device, point,
            avg(value) AS avg, last(value, ts) AS last
     FROM telemetry
     WHERE project = $1 AND ts >= $2 AND ts < $3
       AND (device, point) IN (SELECT * FROM unnest($5::text[], $6::text[]))
     GROUP BY 1, 2, 3`,
    // The last grid step starts at `to`, so its bucket runs to `to + step`.
    [project, new Date(from), new Date(to + step), step / 1000, devices, points],
  );
  const byTime = new Map<number, Readings>();
  for (const r of rows) {
    const t = Number(r.t);
    const readings = byTime.get(t) ?? {};
    const device = readings[r.device] ?? { values: {}, ok: true };
    device.values[r.point] = reduceBy(r.point) === "avg" ? r.avg : r.last;
    readings[r.device] = device;
    byTime.set(t, readings);
  }
  return [...byTime].map(([t, readings]) => ({ t, readings }));
}

/**
 * Energy counter (kWh) of each meter at each instant: its last reading at or before it, at most an hour
 * old (null otherwise: a reading from before a gap would count the gap's energy on the wrong day).
 * Energy between two instants is the difference.
 */
export async function counterAt(project: string, meters: string[], times: number[]): Promise<Record<string, (number | null)[]>> {
  const { rows } = await timescale().query<{ i: string; device: string; kwh: number | null }>(
    `SELECT b.i, d.device,
            (SELECT value FROM telemetry
             WHERE project = $1 AND device = d.device AND point = 'kwh' AND ts <= b.t AND ts > b.t - INTERVAL '1 hour'
             ORDER BY ts DESC LIMIT 1) AS kwh
     FROM unnest($2::timestamptz[]) WITH ORDINALITY AS b(t, i)
     CROSS JOIN unnest($3::text[]) AS d(device)`,
    [project, times.map((t) => new Date(t)), meters],
  );
  const out: Record<string, (number | null)[]> = Object.fromEntries(meters.map((mt) => [mt, times.map(() => null)]));
  for (const r of rows) out[r.device][Number(r.i) - 1] = r.kwh;
  return out;
}

interface FaultRow {
  id: string;
  device: string;
  code: string;
  severity: "critical" | "warning";
  started_at: Date;
  ended_at: Date | null;
  acked_at: Date | null;
  acked_by: string | null;
  en: string | null;
  th: string | null;
}

/** How far before `from` the log looks for the start of a communication loss. */
const COMM_LOOKBACK = 7 * 86_400_000;

/**
 * Alarms overlapping [from, to], newest first: fault alarms, plus communication losses from the events
 * with who acknowledged them (`commAcks`, see lib/server/comm-acks.ts).
 */
export async function alarmLog(project: string, from: number, to: number, commAcks: CommAckRecord[] = []): Promise<HvacAlarm[]> {
  const db = timescale();
  const [faults, events] = await Promise.all([
    db.query<FaultRow>(
      `SELECT a.id, a.device, a.code, a.severity, a.started_at, a.ended_at, a.acked_at, a.acked_by, b.en, b.th
       FROM alarms a LEFT JOIN fault_bits b ON b.profile = a.profile AND b.word = a.word AND b.bit = a.bit
       WHERE a.project = $1 AND a.started_at <= $3 AND (a.ended_at IS NULL OR a.ended_at >= $2)
       ORDER BY a.started_at DESC LIMIT 2000`,
      [project, new Date(from), new Date(to)],
    ),
    // A week before `from` too, so an outage that began earlier is still found.
    db.query<{ ts: Date; gateway: string; device: string; point: string; value: number }>(
      `SELECT ts, gateway, device, point, value FROM events
       WHERE project = $1 AND point IN ('_comm', '_online') AND ts <= $3 AND ts >= $2::timestamptz - make_interval(secs => $4)
       ORDER BY ts, received_at`,
      [project, new Date(from), new Date(to), COMM_LOOKBACK / 1000],
    ),
  ]);

  const out: HvacAlarm[] = faults.rows.map((r) => ({
    id: `fault:${r.id}`,
    deviceId: r.device,
    code: r.code,
    severity: r.severity,
    start: r.started_at.getTime(),
    end: r.ended_at?.getTime() ?? null,
    label: { en: r.en ?? `Unknown fault (${r.code})`, th: r.th ?? `fault ที่ไม่มีในเอกสาร (${r.code})` },
    ...(r.acked_at ? { ackedAt: r.acked_at.getTime(), ackedBy: r.acked_by ?? undefined } : {}),
  }));

  // Pair "lost" (0) with the next "back" (1) of the same gateway or device. Outages that ended before
  // `from` are kept until the acknowledgements are matched (each belongs to the first outage after it).
  const open = new Map<string, number>();
  const comm: HvacAlarm[] = [];
  const push = (key: string, start: number, end: number | null) => {
    const gateway = key.startsWith("gateway:");
    comm.push({ id: `${key}@${start}`, deviceId: key.slice(key.indexOf(":") + 1), code: "commLoss", severity: gateway ? "critical" : "warning", start, end });
  };
  for (const e of events.rows) {
    const key = e.point === "_online" ? `gateway:${e.gateway}` : `comm:${e.device}`;
    const t = e.ts.getTime();
    if (e.value === 0 && !open.has(key)) open.set(key, t);
    else if (e.value === 1 && open.has(key)) {
      push(key, open.get(key)!, t);
      open.delete(key);
    }
  }
  for (const [key, start] of open) push(key, start, null);
  out.push(...attachCommAcks(comm, commAcks, from - COMM_LOOKBACK).filter((a) => a.end === null || a.end >= from));
  return out.sort((a, b) => b.start - a.start);
}

/** Acknowledge fault alarms; returns the ones that were not acknowledged before. */
export async function ackFaults(project: string, ids: number[], who: string): Promise<{ id: number; ackedAt: number }[]> {
  if (ids.length === 0) return [];
  const { rows } = await timescale().query<{ id: string; acked_at: Date }>(
    `UPDATE alarms SET acked_at = now(), acked_by = $3
     WHERE project = $1 AND id = ANY($2::bigint[]) AND acked_at IS NULL
     RETURNING id, acked_at`,
    [project, ids, who],
  );
  return rows.map((r) => ({ id: Number(r.id), ackedAt: r.acked_at.getTime() }));
}
