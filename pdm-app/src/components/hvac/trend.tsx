"use client";

// Trend: pick up to 6 points from any device, a time range and a sampling interval.
// Charts are split by unit so every chart has a single y-axis; on/off points share a lane chart.
// The query lives in the URL (?points=&range=&step=) so device details can deep-link here.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Info, LineChart as LineChartIcon, ListChecks, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AXIS_TICK, LineSwatch, TooltipCard } from "@/components/charts/chart-tooltip";
import { evenTicks } from "@/components/charts/sensor-chart";
import { ChartFrame, Legend, LegendItem } from "@/components/pdm/chart-frame";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";
import { useHvacAccount } from "@/lib/hvac/account";
import { csvTime, downloadCsv, fromLocalInput, toLocalInput } from "@/lib/hvac/csv";
import { loadRows, useHistory } from "@/lib/hvac/history";
import { DAY, HOUR, MIN, dayStart } from "@/lib/hvac/sim";
import { EMPTY_LAYOUT } from "@/lib/hvac/layout";
import { useLayout, useLive } from "@/lib/hvac/live";
import { SAMPLING_MINUTES, effectiveStep, isPointId, offeredPointsOf, pointById, pointGroups, sampleRows, type PointDef } from "@/lib/hvac/points";
import { PageTitle, deviceLabel } from "./common";

const MAX_POINTS = 6;
/** Set by Submit: the next view (remounted for the new query) moves focus to its results. */
let focusAfterApply = false;
const RANGES = ["today", "h24", "d7", "d30", "custom"] as const;
type RangeKey = (typeof RANGES)[number];
const DEFAULT_STEP: Record<RangeKey, number> = { today: 5, h24: 5, d7: 15, d30: 60, custom: 15 };

export function pointLabel(p: PointDef, m: Messages) {
  return `${deviceLabel(p.deviceId, m)} · ${m.hvac.points[p.key]}`;
}

// --- saved presets (this browser only) -------------------------------------------------------

interface Preset {
  name: string;
  points: string[];
  range: RangeKey;
  step: number;
}
const PRESET_KEY = "hvac-trend-presets";
const NO_PRESETS: Preset[] = [];
let presetCache: { raw: string | null; list: Preset[] } = { raw: null, list: NO_PRESETS };
const presetListeners = new Set<() => void>();

function readPresets(): Preset[] {
  const raw = localStorage.getItem(PRESET_KEY);
  if (raw !== presetCache.raw) {
    let list: Preset[] = NO_PRESETS;
    try {
      const parsed = JSON.parse(raw ?? "[]");
      if (Array.isArray(parsed)) list = parsed.filter((p) => p && typeof p.name === "string" && Array.isArray(p.points));
    } catch {
      list = NO_PRESETS;
    }
    presetCache = { raw, list };
  }
  return presetCache.list;
}

function writePresets(list: Preset[]) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  for (const l of presetListeners) l();
}

function usePresets(): Preset[] {
  return useSyncExternalStore(
    (l) => {
      presetListeners.add(l);
      window.addEventListener("storage", l);
      return () => {
        presetListeners.delete(l);
        window.removeEventListener("storage", l);
      };
    },
    readPresets,
    () => NO_PRESETS,
  );
}

// --- query --------------------------------------------------------------------------------------

interface TrendQuery {
  points: string[];
  range: RangeKey;
  step: number;
  from: number | null;
  to: number | null;
}

function parseQuery(params: URLSearchParams): TrendQuery {
  const points = (params.get("points") ?? "")
    .split(",")
    .filter(isPointId)
    .slice(0, MAX_POINTS);
  const rangeParam = params.get("range");
  const range: RangeKey = (RANGES as readonly string[]).includes(rangeParam ?? "") ? (rangeParam as RangeKey) : "h24";
  const stepParam = Number(params.get("step"));
  const step = (SAMPLING_MINUTES as readonly number[]).includes(stepParam) ? stepParam : DEFAULT_STEP[range];
  const from = Number(params.get("from")) || null;
  const to = Number(params.get("to")) || null;
  return { points, range, step, from, to };
}

function resolveRange(q: { range: RangeKey; from: number | null; to: number | null }, now: number): [number, number] {
  switch (q.range) {
    case "today":
      return [dayStart(now), now];
    case "d7":
      return [now - 7 * DAY, now];
    case "d30":
      return [now - 30 * DAY, now];
    case "custom":
      return [q.from ?? now - DAY, Math.min(q.to ?? now, now)];
    default:
      return [now - DAY, now];
  }
}

// --- point picker ---------------------------------------------------------------------------------

function PointPicker({ open, onOpenChange, selected, onChange, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; selected: string[]; onChange: (ids: string[]) => void; onApply: () => void }) {
  const layout = useLayout() ?? EMPTY_LAYOUT;
  const snap = useLive()?.snap;
  const { m } = useI18n();
  const t = m.hvac.trend;
  const focus = useDialogFocus();
  const uid = useId();
  const full = selected.length >= MAX_POINTS;
  const toggle = (id: string, on: boolean) => onChange(on ? [...selected, id].slice(0, MAX_POINTS) : selected.filter((x) => x !== id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" {...focus.contentProps}>
        <DialogHeader>
          <DialogTitle>{t.pointsTitle}</DialogTitle>
          <DialogDescription>{t.selected(selected.length, MAX_POINTS)}</DialogDescription>
        </DialogHeader>
        {full ? (
          <p role="status" className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
            <Info aria-hidden className="size-4 shrink-0" />
            {t.maxReached(MAX_POINTS)}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {pointGroups(layout).map((g) => (
            <section key={g.group} aria-labelledby={`${uid}-${g.group}`}>
              <h3 id={`${uid}-${g.group}`} className="mb-1.5 text-sm font-semibold">
                {m.hvac.report.categories[g.group]}
              </h3>
              <div className="flex flex-col gap-1.5">
                {g.devices.map((deviceId) => {
                  const pts = offeredPointsOf(deviceId, layout, snap, selected);
                  if (pts.length === 0) return null;
                  const count = pts.filter((p) => selected.includes(p.id)).length;
                  return (
                    <details key={deviceId} className="rounded-md border bg-muted/40" open={count > 0}>
                      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-medium">
                        {deviceLabel(deviceId, m)}
                        {count ? <span className="text-xs text-text-secondary">{t.selected(count, pts.length)}</span> : null}
                      </summary>
                      <ul className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                        {pts.map((p) => {
                          const checked = selected.includes(p.id);
                          const id = `${uid}-${p.id}`;
                          return (
                            <li key={p.id} className="flex min-h-8 items-center gap-2">
                              <Checkbox id={id} checked={checked} disabled={!checked && full} onCheckedChange={(v) => toggle(p.id, v === true)} />
                              <Label htmlFor={id} className="font-normal">
                                {m.hvac.points[p.key]}
                                {p.unit ? <span className="text-muted-foreground"> ({p.unit})</span> : null}
                              </Label>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <DialogFooter>
          {/* Choosing points is what the user came for: show them at once, no second Submit. */}
          <Button onClick={onApply}>{t.apply}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- charts ---------------------------------------------------------------------------------------

type Series = { def: PointDef; color: string; column: number };

function TrendChart({ title, series, rows, kind, span }: { title: string; series: Series[]; rows: { t: number; values: (number | null)[] }[]; kind: "analog" | "state"; span: number }) {
  const { m, f } = useI18n();
  const t = m.hvac.trend;
  const lanes = kind === "state";
  const data = useMemo(
    () =>
      rows.map((r) => {
        const o: Record<string, number | null> = { t: r.t };
        series.forEach((s, i) => {
          const v = r.values[s.column];
          o[s.def.id] = v === null ? null : lanes ? i + v * 0.7 : v;
        });
        return o;
      }),
    [rows, series, lanes],
  );
  const ticks = useMemo(() => evenTicks(rows.map((r) => r.t), 6), [rows]);
  const fmtTick = (v: number) => (span <= 36 * HOUR ? f.time(v) : f.shortDate(v));
  // As many decimals as the most precise point on the chart, so a narrow range (1.15–1.18 kW/Ton) keeps distinct ticks.
  const axisDigits = Math.max(0, ...series.map((s) => s.def.digits));
  const fmtValue = (s: Series, v: number | null) => (v === null ? "—" : s.def.kind === "state" ? (v ? m.hvac.device.on : m.hvac.device.off) : `${f.number(v, s.def.digits)}${s.def.unit ? ` ${s.def.unit}` : ""}`);
  const latest = (s: Series) => {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].values[s.column] !== null) return rows[i].values[s.column];
    return null;
  };
  const summary = t.summary(series.map((s) => `${pointLabel(s.def, m)} ${fmtValue(s, latest(s))}`));
  return (
    <ChartFrame
      title={title}
      headingLevel={2}
      summary={summary}
      legend={
        <Legend>
          {series.map((s) => (
            <LegendItem key={s.def.id} swatch={<LineSwatch color={s.color} />} label={`${pointLabel(s.def, m)} · ${t.latest} ${fmtValue(s, latest(s))}`} />
          ))}
        </Legend>
      }
      table={
        <Table>
          <caption className="sr-only">{title}</caption>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead scope="col">{t.time}</TableHead>
              {series.map((s) => (
                <TableHead key={s.def.id} scope="col" className="text-right">
                  {pointLabel(s.def, m)}
                  {s.def.unit ? ` (${s.def.unit})` : ""}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows].reverse().map((r) => (
              <TableRow key={r.t}>
                <TableCell className="tabular whitespace-nowrap">{f.dateTime(r.t)}</TableCell>
                {series.map((s) => (
                  <TableCell key={s.def.id} className="text-right tabular">
                    {fmtValue(s, r.values[s.column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <LineChart data={data} responsive style={{ width: "100%", height: lanes ? 70 + series.length * 34 : 260 }} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} title={title} desc={summary}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={fmtTick} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} minTickGap={24} />
        {lanes ? (
          <YAxis
            type="number"
            domain={[-0.15, series.length]}
            ticks={series.map((_, i) => i + 0.35)}
            tickFormatter={(v: number) => deviceLabel(series[Math.round(v - 0.35)]?.def.deviceId ?? "", m)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={88}
          />
        ) : (
          <YAxis domain={["auto", "auto"]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => f.number(v, axisDigits)} />
        )}
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, label }) => {
            if (!active || typeof label !== "number") return null;
            const row = rows.find((r) => r.t === label);
            if (!row) return null;
            return <TooltipCard title={f.weekdayDateTime(label)} rows={series.map((s) => ({ label: pointLabel(s.def, m), value: fmtValue(s, row.values[s.column]), swatch: <LineSwatch color={s.color} /> }))} />;
          }}
        />
        {series.map((s) => (
          <Line key={s.def.id} type={lanes ? "stepAfter" : "monotone"} dataKey={s.def.id} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name={pointLabel(s.def, m)} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

// --- view -----------------------------------------------------------------------------------------

function TrendBody({ query }: { query: TrendQuery }) {
  const { m, f } = useI18n();
  const t = m.hvac.trend;
  const router = useRouter();
  const pathname = usePathname();
  const presets = usePresets();
  const uid = useId();
  const [now] = useState(() => Date.now());
  const [points, setPoints] = useState(query.points);
  const [range, setRange] = useState<RangeKey>(query.range);
  const [step, setStep] = useState(query.step);
  const [fromInput, setFromInput] = useState(() => toLocalInput(query.from ?? now - DAY));
  const [toInput, setToInput] = useState(() => toLocalInput(query.to ?? now));
  const [presetName, setPresetName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [rangeError, setRangeError] = useState(false);
  const saveFocus = useDialogFocus();

  // Changes made in the form but not shown in the charts yet.
  const pending =
    points.join(",") !== query.points.join(",") ||
    range !== query.range ||
    step !== query.step ||
    (range === "custom" && (fromLocalInput(fromInput) !== query.from || fromLocalInput(toInput) !== query.to));
  // After Submit the view starts again from the new URL: move focus to what changed, not the top of the page.
  useEffect(() => {
    if (!focusAfterApply) return;
    focusAfterApply = false;
    (document.getElementById("trend-results") ?? document.getElementById("page-title"))?.focus();
  }, []);

  const [from, to] = resolveRange(query, now);
  const stepMs = effectiveStep(from, to, query.step);
  const layout = useLayout();
  const defs = useMemo(() => (layout ? query.points.map((id) => pointById(id, layout)).filter((p): p is PointDef => Boolean(p)) : []), [query.points, layout]);
  const project = useHvacAccount()?.project ?? null;
  const ids = defs.map((d) => d.id);
  const history = useHistory(
    defs.length ? `rows|${project}|${ids.join(",")}|${from}|${to}|${stepMs}` : null,
    () => loadRows(project, ids, from, to, stepMs, now),
    () => sampleRows(ids, from, to, stepMs, now),
  );
  const rows = useMemo(() => history.data ?? [], [history.data]);

  const groups = useMemo(() => {
    const map = new Map<string, Series[]>();
    defs.forEach((def, column) => {
      const key = def.kind === "state" ? "state" : def.unit || "pf";
      const list = map.get(key) ?? [];
      list.push({ def, column, color: `var(--chart-${column + 1})` });
      map.set(key, list);
    });
    return [...map.entries()];
  }, [defs]);

  function apply(next: { points: string[]; range: RangeKey; step: number }) {
    const qs = new URLSearchParams();
    if (next.points.length) qs.set("points", next.points.join(","));
    qs.set("range", next.range);
    qs.set("step", String(next.step));
    if (next.range === "custom") {
      const a = fromLocalInput(fromInput);
      const b = fromLocalInput(toInput);
      if (a === null || b === null || b <= a) {
        setRangeError(true);
        return;
      }
      qs.set("from", String(a));
      qs.set("to", String(b));
    }
    setRangeError(false);
    focusAfterApply = true;
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }

  function loadPreset(name: string) {
    setPresetName(name);
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    const pts = p.points.filter(isPointId).slice(0, MAX_POINTS);
    const r = (RANGES as readonly string[]).includes(p.range) ? p.range : "h24";
    setPoints(pts);
    setRange(r);
    setStep(p.step);
    apply({ points: pts, range: r, step: p.step });
  }

  function savePreset() {
    const name = draftName.trim();
    if (!name) return;
    writePresets([...presets.filter((p) => p.name !== name), { name, points, range: range === "custom" ? "h24" : range, step }]);
    setPresetName(name);
    setSaveOpen(false);
    toast.success(t.saved(name));
  }

  function deletePreset() {
    if (!presetName) return;
    writePresets(presets.filter((p) => p.name !== presetName));
    toast.success(t.deleted(presetName));
    setPresetName("");
  }

  function download() {
    const header = [t.time, ...defs.map((d) => `${pointLabel(d, m)}${d.unit ? ` (${d.unit})` : ""}`)];
    downloadCsv(`trend-${csvTime(now).replace(/[: ]/g, "-")}.csv`, [header, ...rows.map((r) => [csvTime(r.t), ...r.values.map((v, i) => (v === null ? null : Number(v.toFixed(defs[i].digits))))])]);
  }

  const id = (s: string) => `${uid}-${s}`;
  return (
    <>
      <PageTitle>{m.hvac.titles.trend}</PageTitle>
      <section aria-label={t.range} className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          {/* What to show: the points, the period and the sampling, then Submit. */}
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" className="h-10" onClick={() => setPickerOpen(true)}>
              <ListChecks aria-hidden />
              {t.points}
            </Button>
            <div className="grid gap-1.5">
              <Label htmlFor={id("range")}>{t.range}</Label>
              <Select
                value={range}
                onValueChange={(v) => {
                  setRange(v as RangeKey);
                  setStep(DEFAULT_STEP[v as RangeKey]);
                }}
              >
                <SelectTrigger id={id("range")} className="data-[size=default]:h-10 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t.ranges[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {range === "custom" ? (
              <>
                <div className="grid w-full gap-1.5 sm:w-auto">
                  <Label htmlFor={id("from")}>{t.from}</Label>
                  <Input id={id("from")} type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="h-10 w-full sm:w-56" aria-invalid={rangeError || undefined} aria-describedby={rangeError ? id("range-err") : undefined} />
                </div>
                <div className="grid w-full gap-1.5 sm:w-auto">
                  <Label htmlFor={id("to")}>{t.to}</Label>
                  <Input id={id("to")} type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} className="h-10 w-full sm:w-56" aria-invalid={rangeError || undefined} aria-describedby={rangeError ? id("range-err") : undefined} />
                </div>
              </>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={id("step")}>{t.sampling}</Label>
              <Select value={String(step)} onValueChange={(v) => setStep(Number(v))}>
                <SelectTrigger id={id("step")} className="data-[size=default]:h-10 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLING_MINUTES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {t.minutes(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="h-10" onClick={() => apply({ points, range, step })} aria-describedby={pending ? id("pending") : undefined}>
              {t.apply}
            </Button>
          </div>
          <span aria-hidden className="hidden h-10 w-px bg-border xl:block" />
          {/* Saved views of this browser. */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid w-full gap-1.5 sm:w-auto">
              <Label htmlFor={id("preset")}>{t.preset}</Label>
              <Select value={presetName} onValueChange={loadPreset}>
                <SelectTrigger id={id("preset")} className="data-[size=default]:h-10 w-full sm:w-52">
                  <SelectValue placeholder={t.presetNone} />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="h-10"
              disabled={!points.length}
              onClick={() => {
                setDraftName(presetName);
                setSaveOpen(true);
              }}
            >
              <Save aria-hidden />
              {t.save}
            </Button>
            <Button variant="outline" className="h-10" disabled={!presetName} onClick={deletePreset}>
              <Trash2 aria-hidden />
              {t.delete}
            </Button>
          </div>
        </div>
        <p id={id("pending")} role="status" className={pending ? "mt-2 flex items-center gap-1.5 text-sm font-medium text-warning-fg" : "sr-only"}>
          {pending ? (
            <>
              <span aria-hidden className="size-2 rounded-full bg-warning" />
              {t.pending}
            </>
          ) : null}
        </p>
        {rangeError ? (
          <p id={id("range-err")} role="alert" className="mt-2 text-sm text-critical-fg">
            {t.invalidRange}
          </p>
        ) : null}
        {points.length ? (
          <ul aria-label={t.selected(points.length, MAX_POINTS)} className="mt-3 flex flex-wrap gap-2">
            {points.map((pid, i) => {
              const def = layout ? pointById(pid, layout) : undefined;
              return (
                <li key={pid} className="inline-flex items-center gap-1.5 rounded-full border bg-muted py-0.5 pr-1 pl-2.5 text-xs">
                  <LineSwatch color={`var(--chart-${i + 1})`} />
                  {def ? pointLabel(def, m) : pid}
                  <button type="button" onClick={() => setPoints(points.filter((x) => x !== pid))} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-accent" aria-label={t.remove(def ? pointLabel(def, m) : pid)}>
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <div className="mt-5 flex flex-col gap-4">
        {defs.length === 0 ? (
          <EmptyState
            icon={LineChartIcon}
            title={t.empty}
            description={t.emptyDesc}
            action={
              <Button onClick={() => setPickerOpen(true)}>
                <ListChecks aria-hidden />
                {t.points}
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="trend-results" tabIndex={-1} className="text-sm text-text-secondary outline-none">
                {f.dateTime(from)} – {f.dateTime(to)} · {t.minutes(Math.round(stepMs / MIN))}
              </p>
              <Button variant="outline" size="sm" onClick={download}>
                <Download aria-hidden />
                {t.download}
              </Button>
            </div>
            {stepMs > query.step * MIN ? (
              <p className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
                <Info aria-hidden className="size-4 shrink-0" />
                {t.coarsened(Math.round(stepMs / MIN))}
              </p>
            ) : null}
            {history.error ? (
              <ErrorState onRetry={history.retry} compact />
            ) : history.loading ? (
              <LoadingBlock label={m.hvac.shell.loading} lines={6} className="rounded-lg border bg-card p-4" />
            ) : null}
            {history.loading || history.error ? null : groups.map(([key, series]) => (
              <TrendChart
                key={key}
                title={key === "state" ? t.stateChart : key === "pf" ? t.pfChart : t.unitChart(key)}
                series={series}
                rows={rows}
                kind={key === "state" ? "state" : "analog"}
                span={to - from}
              />
            ))}
          </>
        )}
      </div>

      <PointPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={points}
        onChange={setPoints}
        onApply={() => {
          setPickerOpen(false);
          apply({ points, range, step });
        }}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent {...saveFocus.contentProps}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePreset();
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>{t.saveConfirm}</DialogTitle>
              <DialogDescription>{t.selected(points.length, MAX_POINTS)}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={id("name")}>{t.savePrompt}</Label>
              <Input id={id("name")} value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={t.savePlaceholder} maxLength={40} className="h-10" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                {m.common.cancel}
              </Button>
              <Button type="submit" disabled={!draftName.trim()}>
                {t.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TrendView() {
  const params = useSearchParams();
  const key = params.toString();
  const query = useMemo(() => parseQuery(new URLSearchParams(key)), [key]);
  // Remount on every new query so the form starts from what is shown and "now" is re-read.
  return <TrendBody key={key} query={query} />;
}
