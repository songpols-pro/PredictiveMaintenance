import { differenceInCalendarDays, format } from "date-fns";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time: "just now", "4 min ago", "3 h ago", "2 d ago", "in 5 h". */
export function formatRelative(iso: string | number, now = Date.now()): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const diff = now - t;
  const abs = Math.abs(diff);
  let value: string;
  if (abs < MIN) return diff >= 0 ? "just now" : "in under a minute";
  if (abs < HOUR) value = `${Math.round(abs / MIN)} min`;
  else if (abs < DAY) value = `${Math.round(abs / HOUR)} h`;
  else value = `${Math.round(abs / DAY)} d`;
  return diff >= 0 ? `${value} ago` : `in ${value}`;
}

export function formatDateTime(iso: string | number): string {
  return format(new Date(iso), "MMM d, HH:mm");
}

export function formatDate(iso: string | number): string {
  return format(new Date(iso), "MMM d, yyyy");
}

export function formatShortDate(iso: string | number): string {
  return format(new Date(iso), "MMM d");
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDays(days: number): string {
  if (days > 180) return "> 180 d";
  return `${days} d`;
}

export function formatRulRange(low: number, high: number): string {
  if (low > 180) return "> 180 d";
  return `${low}–${high > 365 ? "365+" : high} d`;
}

/** Days until a due date; negative when overdue. */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / DAY);
}

export function dueLabel(iso: string, now = Date.now()): { text: string; overdue: boolean; soon: boolean } {
  const due = new Date(iso);
  const days = differenceInCalendarDays(due, now);
  if (due.getTime() < now) {
    return { text: days === 0 ? "Overdue today" : `Overdue ${Math.abs(days)} d`, overdue: true, soon: false };
  }
  if (days === 0) return { text: "Due today", overdue: false, soon: true };
  return { text: days === 1 ? "Due tomorrow" : `Due in ${days} d`, overdue: false, soon: days <= 2 };
}
