"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { HealthPoint, Prediction, PredictionSettings } from "@/lib/types";
import { AXIS_TICK, BandSwatch, LineSwatch, ThresholdSwatch, TooltipCard } from "./chart-tooltip";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { evenTicks } from "./sensor-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DAY = 86_400_000;

function WindowSwatch() {
  return (
    <svg width="14" height="10" aria-hidden>
      <rect x="0" y="0" width="14" height="10" rx="2" fill="var(--status-critical-bg)" stroke="var(--status-critical)" strokeOpacity="0.5" />
    </svg>
  );
}
const FAILURE_LEVEL = 20;

export function HealthForecastChart({
  points,
  prediction,
  settings,
  now,
  stale,
}: {
  points: HealthPoint[];
  prediction: Prediction | null;
  settings: PredictionSettings;
  now: number;
  stale: boolean;
}) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        t: p.t,
        score: p.score,
        forecast: p.forecast ?? null,
        band: p.band ?? null,
      })),
    [points],
  );
  const showsFailure = !!prediction && !stale && prediction.rulHigh <= 75;
  const failStart = prediction ? now + prediction.rulLow * DAY : 0;
  const failEnd = prediction ? now + prediction.rulHigh * DAY : 0;

  const current = [...data].reverse().find((p) => p.score !== null)?.score ?? null;
  const first = data.find((p) => p.score !== null)?.score ?? null;
  const summary =
    current === null
      ? "No health history yet."
      : `Health score ${current} today${first !== null ? `, from ${Math.round(first)} 90 days ago` : ""}. ` +
        (prediction && !stale
          ? showsFailure
            ? `Forecast reaches the failure threshold (${FAILURE_LEVEL}) in about ${prediction.rulDays} days, between ${format(failStart, "MMM d")} and ${format(failEnd, "MMM d")} (${Math.round(prediction.intervalLevel * 100)}% interval, ${Math.round(prediction.confidence * 100)}% model confidence).`
            : `No failure expected in the 30-day forecast window.`
          : stale
            ? "Forecast paused because the asset is not sending data."
            : "");

  // Thin the table to one row per day to keep it readable.
  const tableRows = useMemo(() => {
    const byDay = new Map<string, (typeof data)[number]>();
    for (const p of data) byDay.set(format(p.t, "yyyy-MM-dd"), p);
    return [...byDay.values()].reverse();
  }, [data]);

  return (
    <ChartFrame
      title="Health score and RUL forecast"
      headingLevel={2}
      subtitle="Last 90 days of health score (0–100) with the model’s forecast to the failure threshold"
      summary={summary}
      legend={
        <Legend>
          <LegendItem swatch={<LineSwatch />} label="Health score" />
          {prediction && !stale ? <LegendItem swatch={<LineSwatch dashed />} label="Forecast (median)" /> : null}
          {prediction && !stale ? <LegendItem swatch={<BandSwatch />} label={`${Math.round(prediction.intervalLevel * 100)}% interval`} /> : null}
          {showsFailure ? <LegendItem swatch={<WindowSwatch />} label="Predicted failure window" /> : null}
          <LegendItem swatch={<ThresholdSwatch tone="warning" />} label={`Warning < ${settings.healthWarningBelow}`} />
          <LegendItem swatch={<ThresholdSwatch tone="critical" />} label={`Critical < ${settings.healthCriticalBelow}`} />
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">Daily health score and forecast</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col" className="text-right">Health score</TableHead>
              <TableHead scope="col" className="text-right">Forecast</TableHead>
              <TableHead scope="col" className="text-right">Interval</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((p) => (
              <TableRow key={p.t}>
                <TableCell className="tabular">{format(p.t, "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right tabular">{p.score ?? "—"}</TableCell>
                <TableCell className="text-right tabular">{p.forecast ?? "—"}</TableCell>
                <TableCell className="text-right tabular">{p.band ? `${p.band[0]}–${p.band[1]}` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <ComposedChart
        data={data}
        responsive
        style={{ width: "100%", height: 260 }}
        margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
        title="Health score and remaining useful life forecast"
        desc={summary}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        {showsFailure ? (
          <ReferenceArea
            x1={failStart}
            x2={failEnd}
            fill="var(--status-critical-bg)"
            fillOpacity={0.9}
            stroke="none"
          />
        ) : null}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={evenTicks(data.map((p) => p.t), 8)}
          tickFormatter={(t: number) => format(t, "MMM d")}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-axis)" }}
          minTickGap={32}
        />
        <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
        <ReferenceLine y={settings.healthWarningBelow} stroke="var(--status-warning)" strokeDasharray="5 4" strokeWidth={1.25} />
        <ReferenceLine y={settings.healthCriticalBelow} stroke="var(--status-critical)" strokeDasharray="5 4" strokeWidth={1.25} />
        <ReferenceLine
          y={FAILURE_LEVEL}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          label={{ value: "Failure threshold", position: "insideBottomLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ReferenceLine
          x={now}
          stroke="var(--foreground)"
          strokeOpacity={0.5}
          label={{ value: "Now", position: "insideTopLeft", fill: "var(--text-secondary)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            const future = p.t > now;
            return (
              <TooltipCard
                title={`${format(p.t, "EEE MMM d, HH:mm")}${future ? " (forecast)" : ""}`}
                rows={[
                  ...(p.score !== null ? [{ label: "Health score", value: p.score, swatch: <LineSwatch /> }] : []),
                  ...(future && p.forecast !== null ? [{ label: "Forecast", value: p.forecast, swatch: <LineSwatch dashed /> }] : []),
                  ...(future && p.band ? [{ label: "Interval", value: `${p.band[0]}–${p.band[1]}`, swatch: <BandSwatch /> }] : []),
                ]}
              />
            );
          }}
        />
        <Area dataKey="band" stroke="none" fill="var(--chart-band)" isAnimationActive={false} connectNulls={false} activeDot={false} />
        <Line dataKey="forecast" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} activeDot={false} />
        <Line
          dataKey="score"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
