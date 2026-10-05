"use client";

import { Clock3, Cpu, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";

const STALE_MS = 2 * 60 * 60 * 1000;

/** "Updated 3 min ago" with the absolute time available on hover and to screen readers. */
export function DataFreshness({
  at,
  label,
  staleAfterMs = STALE_MS,
  className,
}: {
  at: string;
  label?: string;
  staleAfterMs?: number;
  className?: string;
}) {
  const now = useNow();
  const { m, f } = useI18n();
  const stale = now - new Date(at).getTime() > staleAfterMs;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", stale ? "text-warning-fg" : "text-muted-foreground", className)}>
      {stale ? <TriangleAlert aria-hidden className="size-3.5 text-warning" /> : <Clock3 aria-hidden className="size-3.5" />}
      <span>
        {stale ? `${m.freshness.stale} · ` : ""}
        {label ?? m.freshness.dataUpdated}{" "}
        <time dateTime={at} title={f.dateTime(at)}>
          {f.relative(at, now)}
        </time>
      </span>
    </span>
  );
}

/** Model provenance shown next to every prediction. */
export function ModelMeta({ version, scoredAt, className }: { version: string; scoredAt: string; className?: string }) {
  const now = useNow();
  const { m, f } = useI18n();
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap", className)}>
      <Cpu aria-hidden className="size-3.5" />
      <span>
        {version} · {m.freshness.scored}{" "}
        <time dateTime={scoredAt} title={f.dateTime(scoredAt)}>
          {f.relative(scoredAt, now)}
        </time>
      </span>
    </span>
  );
}
