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

export const ASSET_STATUS: Record<AssetStatus, { label: string; icon: LucideIcon; tone: Tone }> = {
  critical: { label: "Critical", icon: OctagonAlert, tone: "critical" },
  warning: { label: "Warning", icon: TriangleAlert, tone: "warning" },
  healthy: { label: "Healthy", icon: CircleCheck, tone: "healthy" },
  offline: { label: "Offline", icon: WifiOff, tone: "offline" },
};

export function StatusChip({ status, size, className }: { status: AssetStatus; size?: "sm" | "md"; className?: string }) {
  const s = ASSET_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={s.label} size={size} className={className} srPrefix="Status:" />;
}

export const SEVERITY: Record<Severity, { label: string; icon: LucideIcon; tone: Tone }> = {
  critical: { label: "Critical", icon: OctagonAlert, tone: "critical" },
  warning: { label: "Warning", icon: TriangleAlert, tone: "warning" },
  info: { label: "Info", icon: Info, tone: "info" },
};

export function SeverityChip({ severity, size, className }: { severity: Severity; size?: "sm" | "md"; className?: string }) {
  const s = SEVERITY[severity];
  return <Chip tone={s.tone} icon={s.icon} label={s.label} size={size} className={className} srPrefix="Severity:" />;
}

export const ALERT_STATUS: Record<AlertStatus, { label: string; icon: LucideIcon; tone: Tone }> = {
  open: { label: "Open", icon: CircleDot, tone: "neutral" },
  acknowledged: { label: "Acknowledged", icon: CircleCheck, tone: "neutral" },
  snoozed: { label: "Snoozed", icon: PauseCircle, tone: "neutral" },
  resolved: { label: "Resolved", icon: CircleCheck, tone: "healthy" },
};

export function AlertStatusChip({ status, size = "sm" }: { status: AlertStatus; size?: "sm" | "md" }) {
  const s = ALERT_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={s.label} size={size} srPrefix="Alert status:" />;
}

export const WO_STATUS: Record<WorkOrderStatus, { label: string; icon: LucideIcon; tone: Tone }> = {
  open: { label: "Open", icon: CircleDashed, tone: "neutral" },
  in_progress: { label: "In progress", icon: Loader, tone: "info" },
  done: { label: "Done", icon: CircleCheck, tone: "healthy" },
};

export function WorkOrderStatusChip({ status, size = "sm" }: { status: WorkOrderStatus; size?: "sm" | "md" }) {
  const s = WO_STATUS[status];
  return <Chip tone={s.tone} icon={s.icon} label={s.label} size={size} srPrefix="Work order status:" />;
}

const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  P1: { label: "P1 Urgent", tone: "critical" },
  P2: { label: "P2 High", tone: "warning" },
  P3: { label: "P3 Normal", tone: "neutral" },
  P4: { label: "P4 Low", tone: "neutral" },
};

export function PriorityChip({ priority, size = "sm" }: { priority: Priority; size?: "sm" | "md" }) {
  const p = PRIORITY[priority];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-semibold whitespace-nowrap tabular",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        TONE_CLASS[p.tone],
      )}
    >
      <span className="sr-only">Priority: </span>
      {p.label}
    </span>
  );
}

/** Model confidence, always shown next to a prediction. Below the alerting floor it says so. */
export function ConfidenceBadge({ value, minimum = 0.6, className }: { value: number; minimum?: number; className?: string }) {
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
      {Math.round(value * 100)}% confidence{low ? " (low)" : ""}
    </span>
  );
}

export function DueChip({ text, overdue, soon }: { text: string; overdue: boolean; soon: boolean }) {
  const tone: Tone = overdue ? "critical" : soon ? "warning" : "neutral";
  const Icon = overdue ? OctagonAlert : Clock3;
  return <Chip tone={tone} icon={Icon} label={text} size="sm" />;
}
