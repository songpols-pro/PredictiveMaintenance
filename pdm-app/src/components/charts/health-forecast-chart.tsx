"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { HealthPoint, Prediction, PredictionSettings } from "@/lib/types";
import { AXIS_TICK, BandSwatch, LineSwatch, ThresholdSwatch, TooltipCard } from "./chart-tooltip";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { evenTicks } from "./sensor-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";

const DAY = 86_400_000;
const FAILURE_LEVEL = 20;

function WindowSwatch() {
  return (
    <svg width="14" height="10" aria-hidden>
      <rect x="0" y="0" width="14" height="10" rx="2" fill="var(--status-critical-bg)" stroke="var(--status-critical)" strokeOpacity="0.5" />
    </svg>
  );
}

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
  const { m, f } = useI18n();
  const h = m.healthChart;
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
      ? h.noHistory
      : h.scoreToday(current, first !== null ? Math.round(first) : null) +
        (prediction && !stale
          ? showsFailure
            ? h.reaches(prediction.rulDays, f.shortDate(failStart), f.shortDate(failEnd), Math.round(prediction.intervalLevel * 100), Math.round(prediction.confidence * 100))
            : h.noFailure
          : stale
            ? h.paused
            : "");

  // Thin the table to one row per day to keep it readable.
  const tableRows = useMemo(() => {
    const byDay = new Map<string, (typeof data)[number]>();
    for (const p of data) byDay.set(new Date(p.t).toDateString(), p);
    return [...byDay.values()].reverse();
  }, [data]);

  return (
    <ChartFrame
      title={h.title}
      headingLevel={2}
      subtitle={h.subtitle}
      summary={summary}
      legend={
        <Legend>
          <LegendItem swatch={<LineSwatch />} label={h.score} />
          {prediction && !stale ? <LegendItem swatch={<LineSwatch dashed />} label={h.forecast} /> : null}
          {prediction && !stale ? <LegendItem swatch={<BandSwatch />} label={h.interval(Math.round(prediction.intervalLevel * 100))} /> : null}
          {showsFailure ? <LegendItem swatch={<WindowSwatch />} label={h.failureWindow} /> : null}
          <LegendItem swatch={<ThresholdSwatch tone="warning" />} label={h.warning(settings.healthWarningBelow)} />
          <LegendItem swatch={<ThresholdSwatch tone="critical" />} label={h.critical(settings.healthCriticalBelow)} />
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">{h.tableCaption}</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">{h.date}</TableHead>
              <TableHead scope="col" className="text-right">
                {h.score}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {h.forecastShort}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {h.intervalShort}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((p) => (
              <TableRow key={p.t}>
                <TableCell className="tabular">{f.date(p.t)}</TableCell>
                <TableCell className="text-right tabular">{p.score ?? "—"}</TableCell>
                <TableCell className="text-right tabular">{p.forecast ?? "—"}</TableCell>
                <TableCell className="text-right tabular">{p.band ? `${p.band[0]}–${p.band[1]}` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <ComposedChart data={data} responsive style={{ width: "100%", height: 260 }} margin={{ top: 16, right: 16, bottom: 0, left: 0 }} title={h.svgTitle} desc={summary}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        {showsFailure ? <ReferenceArea x1={failStart} x2={failEnd} fill="var(--status-critical-bg)" fillOpacity={0.9} stroke="none" /> : null}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={evenTicks(data.map((p) => p.t), 8)}
          tickFormatter={(t: number) => f.shortDate(t)}
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
          label={{ value: h.failureThreshold, position: "insideBottomLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ReferenceLine x={now} stroke="var(--foreground)" strokeOpacity={0.5} label={{ value: h.now, position: "insideTopLeft", fill: "var(--text-secondary)", fontSize: 11 }} />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            const future = p.t > now;
            return (
              <TooltipCard
                title={`${f.weekdayDateTime(p.t)}${future ? h.forecastSuffix : ""}`}
                rows={[
                  ...(p.score !== null ? [{ label: h.score, value: p.score, swatch: <LineSwatch /> }] : []),
                  ...(future && p.forecast !== null ? [{ label: h.forecastShort, value: p.forecast, swatch: <LineSwatch dashed /> }] : []),
                  ...(future && p.band ? [{ label: h.intervalShort, value: `${p.band[0]}–${p.band[1]}`, swatch: <BandSwatch /> }] : []),
                ]}
              />
            );
          }}
        />
        <Area dataKey="band" stroke="none" fill="var(--chart-band)" isAnimationActive={false} connectNulls={false} activeDot={false} />
        <Line dataKey="forecast" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} activeDot={false} />
        <Line dataKey="score" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
      </ComposedChart>
    </ChartFrame>
  );
}
