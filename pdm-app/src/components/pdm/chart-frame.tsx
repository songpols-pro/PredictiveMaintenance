"use client";

import { useId, useState } from "react";
import { Table2, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Chart container: a <figure> with a heading, a plain-language summary (figcaption),
 * and a "View as table" toggle that swaps the chart for an accessible data table.
 */
export function ChartFrame({
  title,
  headingLevel = 3,
  subtitle,
  summary,
  actions,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  headingLevel?: 2 | 3;
  subtitle?: React.ReactNode;
  summary: React.ReactNode;
  actions?: React.ReactNode;
  legend?: React.ReactNode;
  table?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { m } = useI18n();
  const [showTable, setShowTable] = useState(false);
  const captionId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <figure aria-labelledby={`${captionId}-title`} className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Heading id={`${captionId}-title`} className="font-semibold">
            {title}
          </Heading>
          {subtitle ? <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {table ? (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? <LineChart aria-hidden /> : <Table2 aria-hidden />}
              {showTable ? m.chart.viewChart : m.chart.viewTable}
            </Button>
          ) : null}
        </div>
      </div>
      {legend}
      {showTable && table ? (
        <div tabIndex={0} role="region" aria-label={m.chart.dataTable(title)} className="relative max-h-72 overflow-auto rounded-md border">
          {table}
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}
      <figcaption className="text-xs text-text-secondary">{summary}</figcaption>
    </figure>
  );
}

export function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
      <span aria-hidden className="inline-flex items-center">
        {swatch}
      </span>
      {label}
    </li>
  );
}

export function Legend({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  return (
    <ul aria-label={m.chart.legend} className="flex flex-wrap gap-x-4 gap-y-1">
      {children}
    </ul>
  );
}
