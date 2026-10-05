// Locale-aware formatting. Thai uses the Buddhist calendar (พ.ศ.) and Arabic digits.

import { differenceInCalendarDays } from "date-fns";
import type { Locale } from "./config";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type DateInput = string | number | Date;

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

const UNITS = {
  en: { min: "min", h: "h", d: "d", justNow: "just now", soon: "in under a minute", ago: (v: string) => `${v} ago`, in: (v: string) => `in ${v}` },
  th: { min: "นาที", h: "ชม.", d: "วัน", justNow: "เมื่อสักครู่", soon: "ในอีกไม่ถึงนาที", ago: (v: string) => `${v}ที่แล้ว`, in: (v: string) => `อีก ${v}` },
};

const DUE = {
  en: { overdueToday: "Overdue today", overdue: (d: number) => `Overdue ${d} d`, today: "Due today", tomorrow: "Due tomorrow", inDays: (d: number) => `Due in ${d} d` },
  th: { overdueToday: "เลยกำหนดวันนี้", overdue: (d: number) => `เลยกำหนด ${d} วัน`, today: "ครบกำหนดวันนี้", tomorrow: "ครบกำหนดพรุ่งนี้", inDays: (d: number) => `ครบกำหนดในอีก ${d} วัน` },
};

function build(locale: Locale) {
  const tag = locale === "th" ? "th-TH" : "en-US";
  const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { hour12: false, ...opts });
  const fmt = {
    dateTime: dtf({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    date: dtf({ year: "numeric", month: "short", day: "numeric" }),
    shortDate: dtf({ month: "short", day: "numeric" }),
    time: dtf({ hour: "2-digit", minute: "2-digit" }),
    weekdayDateTime: dtf({ weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    weekdayDay: dtf({ weekday: "short", day: "numeric" }),
  };
  const u = UNITS[locale];
  const due = DUE[locale];
  const unitValue = (n: number, unit: string) => `${n} ${unit}`;

  return {
    locale,
    tag,
    /** "Oct 5, 09:42" / "5 ต.ค. 09:42" */
    dateTime: (d: DateInput) => fmt.dateTime.format(toDate(d)),
    /** "Oct 5, 2026" / "5 ต.ค. 2569" */
    date: (d: DateInput) => fmt.date.format(toDate(d)),
    /** "Oct 5" / "5 ต.ค." */
    shortDate: (d: DateInput) => fmt.shortDate.format(toDate(d)),
    /** "09:42" */
    time: (d: DateInput) => fmt.time.format(toDate(d)),
    /** "Mon, Oct 5, 09:42" / "จ. 5 ต.ค. 09:42" */
    weekdayDateTime: (d: DateInput) => fmt.weekdayDateTime.format(toDate(d)),
    /** "Mon 5" / "จ. 5" */
    weekdayDay: (d: DateInput) => fmt.weekdayDay.format(toDate(d)),

    /** "4 min ago" / "4 นาทีที่แล้ว", "in 5 h" / "อีก 5 ชม." */
    relative(d: DateInput, now = Date.now()) {
      const diff = now - toDate(d).getTime();
      const abs = Math.abs(diff);
      if (abs < MIN) return diff >= 0 ? u.justNow : u.soon;
      const value =
        abs < HOUR ? unitValue(Math.round(abs / MIN), u.min) : abs < DAY ? unitValue(Math.round(abs / HOUR), u.h) : unitValue(Math.round(abs / DAY), u.d);
      return diff >= 0 ? u.ago(value) : u.in(value);
    },
    /** Duration without "ago": "6 h" / "6 ชม." */
    duration(ms: number) {
      if (ms < HOUR) return unitValue(Math.max(1, Math.round(ms / MIN)), u.min);
      if (ms < DAY) return unitValue(Math.round(ms / HOUR), u.h);
      return unitValue(Math.round(ms / DAY), u.d);
    },
    /** RUL point value: "6 d" / "6 วัน", "> 180 d" when very long */
    days: (n: number) => (n > 180 ? `> 180 ${u.d}` : unitValue(n, u.d)),
    /** "4–9 d" / "4–9 วัน" */
    rulRange: (low: number, high: number) => (low > 180 ? `> 180 ${u.d}` : `${low}–${high > 365 ? "365+" : high} ${u.d}`),
    hours: (n: number, digits = 1) => `${n.toFixed(digits)} ${u.h}`,
    dayUnit: u.d,
    hourUnit: u.h,
    number: (n: number, digits = 0) => n.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    percent: (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`,

    /** Due-date chip text, using calendar days. */
    due(iso: string, now = Date.now()) {
      const date = new Date(iso);
      const days = differenceInCalendarDays(date, now);
      if (date.getTime() < now) return { text: days === 0 ? due.overdueToday : due.overdue(Math.abs(days)), overdue: true, soon: false };
      if (days === 0) return { text: due.today, overdue: false, soon: true };
      return { text: days === 1 ? due.tomorrow : due.inDays(days), overdue: false, soon: days <= 2 };
    },
  };
}

export type Formatters = ReturnType<typeof build>;

const cache = new Map<Locale, Formatters>();

export function getFormatters(locale: Locale): Formatters {
  let f = cache.get(locale);
  if (!f) {
    f = build(locale);
    cache.set(locale, f);
  }
  return f;
}
