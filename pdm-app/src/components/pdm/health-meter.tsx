import { cn } from "@/lib/utils";
import type { AssetStatus } from "@/lib/types";

const FILL: Record<AssetStatus, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  healthy: "bg-healthy",
  offline: "bg-offline",
};

/** Health score as number + bar. The number carries the value; the bar is a visual aid. */
export function HealthMeter({
  score,
  status,
  delta,
  className,
  showDelta = false,
}: {
  score: number;
  status: AssetStatus;
  delta?: number;
  className?: string;
  showDelta?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-7 text-right font-semibold tabular">{score}</span>
      <span aria-hidden className="relative h-1.5 w-16 overflow-hidden rounded-full bg-accent">
        <span className={cn("health-bar-fill absolute inset-y-0 left-0 rounded-full", FILL[status])} style={{ width: `${score}%` }} />
      </span>
      {showDelta && delta !== undefined && delta !== 0 ? (
        <span className={cn("text-xs tabular", delta < 0 ? "text-critical-fg" : "text-healthy-fg")}>
          <span aria-hidden>{delta < 0 ? "▼" : "▲"}</span>
          <span className="sr-only">{delta < 0 ? "down" : "up"}</span>
          {Math.abs(delta)}
          <span className="sr-only"> points in 7 days</span>
        </span>
      ) : null}
    </div>
  );
}
