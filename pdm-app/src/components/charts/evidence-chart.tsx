"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { SensorPoint } from "@/lib/types";
import { AXIS_TICK, LineSwatch, TooltipCard } from "./chart-tooltip";

/** 48-hour window of raw readings around an alert trigger. */
export function EvidenceChart({
  points,
  threshold,
  thresholdLabel,
  triggeredAt,
  unit,
  label,
  summary,
}: {
  points: SensorPoint[];
  threshold?: number;
  thresholdLabel: string;
  triggeredAt: number;
  unit: string;
  label: string;
  summary: string;
}) {
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
  const lo = Math.min(...vals, threshold ?? Infinity);
  const hi = Math.max(...vals, threshold ?? -Infinity);
  const pad = (hi - lo) * 0.1 || 1;
  return (
    <LineChart
      data={points}
      responsive
      style={{ width: "100%", height: 160 }}
      margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
      title={`${label}, 48 hours around the trigger`}
      desc={summary}
    >
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => format(t, "HH:mm")} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} minTickGap={36} />
      <YAxis domain={[Math.max(0, lo - pad), hi + pad]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => v.toFixed(v < 10 ? 1 : 0)} />
      {threshold !== undefined ? (
        <ReferenceLine y={threshold} stroke="var(--status-critical)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: thresholdLabel, position: "insideTopLeft", fill: "var(--status-critical-fg)", fontSize: 11 }} />
      ) : null}
      <ReferenceLine x={triggeredAt} stroke="var(--foreground)" strokeOpacity={0.5} label={{ value: "Triggered", position: "insideTopRight", fill: "var(--text-secondary)", fontSize: 11 }} />
      <Tooltip
        cursor={{ stroke: "var(--chart-axis)" }}
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as SensorPoint;
          return <TooltipCard title={format(p.t, "EEE MMM d, HH:mm")} rows={[{ label, value: p.v === null ? "No data" : `${p.v} ${unit}`, swatch: <LineSwatch /> }]} />;
        }}
      />
      <Line dataKey="v" stroke="var(--chart-1)" strokeWidth={1.75} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
    </LineChart>
  );
}
