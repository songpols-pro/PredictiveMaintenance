"use client";

import { BellRing } from "lucide-react";
import { StatusChip } from "@/components/pdm/status";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Hero illustration built from real UI pieces (not a screenshot), so it stays sharp and
 * follows the language and theme. Exposed to assistive tech as one image with a text summary.
 */
export function ProductPreview() {
  const { m } = useI18n();
  const pv = m.marketing.preview;
  return (
    <div role="img" aria-label={pv.label} className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="overflow-hidden rounded-xl border bg-card shadow-xl shadow-foreground/5">
        <div className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="ml-2 text-xs font-medium text-muted-foreground">PdM Monitor</span>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-secondary">{pv.heading}</span>
            <StatusChip status="critical" size="sm" />
          </div>
          <div>
            <p className="font-semibold">{pv.asset}</p>
            <p className="text-xs text-muted-foreground">{pv.meta}</p>
          </div>

          <ForecastSketch nowLabel={pv.now} />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-text-secondary">{pv.rulLabel}</p>
              <p className="text-2xl font-semibold">{pv.rul}</p>
              <p className="text-xs text-muted-foreground">{pv.interval}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-text-secondary">{pv.health}</p>
              <p className="text-2xl font-semibold">
                31<span className="text-sm font-normal text-muted-foreground"> / 100</span>
              </p>
              <p className="text-xs font-medium text-critical-fg">▼ 12 · {pv.confidence}</p>
            </div>
          </div>

          <div className="text-sm">
            <p className="font-medium">{pv.mode}</p>
            <p className="text-xs text-text-secondary">{pv.why}</p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-xs">{pv.action}</p>
            <span className="inline-flex h-8 shrink-0 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">{pv.button}</span>
          </div>
        </div>
      </div>

      <div aria-hidden className="absolute -bottom-6 -left-4 hidden max-w-[17rem] items-start gap-3 rounded-lg border bg-card p-3 shadow-lg sm:flex lg:-left-8">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-critical-bg">
          <BellRing className="size-4 text-critical" />
        </span>
        <span className="text-xs">
          <span className="block font-semibold">{pv.alert}</span>
          <span className="block text-muted-foreground">
            {pv.asset} · {pv.alertTime}
          </span>
        </span>
      </div>
    </div>
  );
}

/** A small static health-forecast sketch: history, forecast with interval band, thresholds. */
function ForecastSketch({ nowLabel }: { nowLabel: string }) {
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" aria-hidden>
      {[20, 50, 80, 110].map((y) => (
        <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
      ))}
      <rect x="250" y="8" width="34" height="104" fill="var(--status-critical-bg)" />
      <line x1="0" x2="320" y1="38" y2="38" stroke="var(--status-warning)" strokeDasharray="5 4" strokeWidth="1.25" />
      <line x1="0" x2="320" y1="70" y2="70" stroke="var(--status-critical)" strokeDasharray="5 4" strokeWidth="1.25" />
      <path d="M232 76 C 255 82, 275 88, 300 94 L 300 118 C 275 104, 255 90, 232 76 Z" fill="var(--chart-band)" />
      <path d="M0 18 L40 17 L80 19 L110 18 L135 22 L160 30 L185 42 L205 55 L220 66 L232 76" fill="none" stroke="var(--chart-1)" strokeWidth="2.25" strokeLinejoin="round" />
      <path d="M232 76 C 250 84, 270 96, 300 106" fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeDasharray="6 4" />
      <line x1="232" x2="232" y1="6" y2="114" stroke="var(--foreground)" strokeOpacity="0.4" />
      <text x="236" y="16" fontSize="10" fill="var(--text-secondary)">
        {nowLabel}
      </text>
    </svg>
  );
}
