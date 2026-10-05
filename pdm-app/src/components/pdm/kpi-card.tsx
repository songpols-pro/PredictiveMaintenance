"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

export interface KpiDelta {
  /** formatted change, e.g. "+7%" or "−2.4 h" */
  text: string;
  direction: "up" | "down" | "flat";
  /** whether the change is good for the business */
  sentiment: "good" | "bad" | "neutral";
  comparison: string; // e.g. "vs prev. 30 d"
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  children,
  href,
  hrefLabel,
  emphasis,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: KpiDelta;
  children?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  emphasis?: "critical" | "warning";
  className?: string;
}) {
  const { m } = useI18n();
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-4",
        emphasis === "critical" && "border-l-4 border-l-critical",
        emphasis === "warning" && "border-l-4 border-l-warning",
        className,
      )}
    >
      <h3 className="text-xs font-medium text-text-secondary">{label}</h3>
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </p>
      {delta ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-1 text-xs",
            delta.sentiment === "good" && "text-healthy-fg",
            delta.sentiment === "bad" && "text-critical-fg",
            delta.sentiment === "neutral" && "text-muted-foreground",
          )}
        >
          <DeltaIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="font-medium whitespace-nowrap tabular">{delta.text}</span>
          <span className="text-muted-foreground">
            {delta.comparison}
            <span className="sr-only">
              {delta.sentiment === "good" ? m.kpi.improvement : delta.sentiment === "bad" ? m.kpi.worse : ""}
            </span>
          </span>
        </p>
      ) : null}
      {children}
      {href ? (
        <Link href={href} className="mt-auto pt-1 text-xs font-medium text-link underline underline-offset-2 hover:decoration-2">
          {hrefLabel ?? m.kpi.viewDetails}
        </Link>
      ) : null}
    </section>
  );
}
