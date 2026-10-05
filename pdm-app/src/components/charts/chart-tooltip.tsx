import { cn } from "@/lib/utils";

/** Shared tooltip surface for Recharts custom tooltips. Text uses text tokens, never series colors. */
export function TooltipCard({ title, rows, className }: { title: string; rows: { label: string; value: React.ReactNode; swatch?: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("min-w-40 rounded-md border bg-popover px-3 py-2 text-xs shadow-md", className)}>
      <p className="mb-1 font-medium text-foreground">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {r.swatch}
              {r.label}
            </dt>
            <dd className="text-right font-medium text-foreground tabular">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

export function LineSwatch({ dashed, color = "var(--chart-1)" }: { dashed?: boolean; color?: string }) {
  return (
    <svg width="16" height="8" aria-hidden>
      <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

export function BandSwatch() {
  return (
    <svg width="16" height="10" aria-hidden>
      <rect x="0" y="1" width="16" height="8" rx="2" fill="var(--chart-band)" stroke="var(--chart-1)" strokeOpacity="0.4" />
    </svg>
  );
}

export function TriangleMarker({ cx = 0, cy = 0, size = 9, color = "var(--status-critical)" }: { cx?: number; cy?: number; size?: number; color?: string }) {
  const h = size;
  const d = `M ${cx} ${cy - h / 2 - 1} L ${cx + h / 2 + 1} ${cy + h / 2} L ${cx - h / 2 - 1} ${cy + h / 2} Z`;
  return <path d={d} fill={color} stroke="var(--card)" strokeWidth={2} paintOrder="stroke" />;
}

export function TriangleSwatch() {
  return (
    <svg width="14" height="12" aria-hidden>
      <TriangleMarker cx={7} cy={6} size={8} />
    </svg>
  );
}

export function ThresholdSwatch({ tone }: { tone: "warning" | "critical" }) {
  return <LineSwatch dashed color={tone === "warning" ? "var(--status-warning)" : "var(--status-critical)"} />;
}
