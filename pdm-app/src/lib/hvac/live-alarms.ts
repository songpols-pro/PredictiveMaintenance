// Active alarms of one project from its live documents in Firestore, as the /hvac screens show them.
// The browser (live-firestore.ts, web SDK) and the alarm email notifier in services/ingest (Admin SDK)
// both call liveAlarms, so an email names exactly the alarms a signed-in user sees, under the same ids.
// No "@/" imports: services/ingest loads this file directly.

import type { HvacAlarm } from "./model";

/** A Firestore Timestamp of either SDK. */
export interface TimeLike {
  toMillis(): number;
}

/** projects/{project}/gateways/{gateway}.devices.{id} (written by services/ingest, live.ts). */
export interface DeviceEntryData {
  values?: Record<string, number | null>;
  ok?: boolean;
  ts?: TimeLike;
  error?: string;
  errorAt?: TimeLike;
}

/** projects/{project}/gateways/{gateway}. */
export interface GatewayDocData {
  state?: "online" | "offline";
  stateAt?: TimeLike;
  interval?: number;
  lastTs?: TimeLike;
  lastSeen?: TimeLike;
  devices?: Record<string, DeviceEntryData>;
}

/** projects/{project}/alarms/{id}: an active fault alarm. */
export interface AlarmDocData {
  device: string;
  code: string;
  severity: "critical" | "warning";
  en: string;
  th: string;
  startedAt: TimeLike;
  ackedAt?: TimeLike;
  ackedBy?: string;
}

/** projects/{project}/commAcks/{key}: the latest acknowledged communication loss of a gateway or device. */
export interface CommAckDocData {
  /** The outage it acknowledged (`since` of the alarm id, see commAlarmId). */
  since: number;
  ackedAt: TimeLike;
  ackedBy?: string;
}

export const ms = (t?: TimeLike) => (t ? t.toMillis() : 0);
export const DEFAULT_INTERVAL_S = 60;
/** A gateway with no message for this many of its cycles counts as silent (communication lost). */
export const SILENT_CYCLES = 2.5;

/**
 * Id of a communication-loss alarm: the gateway or device plus when its outage began, so an
 * acknowledgement covers that outage only and the next one shows as new. `since` must not move while
 * the outage lasts: the gateway's last message (server time), or the device's last good cycle (0 if it
 * never answered). Parsed by /api/hvac/alarms, which stores acknowledgements under commAcks/{key}.
 */
export const commAlarmId = (key: `gateway:${string}` | `comm:${string}`, since: number) => `${key}@${since}`;

/**
 * The project's active alarms, newest first, and its silent gateways: communication losses (a gateway
 * offline or silent for SILENT_CYCLES cycles, a device not answering) and the fault alarms of the
 * alarm documents, each with its stored acknowledgement.
 */
export function liveAlarms(
  gateways: Map<string, GatewayDocData>,
  alarmDocs: (AlarmDocData & { id: string })[],
  commAcks: Map<string, CommAckDocData>,
  now: number,
): { alarms: HvacAlarm[]; silent: Set<string> } {
  const silent = new Set<string>();
  const alarms: HvacAlarm[] = [];
  // A stored acknowledgement counts for the outage it was given for only.
  const commLoss = (key: `gateway:${string}` | `comm:${string}`, since: number, alarm: Omit<HvacAlarm, "id" | "code" | "end">): HvacAlarm => {
    const ack = commAcks.get(key);
    return { id: commAlarmId(key, since), code: "commLoss", end: null, ...alarm, ...(ack?.since === since ? { ackedAt: ms(ack.ackedAt), ...(ack.ackedBy ? { ackedBy: ack.ackedBy } : {}) } : {}) };
  };

  for (const [id, g] of gateways) {
    const interval = (g.interval ?? DEFAULT_INTERVAL_S) * 1000;
    const quiet = g.state === "offline" || now - ms(g.lastSeen) > SILENT_CYCLES * interval;
    if (quiet) {
      silent.add(id);
      alarms.push(commLoss(`gateway:${id}`, ms(g.lastSeen), { deviceId: id, severity: "critical", start: g.state === "offline" ? ms(g.stateAt) || ms(g.lastSeen) : ms(g.lastSeen) }));
      continue;
    }
    for (const [device, d] of Object.entries(g.devices ?? {})) {
      // The device stopped answering after its last good reading (ts): that is when the outage began.
      if (d.ok === false) alarms.push(commLoss(`comm:${device}`, ms(d.ts), { deviceId: device, severity: "warning", start: ms(d.ts) || ms(d.errorAt) }));
    }
  }

  for (const a of alarmDocs) {
    alarms.push({
      id: `fault:${a.id}`,
      deviceId: a.device,
      code: a.code,
      severity: a.severity,
      start: ms(a.startedAt),
      end: null,
      label: { en: a.en, th: a.th },
      ...(a.ackedAt ? { ackedAt: ms(a.ackedAt), ...(a.ackedBy ? { ackedBy: a.ackedBy } : {}) } : {}),
    });
  }
  return { alarms: alarms.sort((a, b) => b.start - a.start), silent };
}
