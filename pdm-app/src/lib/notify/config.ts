// Alarm email settings of a plant and the rules the notifier follows (services/ingest, notify.ts).
// Stored in Firestore notifyConfig/{project}, which only server code reads and writes (no browser access:
// the recipients are personal data); operators edit them on the admin page (Plants tab, Notifications).
// No "@/" imports: services/ingest loads this file directly.

import type { AlarmSeverity, HvacAlarm } from "../hvac/model";

export const NOTIFY_CONFIG = "notifyConfig";
/** notifyState/{project}: the alarms an email went out for, so nothing is sent twice (notify.ts). */
export const NOTIFY_STATE = "notifyState";

export type NotifyLocale = "th" | "en";

export interface NotifyConfig {
  enabled: boolean;
  /** Email addresses, lower case, each once. */
  recipients: string[];
  /** "critical": only critical alarms; "warning": every alarm. */
  minSeverity: AlarmSeverity;
  /** Also email when a notified alarm clears. */
  cleared: boolean;
  /** Language of the emails. */
  locale: NotifyLocale;
}

export const NOTIFY_DEFAULTS: NotifyConfig = { enabled: false, recipients: [], minSeverity: "warning", cleared: true, locale: "th" };
export const RECIPIENTS_MAX = 20;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const EMAIL_MAX = 254;

/** The rules that keep the number of emails down. */
export const NOTIFY_RULES = {
  /** How often the notifier looks at the alarms; alarms that start within one look go out in one email. */
  tickMs: 60_000,
  /** A communication loss must last this long before it is emailed (a device that misses a poll or two is not). */
  commDelayMs: 5 * 60_000,
  /** A critical alarm nobody acknowledged is emailed once more after this long. */
  remindAfterMs: 30 * 60_000,
};

/** How long an alarm must have lasted before it is emailed. */
export const notifyDelay = (a: HvacAlarm) => (a.code === "commLoss" ? NOTIFY_RULES.commDelayMs : 0);

/** Addresses typed in a list (one per line, or separated by commas or semicolons), cleaned; the invalid ones apart. */
export function parseRecipients(input: string | string[]): { recipients: string[]; invalid: string[] } {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,;]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const recipients: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!EMAIL.test(p) || p.length > EMAIL_MAX) invalid.push(p);
    else if (!recipients.includes(p)) recipients.push(p);
  }
  return { recipients, invalid };
}

/** Settings read from a stored document, with defaults for what is missing or malformed. */
export function readNotifyConfig(data: Record<string, unknown> | undefined): NotifyConfig {
  if (!data) return { ...NOTIFY_DEFAULTS };
  const { recipients } = parseRecipients(Array.isArray(data.recipients) ? data.recipients.filter((x): x is string => typeof x === "string") : []);
  return {
    enabled: data.enabled === true,
    recipients: recipients.slice(0, RECIPIENTS_MAX),
    minSeverity: data.minSeverity === "critical" ? "critical" : "warning",
    cleared: data.cleared !== false,
    locale: data.locale === "en" ? "en" : "th",
  };
}

export type NotifyProblem = "bad-email" | "too-many" | "none-to-send";

/** What is wrong with settings about to be saved (an enabled plant needs at least one recipient). */
export function notifyProblems(c: NotifyConfig, invalid: string[] = []): NotifyProblem[] {
  const problems: NotifyProblem[] = [];
  if (invalid.length) problems.push("bad-email");
  if (c.recipients.length > RECIPIENTS_MAX) problems.push("too-many");
  if (c.enabled && c.recipients.length === 0) problems.push("none-to-send");
  return problems;
}

/** A plant's alarm email settings as the admin page loads them (GET /api/hvac/admin?notify=<project>). */
export interface NotifyView {
  project: string;
  config: NotifyConfig;
  /** When and by whom they were last saved; null until then (the defaults apply). */
  updatedAt: number | null;
  updatedBy: string | null;
}

/** Whether an alarm of this severity is emailed under these settings. */
export const severityPasses = (c: NotifyConfig, severity: AlarmSeverity) => c.minSeverity === "warning" || severity === "critical";
