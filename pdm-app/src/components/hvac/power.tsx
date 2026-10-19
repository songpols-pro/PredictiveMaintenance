"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, LineSwatch, TooltipCard } from "@/components/charts/chart-tooltip";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { SkeletonCard } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import { useNow } from "@/lib/use-query";
import { EMPTY_LAYOUT, findDevice, type PlantLayout } from "@/lib/hvac/layout";
import type { MeterSnap, PlantSnap } from "@/lib/hvac/model";
import { useHvacAccount } from "@/lib/hvac/account";
import { loadEnergy, loadRows, useHistory } from "@/lib/hvac/history";
import { useLayout, useLive } from "@/lib/hvac/live";
import { DAY, MIN, dayStart, energyBetween, plantAt } from "@/lib/hvac/sim";
import { DeviceAlarms } from "./alarms";
import { MeterArt } from "./art";
import { PageTitle, StateBadge, ValueList, useReading } from "./common";

const sum3 = (x: [number, number, number]) => x[0] + x[1] + x[2];
const avg3 = (x: [number, number, number]) => sum3(x) / 3;
const QUARTER = 15 * MIN;

/** kWh since midnight per meter (null: no counter reading), recomputed every 15 minutes. */
function useTodayEnergy(now: number, meters: string[]): Record<string, number | null> {
  const project = useHvacAccount()?.project ?? null;
  const t = Math.floor(now / QUARTER) * QUARTER;
  const { data } = useHistory(
    `energy-today|${project}|${t}|${meters.join(",")}`,
    async () => {
      const kwh = await loadEnergy(project, meters, [[dayStart(t), t]]);
      return Object.fromEntries(meters.map((id) => [id, kwh[id][0]]));
    },
    () => Object.fromEntries(meters.map((id) => [id, energyBetween(id, dayStart(t), t)])),
  );
  return data ?? Object.fromEntries(meters.map((id) => [id, null]));
}

/** Up to this many meters side by side under the total; more wrap into rows (and the branch lines go). */
const TREE_COLS = 4;

function Tree({ snap, layout, today }: { snap: PlantSnap; layout: PlantLayout; today: Record<string, number | null> }) {
  const { m } = useI18n();
  const p = m.hvac.power;
  const r = useReading();
  const cols = Math.max(1, Math.min(snap.meters.length, TREE_COLS));
  const branches = snap.meters.length <= TREE_COLS ? snap.meters.length : 0;
  const at = (k: number) => `${((k + 0.5) / cols) * 100}%`;
  const parts = Object.values(today);
  const totalToday = parts.every((v) => v !== null) ? parts.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  return (
    <section aria-labelledby="pm-total" className="rounded-lg border bg-muted/50 p-4">
      <div className="mx-auto flex max-w-sm flex-col items-center rounded-lg border bg-card px-6 py-4 text-center">
        <h2 id="pm-total" className="text-sm font-medium text-text-secondary">
          {p.total}
        </h2>
        <p className="text-3xl font-semibold tracking-tight tabular">
          {r(snap.kw, 1)} <span className="text-base font-normal text-muted-foreground">kW</span>
        </p>
        <p className="text-sm text-text-secondary tabular">{p.today(r(totalToday, 0))}</p>
      </div>
      {branches > 0 ? (
        <div aria-hidden className="relative hidden h-10 md:block">
          <span className="absolute top-0 left-1/2 h-1/2 w-0.5 -translate-x-1/2 bg-input" />
          {branches > 1 ? <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-input" style={{ left: at(0), right: at(0) }} /> : null}
          {Array.from({ length: branches }).map((_, k) => (
            <span key={k} className="absolute bottom-0 h-1/2 w-0.5 -translate-x-1/2 bg-input" style={{ left: at(k) }} />
          ))}
        </div>
      ) : null}
      <ul className="mt-4 grid grid-cols-1 gap-4 md:mt-0 md:grid-cols-(--cols)" style={{ "--cols": `repeat(${cols}, minmax(0, 1fr))` } as React.CSSProperties}>
        {snap.meters.map((mt) => {
          const def = findDevice(layout, mt.id) ?? { id: mt.id, kind: "meter" as const, name: mt.id };
          const kw = sum3(mt.kw);
          // Unknown while the total is (a meter is offline): a share of a partial total would mislead.
          const share = Number.isFinite(snap.kw) && snap.kw > 0 && Number.isFinite(kw) && mt.state === "on" ? Math.round((kw / snap.kw) * 100) : null;
          const chiller = mt.chillerId ? snap.chillers.find((c) => c.id === mt.chillerId) : undefined;
          return (
            <li key={mt.id}>
              <article className="relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-input hover:bg-accent/40 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
                <div className="flex items-center justify-between gap-2 px-3 pt-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold">
                    <Link href={{ pathname: "/hvac/power", query: { meter: mt.id } }} scroll={false} className="outline-none after:absolute after:inset-0" aria-label={p.open(def.name)}>
                      {def.name}
                    </Link>
                  </h3>
                  {mt.state === "offline" ? <StateBadge state="offline" size="sm" /> : null}
                </div>
                <div className="flex items-center gap-3 p-3">
                  <MeterArt className="size-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{def.label ?? def.id}</p>
                    <p className="text-2xl font-semibold tracking-tight tabular">
                      {r(kw, 1)} <span className="text-sm font-normal text-muted-foreground">kW</span>
                    </p>
                    <p className="text-sm text-text-secondary tabular">{r(mt.kwh, 0, "kWh")}</p>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{share === null ? null : p.share(share)}</span>
                    <span className="font-semibold tabular">
                      {p.pf} {r(avg3(mt.pf), 2)}
                    </span>
                  </div>
                  <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-accent">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${share ?? 0}%` }} />
                  </span>
                  {chiller && chiller.state !== "on" ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                      <StateBadge state={chiller.state} size="sm" />
                      {p.standby}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type DayRow = { min: number; today: number | null; yesterday: number | null };

function PowerChart({ now }: { now: number }) {
  const { m, f } = useI18n();
  const p = m.hvac.power;
  const project = useHvacAccount()?.project ?? null;
  const bucket = Math.floor(now / QUARTER);
  const end = bucket * QUARTER;
  const start = dayStart(end);
  const grid = (today: (t: number) => number | null, yesterday: (t: number) => number | null) => {
    const rows: DayRow[] = [];
    for (let t = start; t < start + DAY; t += QUARTER) rows.push({ min: (t - start) / MIN, today: t <= end ? today(t) : null, yesterday: yesterday(t - DAY) });
    return rows;
  };
  const { data: loaded } = useHistory(
    `power-day|${project}|${end}`,
    async () => {
      const rows = await loadRows(project, ["PLANT.kw"], start - DAY, end, QUARTER);
      const kw = new Map(rows.map((r) => [r.t, r.values[0]]));
      return grid((t) => kw.get(t) ?? null, (t) => kw.get(t) ?? null);
    },
    () => grid((t) => plantAt(t).kw, (t) => plantAt(t).kw),
  );
  const data = useMemo(() => loaded ?? [], [loaded]);
  const label = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const todayRows = data.filter((d) => d.today !== null);
  const peak = todayRows.reduce((a, b) => ((b.today ?? 0) > (a.today ?? 0) ? b : a), todayRows[0]);
  const last = todayRows[todayRows.length - 1];
  const diff = last && last.yesterday ? Math.round((((last.today ?? 0) - last.yesterday) / last.yesterday) * 100) : 0;
  const summary = !last
    ? ""
    : last.yesterday === null
      ? p.chartSummaryNoYesterday(f.number(peak.today ?? 0, 0), label(peak.min), f.number(last.today ?? 0, 0))
      : p.chartSummary(f.number(peak.today ?? 0, 0), label(peak.min), f.number(last.today ?? 0, 0), Math.abs(diff) < 2 ? p.same : diff > 0 ? p.higher(diff) : p.lower(-diff));
  return (
    <ChartFrame
      className="mt-5"
      title={p.chart}
      headingLevel={2}
      subtitle={p.chartSub}
      summary={summary}
      legend={
        <Legend>
          <LegendItem swatch={<LineSwatch color="var(--chart-1)" />} label={p.todayLine} />
          <LegendItem swatch={<LineSwatch dashed color="var(--chart-axis)" />} label={p.yesterdayLine} />
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">{p.caption}</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">{p.time}</TableHead>
              <TableHead scope="col" className="text-right">
                {p.todayLine} (kW)
              </TableHead>
              <TableHead scope="col" className="text-right">
                {p.yesterdayLine} (kW)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.min}>
                <TableCell className="tabular">{label(d.min)}</TableCell>
                <TableCell className="text-right tabular">{d.today === null ? "—" : f.number(d.today, 1)}</TableCell>
                <TableCell className="text-right tabular">{d.yesterday === null ? "—" : f.number(d.yesterday, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <LineChart data={data} responsive style={{ width: "100%", height: 260 }} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} title={p.chart} desc={summary}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="min" type="number" domain={[0, 24 * 60]} ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]} tickFormatter={label} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <TooltipCard
                title={label(d.min)}
                rows={[
                  { label: p.todayLine, value: d.today === null ? "—" : `${f.number(d.today, 1)} kW`, swatch: <LineSwatch color="var(--chart-1)" /> },
                  { label: p.yesterdayLine, value: d.yesterday === null ? "—" : `${f.number(d.yesterday, 1)} kW`, swatch: <LineSwatch dashed color="var(--chart-axis)" /> },
                ]}
              />
            );
          }}
        />
        <Line type="monotone" dataKey="yesterday" stroke="var(--chart-axis)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} name={p.yesterdayLine} />
        <Line type="monotone" dataKey="today" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name={p.todayLine} />
      </LineChart>
    </ChartFrame>
  );
}

function MeterDialog({ meter, layout, today }: { meter: MeterSnap | undefined; layout: PlantLayout; today: Record<string, number | null> }) {
  const { m } = useI18n();
  const p = m.hvac.power;
  const r = useReading();
  const router = useRouter();
  const pathname = usePathname();
  const focus = useDialogFocus();
  const close = () => router.replace(pathname, { scroll: false });
  const def = meter ? (findDevice(layout, meter.id) ?? { id: meter.id, kind: "meter" as const, name: meter.id }) : undefined;
  const phases = ["L1", "L2", "L3"];
  const group = (title: string, rows: { label: string; value: string }[]) => (
    <section className="rounded-lg border bg-muted/40 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ValueList rows={rows} />
    </section>
  );
  const imbalance = meter ? (Math.max(...meter.amps.map((a) => Math.abs(a - avg3(meter.amps)))) / avg3(meter.amps)) * 100 : 0;
  return (
    <Dialog open={Boolean(meter)} onOpenChange={(open) => (open ? null : close())}>
      {meter && def ? (
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl" {...focus.contentProps}>
          <DialogHeader className="pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg font-semibold">{def.label ?? def.name}</DialogTitle>
              {meter.state === "offline" ? <StateBadge state="offline" /> : null}
            </div>
            <DialogDescription>{def.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <div className="flex flex-col gap-3">
              <div className="flex justify-center rounded-lg bg-muted p-3">
                <MeterArt className="size-20 sm:size-32" />
              </div>
              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <div className="rounded-lg border bg-card p-2.5">
                  <dt className="text-xs text-muted-foreground">{p.groups.active}</dt>
                  <dd className="text-lg font-semibold tabular">{r(sum3(meter.kw), 1, "kW")}</dd>
                </div>
                <div className="rounded-lg border bg-card p-2.5">
                  <dt className="text-xs text-muted-foreground">{p.energy}</dt>
                  <dd className="text-lg font-semibold tabular">{p.today(r(today[meter.id], 0))}</dd>
                </div>
              </dl>
              <DeviceAlarms deviceId={meter.id} />
            </div>
            <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group(p.groups.vLN, [...phases.map((ph, i) => ({ label: `${ph}-N`, value: r(meter.vLN[i], 1, "V") })), { label: p.avg, value: r(avg3(meter.vLN), 1, "V") }])}
              {group(p.groups.vLL, [
                ...["L1-L2", "L2-L3", "L3-L1"].map((ph, i) => ({ label: ph, value: r(meter.vLL[i], 1, "V") })),
                { label: p.avg, value: r(avg3(meter.vLL), 1, "V") },
              ])}
              {group(p.groups.current, [...phases.map((ph, i) => ({ label: ph, value: r(meter.amps[i], 1, "A") })), { label: p.avg, value: r(avg3(meter.amps), 1, "A") }])}
              {group(p.groups.active, [...phases.map((ph, i) => ({ label: ph, value: r(meter.kw[i], 2, "kW") })), { label: p.total2, value: r(sum3(meter.kw), 2, "kW") }])}
              {group(p.groups.reactive, [...phases.map((ph, i) => ({ label: ph, value: r(meter.kvar[i], 2, "kVAR") })), { label: p.total2, value: r(sum3(meter.kvar), 2, "kVAR") }])}
              {group(p.groups.pf, [...phases.map((ph, i) => ({ label: ph, value: r(meter.pf[i], 2) })), { label: p.avg, value: r(avg3(meter.pf), 2) }])}
              {group(p.groups.energy, [{ label: p.activeEnergy, value: r(meter.kwh, 0, "kWh") }])}
              {group(p.groups.quality, [
                { label: p.frequency, value: r(meter.hz, 2, "Hz") },
                { label: p.imbalance, value: r(imbalance, 1, "%") },
              ])}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 bg-popover">
            <Button onClick={close}>{m.hvac.device.close}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function PowerView() {
  const { m } = useI18n();
  const live = useLive();
  const now = useNow(60_000);
  const params = useSearchParams();
  const layout = useLayout() ?? EMPTY_LAYOUT;
  const today = useTodayEnergy(live?.receivedAt ?? now, layout.meters.map((mt) => mt.id));
  const meterId = params.get("meter");
  return (
    <>
      <PageTitle>{m.hvac.titles.power}</PageTitle>
      {live ? (
        <>
          <Tree snap={live.snap} layout={layout} today={today} />
          <PowerChart now={live.receivedAt} />
          <MeterDialog meter={live.snap.meters.find((x) => x.id === meterId)} layout={layout} today={today} />
        </>
      ) : (
        <div role="status" aria-live="polite">
          <span className="sr-only">{m.hvac.shell.loading}</span>
          <SkeletonCard height="h-72" />
          <SkeletonCard className="mt-5" height="h-80" />
        </div>
      )}
    </>
  );
}
