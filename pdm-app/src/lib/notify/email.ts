// Content of the alarm emails (subject, plain text and HTML) in Thai or English. Used by the notifier in
// services/ingest and by the admin page's test email (/api/hvac/admin). Pure functions; no "@/" imports.

import type { AlarmSeverity, HvacAlarm } from "../hvac/model";
import { NOTIFY_RULES, type NotifyConfig, type NotifyLocale } from "./config";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** An alarm an email went out for, that has cleared since (when the notifier noticed). */
export type ClearedAlarm = HvacAlarm & { end: number };

export interface AlarmEmailInput {
  /** Plant name as customers see it (the project id when it has none). */
  plant: string;
  opened: HvacAlarm[];
  /** Critical alarms still unacknowledged NOTIFY_RULES.remindAfterMs after their email. */
  reminders: HvacAlarm[];
  cleared: ClearedAlarm[];
  deviceName: (id: string) => string;
  /** Address of the web app ("" leaves the link out). */
  siteUrl: string;
  locale: NotifyLocale;
  now: number;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

const TEXT = {
  th: {
    subjectOpened: (plant: string, n: number, critical: number) => `[แจ้งเตือน] ${plant}: alarm ใหม่ ${n} รายการ${critical ? ` (วิกฤต ${critical})` : ""}`,
    subjectReminder: (plant: string, n: number) => `[แจ้งเตือนซ้ำ] ${plant}: alarm วิกฤตยังไม่มีผู้รับทราบ ${n} รายการ`,
    subjectCleared: (plant: string, n: number) => `[หายแล้ว] ${plant}: alarm หาย ${n} รายการ`,
    subjectTest: (plant: string) => `[ทดสอบ] ${plant}: อีเมลแจ้งเตือน alarm`,
    intro: (plant: string) => `แจ้งเตือนจากระบบ BMS ห้อง Chiller ของ ${plant}`,
    opened: "Alarm ใหม่",
    reminders: (min: number) => `Alarm วิกฤตที่ยังไม่มีผู้รับทราบ (แจ้งไปแล้วเกิน ${min} นาที)`,
    cleared: "Alarm ที่หายแล้ว",
    cols: { severity: "ระดับ", device: "อุปกรณ์", name: "Alarm", since: "เกิดเมื่อ", cleared: "หายเมื่อ" },
    severity: { critical: "วิกฤต", warning: "เฝ้าระวัง" } as Record<AlarmSeverity, string>,
    lasted: (d: string) => `นาน ${d}`,
    open: "เปิดหน้า Alarm",
    footer: (min: number) =>
      `อีเมลนี้ส่งอัตโนมัติ alarm ที่เกิดใกล้กันจะรวมเป็นอีเมลเดียว และ alarm การสื่อสารจะแจ้งเมื่อขาดการติดต่อนานเกิน ${min} นาที ถ้าไม่ต้องการรับอีเมลนี้ กรุณาติดต่อผู้ดูแลระบบ`,
    testIntro: (plant: string) => `นี่คืออีเมลทดสอบการแจ้งเตือน alarm ของ ${plant} ถ้าได้รับอีเมลนี้ แปลว่าส่งอีเมลถึงคุณได้แล้ว`,
    testSettings: (c: NotifyConfig) =>
      [
        c.enabled ? "สถานะ: เปิดการแจ้งเตือนอยู่" : "สถานะ: ยังไม่ได้เปิดการแจ้งเตือน (จะส่งเมื่อผู้ดูแลเปิดใช้)",
        c.minSeverity === "critical" ? "แจ้งเฉพาะ alarm ระดับวิกฤต" : "แจ้งทุกระดับ (วิกฤตและเฝ้าระวัง)",
        c.cleared ? "แจ้งเมื่อ alarm หายด้วย" : "ไม่แจ้งเมื่อ alarm หาย",
      ].join("\n"),
    names: {
      chwSupplyHigh: "อุณหภูมิน้ำเย็นจ่ายสูง",
      humidityHigh: "ความชื้นสูง",
      roomTempHigh: "อุณหภูมิห้องสูง",
      kwPerTonHigh: "ประสิทธิภาพต่ำ (kW/Ton สูง)",
      compressorFault: "คอมเพรสเซอร์ขัดข้อง",
      pumpTrip: "ปั๊มทริป",
      commLoss: "ขาดการสื่อสารกับตัวควบคุม",
      filterDirty: "แผ่นกรองอากาศสกปรก",
    } as Record<string, string>,
    duration: (ms: number) => {
      const m = minutes(ms);
      if (m < 60) return `${m} นาที`;
      if (m < 24 * 60) return `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
      return `${Math.floor(m / 1440)} วัน ${Math.floor((m % 1440) / 60)} ชม.`;
    },
  },
  en: {
    subjectOpened: (plant: string, n: number, critical: number) => `[Alarm] ${plant}: ${n} new ${n === 1 ? "alarm" : "alarms"}${critical ? ` (${critical} critical)` : ""}`,
    subjectReminder: (plant: string, n: number) => `[Reminder] ${plant}: ${n} critical ${n === 1 ? "alarm" : "alarms"} not acknowledged`,
    subjectCleared: (plant: string, n: number) => `[Cleared] ${plant}: ${n} ${n === 1 ? "alarm" : "alarms"} cleared`,
    subjectTest: (plant: string) => `[Test] ${plant}: alarm emails`,
    intro: (plant: string) => `Chiller Plant BMS alarms of ${plant}`,
    opened: "New alarms",
    reminders: (min: number) => `Critical alarms nobody has acknowledged (emailed more than ${min} minutes ago)`,
    cleared: "Cleared alarms",
    cols: { severity: "Severity", device: "Device", name: "Alarm", since: "Since", cleared: "Cleared" },
    severity: { critical: "Critical", warning: "Warning" } as Record<AlarmSeverity, string>,
    lasted: (d: string) => `lasted ${d}`,
    open: "Open Alarm Active",
    footer: (min: number) =>
      `This email is sent automatically. Alarms that start close together come in one email, and a communication loss is emailed once it has lasted ${min} minutes. To stop these emails, contact your administrator.`,
    testIntro: (plant: string) => `This is a test of the alarm emails of ${plant}. If you got it, emails reach you.`,
    testSettings: (c: NotifyConfig) =>
      [
        c.enabled ? "Status: alarm emails are on" : "Status: alarm emails are not on yet (they start when an administrator turns them on)",
        c.minSeverity === "critical" ? "Critical alarms only" : "Every alarm (critical and warning)",
        c.cleared ? "Also when an alarm clears" : "Not when an alarm clears",
      ].join("\n"),
    names: {
      chwSupplyHigh: "High chilled-water supply temp",
      humidityHigh: "High humidity",
      roomTempHigh: "High room temperature",
      kwPerTonHigh: "Low efficiency (high kW/Ton)",
      compressorFault: "Compressor fault",
      pumpTrip: "Pump trip",
      commLoss: "Controller communication lost",
      filterDirty: "Dirty air filter",
    } as Record<string, string>,
    duration: (ms: number) => {
      const m = minutes(ms);
      if (m < 60) return `${m} min`;
      if (m < 24 * 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
      return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
    },
  },
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function dateTime(t: number, locale: NotifyLocale) {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(t);
}

/** The alarm's name: its own (fault bits of a register profile) or the built-in one. */
export function alarmName(a: HvacAlarm, locale: NotifyLocale): string {
  return a.label?.[locale] ?? TEXT[locale].names[a.code] ?? a.code;
}

interface Section {
  title: string;
  rows: { severity: AlarmSeverity; device: string; name: string; when: string }[];
  /** Header of the "when" column. */
  whenCol: string;
}

function render(t: (typeof TEXT)[NotifyLocale], intro: string, sections: Section[], link: string | null, footer: string): { text: string; html: string } {
  const text = [
    intro,
    "",
    ...sections.flatMap((s) => [s.title, ...s.rows.map((r) => `- [${t.severity[r.severity]}] ${r.device}: ${r.name} (${s.whenCol} ${r.when})`), ""]),
    ...(link ? [`${t.open}: ${link}`, ""] : []),
    footer,
  ].join("\n");
  const badge = (sev: AlarmSeverity) =>
    `<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-weight:600;${sev === "critical" ? "background:#fdecec;color:#a4161a;border:1px solid #f3b4b4" : "background:#fff4e0;color:#8a4b00;border:1px solid #f1cf94"}">${escape(t.severity[sev])}</span>`;
  const cell = "padding:6px 8px;border-bottom:1px solid #e3e7ee;text-align:left;vertical-align:top";
  const html = [
    `<div style="font-family:'Noto Sans Thai',Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1b2430;max-width:720px">`,
    `<p style="margin:0 0 12px;font-weight:600">${escape(intro)}</p>`,
    ...sections.map(
      (s) =>
        `<h2 style="font-size:15px;margin:16px 0 6px">${escape(s.title)}</h2>` +
        `<table role="presentation" style="border-collapse:collapse;width:100%"><thead><tr>` +
        [t.cols.severity, t.cols.device, t.cols.name, s.whenCol].map((h) => `<th style="${cell};font-size:12px;color:#586474">${escape(h)}</th>`).join("") +
        `</tr></thead><tbody>` +
        s.rows.map((r) => `<tr><td style="${cell}">${badge(r.severity)}</td><td style="${cell};font-weight:600">${escape(r.device)}</td><td style="${cell}">${escape(r.name)}</td><td style="${cell};white-space:nowrap">${escape(r.when)}</td></tr>`).join("") +
        `</tbody></table>`,
    ),
    link ? `<p style="margin:16px 0"><a href="${escape(link)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#1d5bd8;color:#ffffff;text-decoration:none;font-weight:600">${escape(t.open)}</a></p>` : "",
    `<p style="margin:16px 0 0;font-size:12px;color:#586474">${escape(footer)}</p>`,
    `</div>`,
  ].join("");
  return { text, html };
}

const alarmsLink = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/+$/, "")}/hvac/alarms` : null);

/** One email for what happened at a plant since the last look: new alarms, reminders and cleared ones. */
export function alarmEmail(input: AlarmEmailInput): EmailContent {
  const t = TEXT[input.locale];
  const row = (a: HvacAlarm, when: string) => ({ severity: a.severity, device: input.deviceName(a.deviceId), name: alarmName(a, input.locale), when });
  const since = (a: HvacAlarm) => `${dateTime(a.start, input.locale)} (${t.lasted(t.duration(Math.max(0, input.now - a.start)))})`;
  const sections: Section[] = [];
  if (input.opened.length) sections.push({ title: t.opened, whenCol: t.cols.since, rows: input.opened.map((a) => row(a, since(a))) });
  if (input.reminders.length) sections.push({ title: t.reminders(minutes(NOTIFY_RULES.remindAfterMs)), whenCol: t.cols.since, rows: input.reminders.map((a) => row(a, since(a))) });
  if (input.cleared.length) {
    sections.push({
      title: t.cleared,
      whenCol: t.cols.cleared,
      rows: input.cleared.map((a) => row(a, `${dateTime(a.end, input.locale)} (${t.lasted(t.duration(Math.max(0, a.end - a.start)))})`)),
    });
  }
  const critical = input.opened.filter((a) => a.severity === "critical").length;
  const subject = input.opened.length
    ? t.subjectOpened(input.plant, input.opened.length, critical)
    : input.reminders.length
      ? t.subjectReminder(input.plant, input.reminders.length)
      : t.subjectCleared(input.plant, input.cleared.length);
  return { subject, ...render(t, t.intro(input.plant), sections, alarmsLink(input.siteUrl), t.footer(minutes(NOTIFY_RULES.commDelayMs))) };
}

/** The admin page's test email: proves that emails reach the recipients, and says what the settings send. */
export function testEmail(plant: string, config: NotifyConfig, siteUrl: string): EmailContent {
  const t = TEXT[config.locale];
  const intro = t.testIntro(plant);
  const settings = t.testSettings(config);
  const link = alarmsLink(siteUrl);
  const footer = t.footer(minutes(NOTIFY_RULES.commDelayMs));
  return {
    subject: t.subjectTest(plant),
    text: [intro, "", settings, "", ...(link ? [`${t.open}: ${link}`, ""] : []), footer].join("\n"),
    html: [
      `<div style="font-family:'Noto Sans Thai',Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1b2430;max-width:720px">`,
      `<p style="margin:0 0 12px;font-weight:600">${escape(intro)}</p>`,
      `<ul style="margin:0 0 12px;padding-left:20px">${settings
        .split("\n")
        .map((l) => `<li>${escape(l)}</li>`)
        .join("")}</ul>`,
      link ? `<p style="margin:16px 0"><a href="${escape(link)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#1d5bd8;color:#ffffff;text-decoration:none;font-weight:600">${escape(t.open)}</a></p>` : "",
      `<p style="margin:16px 0 0;font-size:12px;color:#586474">${escape(footer)}</p>`,
      `</div>`,
    ].join(""),
  };
}

/** A queued email for the "Trigger Email from Firestore" extension (collection `mail`), one recipient each. */
export function mailDocument(to: string, content: EmailContent, deleteAfter: Date, source: { kind: "alarm" | "test"; project: string }) {
  return { to: [to], message: { subject: content.subject, text: content.text, html: content.html }, deleteAfter, source };
}

/** Queued emails carry personal data (addresses), so a TTL policy on deleteAfter removes them (DEPLOY.md). */
export const KEEP_MAIL_MS = 30 * 86_400_000;
