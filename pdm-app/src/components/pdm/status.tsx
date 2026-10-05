"use client";

// Status never relies on color alone: every chip pairs an icon with a text label.

import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock3,
  Info,
  Loader,
  OctagonAlert,
  PauseCircle,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { AlertStatus, AssetStatus, Priority, Severity, WorkOrderStatus } from "@/lib/types";

type Tone = "critical" | "warning" | "healthy" | "offline" | "info" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  critical: "bg-critical-bg text-critical-fg border-critical-border [&_svg]:text-critical",
  warning: "bg-warning-bg text-warning-fg border-warning-border [&_svg]:text-warning",
  healthy: "bg-healthy-bg text-healthy-fg border-healthy-border [&_svg]:text-healthy",
  offline: "bg-offline-bg text-offline-fg border-offline-border [&_svg]:text-offline",
  info: "bg-info-bg text-info-fg border-info-border [&_svg]:text-info",
  neutral: "bg-muted text-text-secondary border-border [&_svg]:text-muted-foreground",
};

export const TONE_TEXT: Record<Tone, string> = {
  critical: "text-critical-fg",
  warning: "text-warning-fg",
  healthy: "text-healthy-fg",
  offline: "text-offline-fg",
  info: "text-info-fg",
  neutral: "text-text-secondary",
};

export const TONE_SOLID: Record<Tone, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  healthy: "bg-healthy",
  offline: "bg-offline",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

interface ChipProps {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
  className?: string;
  srPrefix?: string;
}

export function Chip({ tone, icon: Icon, label, size = "md", className, srPrefix }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.25} />
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      {label}
    </span>
  );
}

export const ASSET_STATUS: Record<AssetStatus, { icon: LucideIcon; tone: Tone }> = {
  critical: { icon: OctagonAlert, tone: "critical" },
  warning: { icon: TriangleAlert, tone: "warning" },
  healthy: { icon: CircleCheck, tone: "healthy" },
  offline: { icon: WifiOff, tone: "offline" },
};

export function StatusChip({ status, size, className }: { status: AssetStatus; size?: "sm" | "md"; className?: string }) {
  const { m } = useI18n();
  const s = ASSET_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={m.status.asset[status]} size={size} className={className} srPrefix={m.status.sr.status} />;
}

export const SEVERITY: Record<Severity, { icon: LucideIcon; tone: Tone }> = {
  critical: { icon: OctagonAlert, tone: "critical" },
  warning: { icon: TriangleAlert, tone: "warning" },
  info: { icon: Info, tone: "info" },
};

export function SeverityChip({ severity, size, className }: { severity: Severity; size?: "sm" | "md"; className?: string }) {
  const { m } = useI18n();
  const s = SEVERITY[severity];
  return <Chip tone={s.tone} icon={s.icon} label={m.status.severity[severity]} size={size} className={className} srPrefix={m.status.sr.severity} />;
}

export const ALERT_STATUS: Record<AlertStatus, { icon: LucideIcon; tone: Tone }> = {
  open: { icon: CircleDot, tone: "neutral" },
  acknowledged: { icon: CircleCheck, tone: "neutral" },
  snoozed: { icon: PauseCircle, tone: "neutral" },
  resolved: { icon: CircleCheck, tone: "healthy" },
};

export function AlertStatusChip({ status, size = "sm" }: { status: AlertStatus; size?: "sm" | "md" }) {
  const { m } = useI18n();
  const s = ALERT_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={m.status.alert[status]} size={size} srPrefix={m.status.sr.alertStatus} />;
}

export const WO_STATUS: Record<WorkOrderStatus, { icon: LucideIcon; tone: Tone }> = {
  open: { icon: CircleDashed, tone: "neutral" },
  in_progress: { icon: Loader, tone: "info" },
  done: { icon: CircleCheck, tone: "healthy" },
};

export function WorkOrderStatusChip({ status, size = "sm" }: { status: WorkOrderStatus; size?: "sm" | "md" }) {
  const { m } = useI18n();
  const s = WO_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={m.status.workOrder[status]} size={size} srPrefix={m.status.sr.woStatus} />;
}

const PRIORITY_TONE: Record<Priority, Tone> = { P1: "critical", P2: "warning", P3: "neutral", P4: "neutral" };

export function PriorityChip({ priority, size = "sm" }: { priority: Priority; size?: "sm" | "md" }) {
  const { m } = useI18n();
  const p = { label: m.status.priority[priority], tone: PRIORITY_TONE[priority] };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-semibold whitespace-nowrap tabular",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        TONE_CLASS[p.tone],
      )}
    >
      <span className="sr-only">{m.status.sr.priority} </span>
      {p.label}
    </span>
  );
}

/** Model confidence, always shown next to a prediction. Below the alerting floor it says so. */
export function ConfidenceBadge({ value, minimum = 0.6, className }: { value: number; minimum?: number; className?: string }) {
  const { m } = useI18n();
  const low = value < minimum;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 h-5 text-xs font-medium whitespace-nowrap tabular",
        low ? TONE_CLASS.warning : TONE_CLASS.neutral,
        className,
      )}
    >
      {low ? <TriangleAlert aria-hidden className="size-3" /> : <CircleDot aria-hidden className="size-3" />}
      {m.status.confidence(Math.round(value * 100), low)}
    </span>
  );
}

export function DueChip({ text, overdue, soon }: { text: string; overdue: boolean; soon: boolean }) {
  const tone: Tone = overdue ? "critical" : soon ? "warning" : "neutral";
  const Icon = overdue ? OctagonAlert : Clock3;
  return <Chip tone={tone} icon={Icon} label={text} size="sm" />;
}
