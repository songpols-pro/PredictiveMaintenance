"use client";

// Building blocks shared by the chiller plant screens.

import { CircleOff, OctagonAlert, PauseCircle, Power, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/pdm/page-header";
import { Chip } from "@/components/pdm/status";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";
import { layoutName } from "@/lib/hvac/layout";
import type { AlarmSeverity, RunState } from "@/lib/hvac/model";

/** Name of a device on screen: the project's registry (or the simulation's catalog), else its id. */
export function deviceLabel(id: string, m: Messages): string {
  return m.hvac.deviceNames[id] ?? layoutName(id) ?? id;
}

// Same tinted status tones as the rest of PdM Monitor (see components/pdm/status.tsx).
const STATE: Record<RunState, { icon: LucideIcon; className: string }> = {
  on: { icon: Power, className: "border-healthy-border bg-healthy-bg text-healthy-fg [&_svg]:text-healthy" },
  off: { icon: CircleOff, className: "border-offline-border bg-offline-bg text-offline-fg [&_svg]:text-offline" },
  standby: { icon: PauseCircle, className: "border-info-border bg-info-bg text-info-fg [&_svg]:text-info" },
  fault: { icon: OctagonAlert, className: "border-critical-border bg-critical-bg text-critical-fg [&_svg]:text-critical" },
  offline: { icon: WifiOff, className: "border-dashed border-offline-border bg-offline-bg text-offline-fg [&_svg]:text-offline" },
};

/** Run state as icon + short word (like the mock-up's ON / OFF lamps) + a full word for screen readers. */
export function StateBadge({ state, size = "md", className }: { state: RunState; size?: "sm" | "md" | "lg"; className?: string }) {
  const { m } = useI18n();
  const s = STATE[state];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold tracking-wide whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-[0.6875rem]" : size === "lg" ? "h-8 px-3 text-sm" : "h-6 px-2 text-xs",
        s.className,
        className,
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={2.5} />
      <span aria-hidden>{m.hvac.states[state]}</span>
      <span className="sr-only">{m.hvac.statesLong[state]}</span>
    </span>
  );
}

export function SeverityBadge({ severity, size = "md" }: { severity: AlarmSeverity; size?: "sm" | "md" }) {
  const { m } = useI18n();
  return (
    <Chip
      tone={severity}
      icon={severity === "critical" ? OctagonAlert : TriangleAlert}
      label={m.hvac.alarms.severity[severity]}
      size={size}
    />
  );
}

/** Page heading, same as the other PdM Monitor screens (#page-title is the dialogs' focus fallback). */
export function PageTitle({ children, description, actions }: { children: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return <PageHeader title={children} description={description} actions={actions} className="mb-5" />;
}

/** Label / value list. Values are tabular so live updates do not make the layout jitter. */
export function ValueList({ rows, className, dense }: { rows: { label: string; value: React.ReactNode; tone?: "warning" | "critical" }[]; className?: string; dense?: boolean }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3", dense ? "gap-y-0.5 text-xs" : "gap-y-1.5 text-sm", className)}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          {/* Dense (equipment cards): one line, as a short label broken mid-word reads badly in Thai. */}
          <dt className={cn("min-w-0 text-muted-foreground", dense && "truncate")} title={dense ? r.label : undefined}>
            {r.label}
          </dt>
          <dd
            className={cn(
              "text-right font-semibold tabular whitespace-nowrap",
              r.tone === "critical" ? "text-critical-fg" : r.tone === "warning" ? "text-warning-fg" : "text-foreground",
            )}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Formats a reading with its unit; "—" when there is no value. */
export function useReading() {
  const { f } = useI18n();
  return (v: number | null | undefined, digits: number, unit = "") => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${f.number(v, digits)}${unit ? ` ${unit}` : ""}`);
}
