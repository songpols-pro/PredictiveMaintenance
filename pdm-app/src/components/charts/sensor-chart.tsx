"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { SensorSeries, TimeRange } from "@/lib/types";
import { AXIS_TICK, LineSwatch, ThresholdSwatch, TooltipCard, TriangleMarker, TriangleSwatch } from "./chart-tooltip";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

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

export function describeSeries(series: SensorSeries, range: TimeRange, m: Messages): string {
  const { label, unit, direction, warning, critical } = series.config;
  const d = digitsFor(series);
  if (series.latest === null) return m.chart.noReadings(label, m.chart.ranges[range]);
  return m.chart.summary({
    latest: series.latest.toFixed(d),
    unit,
    zone: zoneOf(series, series.latest) ?? "normal",
    above: direction === "above",
    warning,
    critical,
    baseline: series.baseline.toFixed(d),
    anomalies: series.anomalyCount,
    range: m.chart.ranges[range],
  });
}

export function SensorChart({ series, range, height = 200, actions }: { series: SensorSeries; range: TimeRange; height?: number; actions?: React.ReactNode }) {
  const { m, f } = useI18n();
  const { config } = series;
  const d = digitsFor(series);
  const sym = config.direction === "above" ? "≥" : "≤";
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
  const tick = (t: number) => (range === "24h" ? f.time(t) : range === "7d" ? f.weekdayDay(t) : f.shortDate(t));
  const summary = describeSeries(series, range, m);
  const zone = zoneOf(series, series.latest);
  const rangeLabel = m.chart.ranges[range];

  return (
    <ChartFrame
      title={`${config.label} (${config.unit})`}
      subtitle={
        series.latest !== null ? (
          <span>
            {m.chart.latest} <span className="font-semibold text-foreground tabular">{series.latest.toFixed(d)} {config.unit}</span>
            {zone === "critical" ? <span className="ml-1 font-medium text-critical-fg">· {m.chart.aboveCritical(config.direction === "above")}</span> : null}
            {zone === "warning" ? <span className="ml-1 font-medium text-warning-fg">· {m.chart.inWarning}</span> : null}
            {zone === "normal" ? <span className="ml-1">· {m.chart.withinLimits}</span> : null}
          </span>
        ) : (
          m.chart.noRecent
        )
      }
      summary={summary}
      actions={actions}
      legend={
        <Legend>
          <LegendItem swatch={<LineSwatch />} label={config.label} />
          <LegendItem swatch={<ThresholdSwatch tone="warning" />} label={m.chart.warningLegend(sym, config.warning)} />
          <LegendItem swatch={<ThresholdSwatch tone="critical" />} label={m.chart.criticalLegend(sym, config.critical)} />
          <LegendItem swatch={<TriangleSwatch />} label={m.chart.anomaly} />
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">{m.chart.readingsCaption(config.label, rangeLabel)}</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">{m.chart.time}</TableHead>
              <TableHead scope="col" className="text-right">
                {m.chart.value(config.unit)}
              </TableHead>
              <TableHead scope="col">{m.chart.zone}</TableHead>
              <TableHead scope="col">{m.chart.anomaly}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data].reverse().map((p) => {
              const z = zoneOf(series, p.v);
              return (
                <TableRow key={p.t}>
                  <TableCell className="tabular">{f.dateTime(p.t)}</TableCell>
                  <TableCell className="text-right tabular">{p.v === null ? m.chart.noData : p.v.toFixed(d)}</TableCell>
                  <TableCell>{z ? m.chart.zones[z] : "—"}</TableCell>
                  <TableCell>{p.anomaly !== null ? m.chart.yes(p.anomaly.toFixed(d)) : m.chart.no}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      }
    >
      <ComposedChart
        data={data}
        responsive
        style={{ width: "100%", height }}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        title={m.chart.svgTitle(config.label, rangeLabel)}
        desc={summary}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={tick}
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
          label={{ value: m.chart.warningRef(config.warning), position: "insideTopLeft", fill: "var(--status-warning-fg)", fontSize: 11 }}
        />
        <ReferenceLine
          y={config.critical}
          stroke="var(--status-critical)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
          label={{ value: m.chart.criticalRef(config.critical), position: "insideTopLeft", fill: "var(--status-critical-fg)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            const z = zoneOf(series, p.v);
            return (
              <TooltipCard
                title={range === "24h" || range === "7d" ? f.weekdayDateTime(p.t) : f.dateTime(p.t)}
                rows={[
                  { label: config.label, value: p.v === null ? m.chart.noData : `${p.v.toFixed(d)} ${config.unit}`, swatch: <LineSwatch /> },
                  { label: m.chart.zone, value: z ? m.chart.zones[z] : "—" },
                  ...(p.anomaly !== null && p.anomaly !== undefined ? [{ label: m.chart.anomaly, value: `${p.anomaly.toFixed(d)} ${config.unit}`, swatch: <TriangleSwatch /> }] : []),
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
        {anomalies.length > 0 ? (
          <Scatter
            data={anomalies}
            dataKey="anomaly"
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => <TriangleMarker cx={props.cx} cy={props.cy} />}
            name={m.chart.anomaly}
          />
        ) : null}
      </ComposedChart>
    </ChartFrame>
  );
}
