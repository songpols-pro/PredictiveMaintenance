// Acknowledgements of communication losses (a gateway gone silent, a device not answering). The live
// screens name an outage by when it began as they see it (`since`, see commAlarmId in live-alarms.ts:
// the gateway's last message, the device's last good cycle); the alarm log by its first stored "lost"
// event, which comes a little later. attachCommAcks pairs the two.

import type { HvacAlarm } from "./model";

export interface CommAckRecord {
  /** "gateway:<id>" or "comm:<device>". */
  key: string;
  since: number;
  ackedAt: number;
  ackedBy?: string;
}

/** Acknowledgements each gateway or device keeps for the alarm log (projects/{p}/commAcks/{key}.history). */
export const COMM_ACK_HISTORY = 50;

/**
 * How far an acknowledgement may fall outside its outage in the log: the screens can show a silent
 * gateway before its "offline" event is stored, and PLC and server clocks differ a little.
 */
const ACK_SLACK = 15 * 60_000;

/**
 * Attach acknowledgements to communication-loss entries of the alarm log (id "<key>@<start>"). An outage's
 * `since` lies between the end of the key's previous outage and its own start, so each entry takes the
 * acknowledgement of its key with the latest `since` in that span, given while the outage lasted (give or
 * take ACK_SLACK). `complete` is the time from which every outage is in `entries`: before it a previous
 * outage may be missing, so an older `since` is left out rather than put on a later outage.
 */
export function attachCommAcks(entries: HvacAlarm[], acks: CommAckRecord[], complete: number): HvacAlarm[] {
  const keyOf = (e: HvacAlarm) => e.id.slice(0, e.id.lastIndexOf("@"));
  const byKey = new Map<string, HvacAlarm[]>();
  for (const e of entries) byKey.set(keyOf(e), [...(byKey.get(keyOf(e)) ?? []), e]);
  const found = new Map<string, CommAckRecord>();
  for (const [key, list] of byKey) {
    const own = acks.filter((a) => a.key === key);
    let floor = complete;
    for (const e of list.sort((a, b) => a.start - b.start)) {
      const during = (a: CommAckRecord) => a.ackedAt >= e.start - ACK_SLACK && (e.end === null || a.ackedAt <= e.end + ACK_SLACK);
      const ack = own.filter((a) => a.since >= floor && a.since < e.start && during(a)).reduce<CommAckRecord | undefined>((best, a) => (best && best.since >= a.since ? best : a), undefined);
      if (ack) found.set(e.id, ack);
      floor = e.end ?? Number.POSITIVE_INFINITY;
    }
  }
  return entries.map((e) => {
    const ack = found.get(e.id);
    return ack ? { ...e, ackedAt: ack.ackedAt, ...(ack.ackedBy ? { ackedBy: ack.ackedBy } : {}) } : e;
  });
}
