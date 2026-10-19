// Alarm emails. Watches the live alarms of every plant whose alarm emails are on (Firestore
// notifyConfig/{project}, set on the admin page) and queues emails in the `mail` collection, which the
// "Trigger Email from Firestore" extension sends (DEPLOY.md). On with NOTIFY_EMAIL=on.
//
//   - The alarms are computed from the plant's live documents with the screens' own function
//     (liveAlarms, pdm-app/src/lib/hvac/live-alarms.ts): an email names what a signed-in user sees.
//   - Once a minute (NOTIFY_RULES.tickMs) each plant gets at most one email per recipient: new alarms,
//     reminders and cleared alarms together. The rules are in pdm-app/src/lib/notify/decide.ts.
//   - What was emailed is kept in notifyState/{project} and changed in the same transaction that queues
//     the emails, so a restart, or a second instance (local and cloud), never sends anything twice.

import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { liveAlarms, type AlarmDocData, type CommAckDocData, type GatewayDocData } from "../../../pdm-app/src/lib/hvac/live-alarms";
import { NOTIFY_CONFIG, NOTIFY_RULES, NOTIFY_STATE, readNotifyConfig, type NotifyConfig } from "../../../pdm-app/src/lib/notify/config";
import { decide, readOpen, type OpenEntry } from "../../../pdm-app/src/lib/notify/decide";
import { alarmEmail, KEEP_MAIL_MS, mailDocument } from "../../../pdm-app/src/lib/notify/email";
import { log } from "./log";

/** The live documents of one plant, kept current by listeners. */
interface Watch {
  registry?: DocumentData | null;
  gateways?: Map<string, GatewayDocData>;
  alarms?: (AlarmDocData & { id: string })[];
  commAcks?: Map<string, CommAckDocData>;
  failed?: string;
  stop: () => void;
}

export interface NotifyStats {
  plants: number;
  emails: number;
  lastLookAt: string | null;
  lastError: string | null;
}

export class Notifier {
  private configs = new Map<string, NotifyConfig>();
  private watches = new Map<string, Watch>();
  /** notifyState of each plant as last read or written here (undefined: not read yet). */
  private known = new Map<string, Record<string, OpenEntry>>();
  private busy = false;
  readonly stats: NotifyStats = { plants: 0, emails: 0, lastLookAt: null, lastError: null };

  constructor(
    private db: Firestore,
    /** Address of the web app for the link in the emails ("" leaves it out). */
    private siteUrl: string,
  ) {}

  /** Start watching; returns the function that stops. */
  start(): () => void {
    const stopConfigs = this.db.collection(NOTIFY_CONFIG).onSnapshot(
      (s) => {
        this.configs = new Map(s.docs.map((d) => [d.id, readNotifyConfig(d.data())]));
        this.syncWatches();
      },
      (e) => {
        this.stats.lastError = `settings: ${e.message}`;
        log.warn("alarm emails: cannot read the settings", { error: e.message });
      },
    );
    const timer = setInterval(() => void this.look(), NOTIFY_RULES.tickMs);
    timer.unref();
    return () => {
      clearInterval(timer);
      stopConfigs();
      for (const w of this.watches.values()) w.stop();
      this.watches.clear();
    };
  }

  private enabled(): string[] {
    return [...this.configs].filter(([, c]) => c.enabled && c.recipients.length > 0).map(([p]) => p);
  }

  /** Listen to the plants whose emails are on, and stop listening to the others. */
  private syncWatches() {
    const wanted = new Set(this.enabled());
    for (const [project, w] of this.watches) {
      if (wanted.has(project)) continue;
      w.stop();
      this.watches.delete(project);
      this.known.delete(project);
    }
    for (const project of wanted) if (!this.watches.has(project)) this.watches.set(project, this.watch(project));
    this.stats.plants = wanted.size;
    log.info(`alarm emails: ${wanted.size ? [...wanted].join(", ") : "no plant has them on"}`);
  }

  private watch(project: string): Watch {
    const w: Watch = { stop: () => {} };
    const fail = (what: string) => (e: Error) => {
      w.failed = `${what}: ${e.message}`;
      this.stats.lastError = `${project} ${w.failed}`;
      log.warn(`alarm emails: cannot read ${project} ${what}`, { error: e.message });
    };
    const base = this.db.doc(`projects/${project}`);
    const stops = [
      base.onSnapshot((s) => (w.registry = s.exists ? (s.data() ?? null) : null), fail("registry")),
      base.collection("gateways").onSnapshot((s) => (w.gateways = new Map(s.docs.map((d) => [d.id, d.data() as GatewayDocData]))), fail("gateways")),
      base.collection("alarms").onSnapshot((s) => (w.alarms = s.docs.map((d) => ({ id: d.id, ...(d.data() as AlarmDocData) }))), fail("alarms")),
      base.collection("commAcks").onSnapshot((s) => (w.commAcks = new Map(s.docs.map((d) => [d.id, d.data() as CommAckDocData]))), fail("acknowledgements")),
    ];
    w.stop = () => stops.forEach((stop) => stop());
    return w;
  }

  /** One look at every plant whose emails are on. */
  async look(now = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const project of this.enabled()) {
        try {
          await this.lookAt(project, now);
        } catch (e) {
          this.stats.lastError = `${project}: ${(e as Error).message}`;
          log.warn(`alarm emails: ${project} not handled, trying again next minute`, { error: (e as Error).message });
        }
      }
      this.stats.lastLookAt = new Date(now).toISOString();
    } finally {
      this.busy = false;
    }
  }

  private async lookAt(project: string, now: number) {
    const config = this.configs.get(project);
    const w = this.watches.get(project);
    // Until every listener has answered, missing alarms would look cleared: wait for the next look.
    if (!config || !w || w.failed || w.registry === undefined || !w.gateways || !w.alarms || !w.commAcks) return;
    const { alarms } = liveAlarms(w.gateways, w.alarms, w.commAcks, now);
    const known = this.known.get(project);
    if (known && !decide(known, alarms, config, now).changed) return;

    const devices = (w.registry?.devices ?? {}) as Record<string, { name?: string }>;
    const plant = typeof w.registry?.name === "string" && w.registry.name.trim() ? w.registry.name.trim() : project;
    const ref = this.db.doc(`${NOTIFY_STATE}/${project}`);
    const result = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = decide(readOpen(snap.get("open")), alarms, config, now);
      if (!d.changed) return { open: d.next, emails: 0, d };
      const emails = d.opened.length + d.reminders.length + d.cleared.length ? config.recipients.length : 0;
      if (emails) {
        const content = alarmEmail({ plant, opened: d.opened, reminders: d.reminders, cleared: d.cleared, deviceName: (id) => devices[id]?.name || id, siteUrl: this.siteUrl, locale: config.locale, now });
        const deleteAfter = new Date(now + KEEP_MAIL_MS);
        for (const to of config.recipients) tx.create(this.db.collection("mail").doc(), mailDocument(to, content, deleteAfter, { kind: "alarm", project }));
      }
      tx.set(ref, { project, open: d.next, updatedAt: FieldValue.serverTimestamp() });
      return { open: d.next, emails, d };
    });
    this.known.set(project, result.open);
    if (result.emails) {
      this.stats.emails += result.emails;
      const { opened, reminders, cleared } = result.d;
      log.info(`alarm emails: ${project} ${opened.length} new, ${reminders.length} reminders, ${cleared.length} cleared → ${result.emails} emails queued`);
    }
  }
}
