// What to email about a plant at one look of the notifier (services/ingest, notify.ts): the rules of
// NOTIFY_RULES applied to its active alarms and to what was emailed before (notifyState/{project}).
// Pure, so the rules can be tested without Firestore; no "@/" imports (services/ingest loads it).

import type { AlarmSeverity, HvacAlarm } from "../hvac/model";
import { NOTIFY_RULES, notifyDelay, severityPasses, type NotifyConfig } from "./config";
import type { ClearedAlarm } from "./email";

/** An alarm an email went out for, kept until it clears (notifyState/{project}.open.{alarm id}). */
export interface OpenEntry {
  deviceId: string;
  code: string;
  severity: AlarmSeverity;
  start: number;
  label?: { en: string; th: string };
  /** When its email was queued. */
  notifiedAt: number;
  /** Whether the reminder for an unacknowledged critical alarm went out. */
  reminded?: boolean;
}

export interface Decision {
  opened: HvacAlarm[];
  reminders: HvacAlarm[];
  cleared: ClearedAlarm[];
  /** What notifyState holds after the emails of this decision. */
  next: Record<string, OpenEntry>;
  /** Whether anything is to be emailed or notifyState changes. */
  changed: boolean;
}

/**
 * - New alarms are emailed once they pass the severity setting and have lasted their delay (a
 *   communication loss NOTIFY_RULES.commDelayMs), unless someone acknowledged them already.
 * - A critical alarm still unacknowledged NOTIFY_RULES.remindAfterMs after its email is emailed once more.
 * - An emailed alarm that is no longer active has cleared: emailed if the settings say so, then forgotten.
 */
export function decide(open: Record<string, OpenEntry>, active: HvacAlarm[], config: NotifyConfig, now: number): Decision {
  const byId = new Map(active.map((a) => [a.id, a]));
  const next: Record<string, OpenEntry> = {};
  const opened: HvacAlarm[] = [];
  const reminders: HvacAlarm[] = [];
  const cleared: ClearedAlarm[] = [];

  for (const [id, entry] of Object.entries(open)) {
    const alarm = byId.get(id);
    if (!alarm) {
      if (config.cleared) cleared.push({ id, deviceId: entry.deviceId, code: entry.code, severity: entry.severity, start: entry.start, end: now, ...(entry.label ? { label: entry.label } : {}) });
      continue;
    }
    const due = alarm.severity === "critical" && alarm.ackedAt === undefined && !entry.reminded && now - entry.notifiedAt >= NOTIFY_RULES.remindAfterMs;
    if (due) reminders.push(alarm);
    next[id] = due ? { ...entry, reminded: true } : entry;
  }

  for (const a of active) {
    if (open[a.id] || a.ackedAt !== undefined || !severityPasses(config, a.severity) || now - a.start < notifyDelay(a)) continue;
    opened.push(a);
    next[a.id] = { deviceId: a.deviceId, code: a.code, severity: a.severity, start: a.start, ...(a.label ? { label: a.label } : {}), notifiedAt: now };
  }

  const dropped = Object.keys(open).length + opened.length !== Object.keys(next).length;
  return { opened, reminders, cleared, next, changed: opened.length + reminders.length + cleared.length > 0 || dropped };
}

/** OpenEntry records read back from Firestore, leaving out anything malformed. */
export function readOpen(data: unknown): Record<string, OpenEntry> {
  const out: Record<string, OpenEntry> = {};
  if (typeof data !== "object" || data === null) return out;
  for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
    const e = raw as Partial<OpenEntry> | null;
    if (!e || typeof e.deviceId !== "string" || typeof e.code !== "string" || typeof e.start !== "number" || typeof e.notifiedAt !== "number") continue;
    out[id] = {
      deviceId: e.deviceId,
      code: e.code,
      severity: e.severity === "critical" ? "critical" : "warning",
      start: e.start,
      ...(e.label && typeof e.label.en === "string" && typeof e.label.th === "string" ? { label: { en: e.label.en, th: e.label.th } } : {}),
      notifiedAt: e.notifiedAt,
      ...(e.reminded ? { reminded: true } : {}),
    };
  }
  return out;
}
