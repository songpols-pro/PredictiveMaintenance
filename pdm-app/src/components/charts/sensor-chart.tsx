"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { SensorSeries, TimeRange } from "@/lib/types";
import { AXIS_TICK, LineSwatch, ThresholdSwatch, TooltipCard, TriangleMarker, TriangleSwatch } from "./chart-tooltip";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RANGE_LABEL: Record<TimeRange, string> = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days" };

function tickFormat(range: TimeRange) {
  return (t: number) => format(new Date(t), range === "24h" ? "HH:mm" : range === "7d" ? "EEE d" : "MMM d");
}

function digitsFor(series: SensorSeries) {
  return series.config.unit === "bar" && series.baseline < 20 ? 2 : 1;
}

/** Evenly spaced time ticks so every chart shows the same number of labels. */
export function evenTicks(times: number[], count = 6): number[] {
  if (times.length < 2) return times;
  const first = times[0];
  const last = times[times.length - 1];
  return Array.from({ length: count }, (_, i) => Math.round(first + ((last - first) * i) / (count - 1)));
}

export function zoneOf(series: SensorSeries, v: number | null): "critical" | "warning" | "normal" | null {
  if (v === null) return null;
  const { direction, warning, critical } = series.config;
  if (direction === "above") return v >= critical ? "critical" : v >= warning ? "warning" : "normal";
  return v <= critical ? "critical" : v <= warning ? "warning" : "normal";
}

export function describeSeries(series: SensorSeries, range: TimeRange): string {
  const { label, unit, direction, warning, critical } = series.config;
  const d = digitsFor(series);
  if (series.latest === null) return `${label}: no readings in the ${RANGE_LABEL[range]}.`;
  const zone = zoneOf(series, series.latest);
  const cmp = direction === "above" ? "above" : "below";
  const zoneText =
    zone === "critical"
      ? `${cmp} the critical limit (${critical} ${unit})`
      : zone === "warning"
        ? `${cmp} the warning limit (${warning} ${unit})`
        : `within limits (warning ${direction === "above" ? "≥" : "≤"} ${warning} ${unit})`;
  return `Latest ${series.latest.toFixed(d)} ${unit}, ${zoneText}. 30-day baseline ${series.baseline.toFixed(d)} ${unit}. ${series.anomalyCount} anomal${series.anomalyCount === 1 ? "y" : "ies"} in the ${RANGE_LABEL[range]}.`;
}

export function SensorChart({ series, range, height = 200, actions }: { series: SensorSeries; range: TimeRange; height?: number; actions?: React.ReactNode }) {
  const { config } = series;
  const d = digitsFor(series);
  const data = useMemo(() => series.points.map((p) => ({ t: p.t, v: p.v, anomaly: p.anomaly ?? null })), [series.points]);
  // Anomaly markers get their own data set so empty buckets don't render as markers.
  const anomalies = useMemo(() => data.filter((p) => p.anomaly !== null).map((p) => ({ t: p.t, anomaly: p.anomaly })), [data]);

  const domain = useMemo(() => {
    const vals = data.flatMap((p) => [p.v, p.anomaly]).filter((v): v is number => v !== null);
    const lo = Math.min(...vals, config.critical, config.warning);
    const hi = Math.max(...vals, config.critical, config.warning);
    const pad = (hi - lo) * 0.08 || 1;
    return [Math.max(0, lo - pad), hi + pad] as [number, number];
  }, [data, config]);

  const ticks = useMemo(() => evenTicks(data.map((p) => p.t)), [data]);
  const summary = describeSeries(series, range);
  const zone = zoneOf(series, series.latest);

  return (
    <ChartFrame
      title={`${config.label} (${config.unit})`}
      subtitle={
        series.latest !== null ? (
          <span>
            Latest <span className="font-semibold text-foreground tabular">{series.latest.toFixed(d)} {config.unit}</span>
            {zone === "critical" ? <span className="ml-1 font-medium text-critical-fg">· {config.direction === "above" ? "above" : "below"} critical limit</span> : null}
            {zone === "warning" ? <span className="ml-1 font-medium text-warning-fg">· in warning zone</span> : null}
            {zone === "normal" ? <span className="ml-1">· within limits</span> : null}
          </span>
        ) : (
          "No recent readings"
        )
      }
      summary={summary}
      actions={actions}
      legend={
        <Legend>
          <LegendItem swatch={<LineSwatch />} label={config.label} />
          <LegendItem swatch={<ThresholdSwatch tone="warning" />} label={`Warning ${config.direction === "above" ? "≥" : "≤"} ${config.warning}`} />
          <LegendItem swatch={<ThresholdSwatch tone="critical" />} label={`Critical ${config.direction === "above" ? "≥" : "≤"} ${config.critical}`} />
          <LegendItem swatch={<TriangleSwatch />} label="Anomaly" />
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">{config.label} readings, {RANGE_LABEL[range]}</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">Time</TableHead>
              <TableHead scope="col" className="text-right">Value ({config.unit})</TableHead>
              <TableHead scope="col">Zone</TableHead>
              <TableHead scope="col">Anomaly</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data].reverse().map((p) => (
              <TableRow key={p.t}>
                <TableCell className="tabular">{format(new Date(p.t), "MMM d, HH:mm")}</TableCell>
                <TableCell className="text-right tabular">{p.v === null ? "No data" : p.v.toFixed(d)}</TableCell>
                <TableCell>{zoneOf(series, p.v) ?? "—"}</TableCell>
                <TableCell>{p.anomaly !== null ? `Yes (${p.anomaly.toFixed(d)})` : "No"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <ComposedChart
        data={data}
        responsive
        style={{ width: "100%", height }}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        title={`${config.label} over the ${RANGE_LABEL[range]}`}
        desc={summary}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={tickFormat(range)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-axis)" }}
          minTickGap={28}
        />
        <YAxis domain={domain} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => v.toFixed(v < 10 ? 1 : 0)} />
        <ReferenceLine
          y={config.warning}
          stroke="var(--status-warning)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
          label={{ value: `Warning ${config.warning}`, position: "insideTopLeft", fill: "var(--status-warning-fg)", fontSize: 11 }}
        />
        <ReferenceLine
          y={config.critical}
          stroke="var(--status-critical)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
          label={{ value: `Critical ${config.critical}`, position: "insideTopLeft", fill: "var(--status-critical-fg)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            const z = zoneOf(series, p.v);
            return (
              <TooltipCard
                title={format(new Date(p.t), range === "24h" || range === "7d" ? "EEE MMM d, HH:mm" : "MMM d, HH:mm")}
                rows={[
                  { label: config.label, value: p.v === null ? "No data" : `${p.v.toFixed(d)} ${config.unit}`, swatch: <LineSwatch /> },
                  { label: "Zone", value: z ? z[0].toUpperCase() + z.slice(1) : "—" },
                  ...(p.anomaly !== null ? [{ label: "Anomaly", value: `${p.anomaly.toFixed(d)} ${config.unit}`, swatch: <TriangleSwatch /> }] : []),
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--chart-1)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
          name={config.label}
        />
        {anomalies.length > 0 ? <Scatter data={anomalies} dataKey="anomaly" isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <TriangleMarker cx={props.cx} cy={props.cy} />} name="Anomaly" /> : null}
      </ComposedChart>
    </ChartFrame>
  );
}
