"use client";

// Report: device list on the right (as in the mock-up), a period and sampling, then a summary,
// the data table and a CSV download. "Energy" adds a daily kWh table per power meter.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Info, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import { csvTime, downloadCsv, fromLocalInput, toLocalInput } from "@/lib/hvac/csv";
import { EMPTY_LAYOUT } from "@/lib/hvac/layout";
import { useLayout, useLive } from "@/lib/hvac/live";
import { useHvacAccount } from "@/lib/hvac/account";
import { loadEnergy, loadRows } from "@/lib/hvac/history";
import { DAY, MIN, dayStart } from "@/lib/hvac/sim";
import { MAX_HISTORY_POINTS, SAMPLING_MINUTES, effectiveStep, offeredPointsOf, pointById, pointGroups, type PointDef, type SampleRow } from "@/lib/hvac/points";
import { PageTitle, deviceLabel } from "./common";
import { pointLabel } from "./trend";

const MAX_DAYS = 31;

/** A category of the device list: its name, then how many are chosen in it and whether it is open. */
const CATEGORY = "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden";

/** Right side of a list heading: the number chosen inside, and a chevron that turns when it opens. */
function Opens({ group, count }: { group: "cat" | "dev"; count: number }) {
  const { m } = useI18n();
  return (
    <span className="flex shrink-0 items-center gap-2">
      {count ? <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground tabular">{m.hvac.report.selected(count)}</span> : null}
      <ChevronDown aria-hidden className={group === "cat" ? "size-4 transition-transform group-open/cat:rotate-180 motion-reduce:transition-none" : "size-4 transition-transform group-open/dev:rotate-180 motion-reduce:transition-none"} />
    </span>
  );
}
const PAGE = 50;

interface Result {
  from: number;
  to: number;
  step: number;
  defs: PointDef[];
  rows: SampleRow[];
  /** kWh per meter and day; null where a counter reading is missing. */
  energy: { day: number; kwh: Record<string, number | null> }[] | null;
}

function stats(rows: SampleRow[], col: number) {
  const vals = rows.map((r) => r.values[col]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, last: vals[vals.length - 1] };
}

export function ReportView() {
  const { m, f } = useI18n();
  const t = m.hvac.report;
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const [now] = useState(() => Date.now());
  const [selected, setSelected] = useState<string[]>([]);
  const [energy, setEnergy] = useState(false);
  const [fromInput, setFromInput] = useState(() => toLocalInput(dayStart(now) - DAY));
  const [toInput, setToInput] = useState(() => toLocalInput(dayStart(now)));
  const [step, setStep] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const resultsRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (result) resultsRef.current?.focus();
  }, [result]);
  const [page, setPage] = useState(0);
  const [working, setWorking] = useState(false);
  const project = useHvacAccount()?.project ?? null;
  const layout = useLayout() ?? EMPTY_LAYOUT;
  const snap = useLive()?.snap;
  const METERS = layout.meters;

  // The history API answers at most MAX_HISTORY_POINTS points per request: further boxes are disabled.
  const full = selected.length >= MAX_HISTORY_POINTS;
  const toggle = (pid: string, on: boolean) => setSelected((s) => (on ? [...s, pid].slice(0, MAX_HISTORY_POINTS) : s.filter((x) => x !== pid)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    const from = fromLocalInput(fromInput);
    const to = fromLocalInput(toInput);
    if (from === null || to === null || to <= from) {
      setError(t.invalidRange);
      return;
    }
    if (to - from > MAX_DAYS * DAY) {
      setError(t.tooLong(MAX_DAYS));
      return;
    }
    setError(null);
    const end = Math.min(to, Date.now());
    const defs = selected.map((id) => pointById(id, layout)).filter((p): p is PointDef => Boolean(p));
    const s = effectiveStep(from, end, step);
    setWorking(true);
    try {
      const days: number[] = [];
      for (let d = dayStart(from); d < end; d += DAY) days.push(d);
      const [rows, kwh] = await Promise.all([
        defs.length ? loadRows(project, defs.map((d) => d.id), from, end, s) : Promise.resolve([]),
        energy ? loadEnergy(project, METERS.map((mt) => mt.id), days.map((d): [number, number] => [Math.max(d, from), Math.min(d + DAY, end)])) : Promise.resolve(null),
      ]);
      const daily: Result["energy"] = kwh ? days.map((day, i) => ({ day, kwh: Object.fromEntries(METERS.map((mt) => [mt.id, kwh[mt.id][i]])) })) : null;
      setResult({ from, to: end, step: s, defs, rows, energy: daily });
      setPage(0);
    } catch {
      setError(m.states.errorTitle);
    } finally {
      setWorking(false);
    }
  }

  const pages = result ? Math.max(1, Math.ceil(result.rows.length / PAGE)) : 1;
  const pageRows = useMemo(() => (result ? result.rows.slice(page * PAGE, page * PAGE + PAGE) : []), [result, page]);
  const count = selected.length + (energy ? 1 : 0);

  function download() {
    if (!result) return;
    const out: (string | number | null)[][] = [];
    if (result.defs.length) {
      out.push([t.time, ...result.defs.map((d) => `${pointLabel(d, m)}${d.unit ? ` (${d.unit})` : ""}`)]);
      for (const r of result.rows) out.push([csvTime(r.t), ...r.values.map((v, i) => (v === null ? null : Number(v.toFixed(result.defs[i].digits))))]);
    }
    if (result.energy) {
      if (out.length) out.push([]);
      out.push([t.day, ...METERS.map((mt) => `${mt.label ?? mt.name} (kWh)`), `${t.total} (kWh)`]);
      for (const d of result.energy) {
        const vals = METERS.map((mt) => d.kwh[mt.id]);
        const known = vals.filter((v): v is number => v !== null);
        out.push([csvTime(d.day).slice(0, 10), ...vals.map((v) => (v === null ? null : Math.round(v))), known.length === vals.length ? Math.round(known.reduce((a, b) => a + b, 0)) : null]);
      }
    }
    downloadCsv(`report-${csvTime(result.from).slice(0, 10)}-${csvTime(result.to).slice(0, 10)}.csv`, out);
  }

  return (
    <>
      <PageTitle>{m.hvac.titles.report}</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg border bg-card p-3 lg:order-2" aria-labelledby={id("devices")}>
          <div>
            <h2 id={id("devices")} className="mb-2 text-center font-semibold">
              {t.devices}
            </h2>
            <div className="flex flex-col gap-1.5">
              {pointGroups(layout).map((g) => (
                <details key={g.group} className="group/cat rounded-md bg-muted">
                  <summary className={CATEGORY}>
                    <span>{t.categories[g.group]}</span>
                    <Opens group="cat" count={selected.filter((pid) => g.devices.includes(pid.slice(0, pid.lastIndexOf(".")))).length} />
                  </summary>
                  <div className="flex flex-col gap-1.5 px-2 pb-2">
                    {g.devices.map((deviceId) => {
                      // Only what the device reports; a point already selected stays listed so it can be removed.
                      const pts = offeredPointsOf(deviceId, layout, snap, selected);
                      if (pts.length === 0) return null;
                      const n = pts.filter((p) => selected.includes(p.id)).length;
                      return (
                        <details key={deviceId} className="group/dev rounded-md bg-card" open={g.devices.length === 1}>
                          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                            <span>{deviceLabel(deviceId, m)}</span>
                            <Opens group="dev" count={n} />
                          </summary>
                          <fieldset className="px-3 pb-2">
                            <legend className="sr-only">{deviceLabel(deviceId, m)}</legend>
                            <ul className="grid gap-1">
                              {pts.map((p) => {
                                const cid = id(p.id);
                                const checked = selected.includes(p.id);
                                return (
                                  <li key={p.id} className="flex min-h-7 items-center gap-2">
                                    <Checkbox id={cid} checked={checked} disabled={!checked && full} onCheckedChange={(v) => toggle(p.id, v === true)} />
                                    <Label htmlFor={cid} className="text-sm font-normal">
                                      {m.hvac.points[p.key]}
                                      {p.unit ? <span className="text-muted-foreground"> ({p.unit})</span> : null}
                                    </Label>
                                  </li>
                                );
                              })}
                            </ul>
                          </fieldset>
                        </details>
                        );
                    })}
                  </div>
                </details>
              ))}
              <details className="group/cat rounded-md bg-muted">
                <summary className={CATEGORY}>
                  <span>{t.categories.energy}</span>
                  <Opens group="cat" count={energy ? 1 : 0} />
                </summary>
                <div className="flex min-h-7 items-center gap-2 px-3 pb-3">
                  <Checkbox id={id("energy")} checked={energy} onCheckedChange={(v) => setEnergy(v === true)} />
                  <Label htmlFor={id("energy")} className="text-sm font-normal">
                    {t.energyDaily}
                  </Label>
                </div>
              </details>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
              <span aria-live="polite">{t.selected(count)}</span>
              {count ? (
                <button
                  type="button"
                  className="min-h-6 font-semibold text-link underline underline-offset-2"
                  onClick={() => {
                    setSelected([]);
                    setEnergy(false);
                  }}
                >
                  {t.clear}
                </button>
              ) : null}
            </div>
            {full ? (
              <p role="status" className="mt-2 flex items-start gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t.maxReached(MAX_HISTORY_POINTS)}
              </p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-3 border-t pt-3">
            <legend className="sr-only">{t.date}</legend>
            <p aria-hidden className="text-center font-semibold">
              {t.date}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor={id("from")}>{t.from}</Label>
              <Input id={id("from")} type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="h-10" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={id("to")}>{t.to}</Label>
              <Input id={id("to")} type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} className="h-10" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={id("step")}>{t.sampling}</Label>
              <Select value={String(step)} onValueChange={(v) => setStep(Number(v))}>
                <SelectTrigger id={id("step")} className="data-[size=default]:h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLING_MINUTES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {m.hvac.trend.minutes(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p id={id("err")} role="alert" className="text-sm text-critical-fg">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="h-11 text-base" disabled={count === 0} aria-disabled={working || undefined}>
              {working ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
              {t.submit}
            </Button>
            <p role="status" className="sr-only">
              {working ? m.hvac.shell.loading : ""}
            </p>
          </fieldset>
        </form>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          {!result ? (
            <EmptyState icon={FileSpreadsheet} title={t.empty} description={t.emptyDesc} className="min-h-80" />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p ref={resultsRef} tabIndex={-1} className="scroll-mt-20 text-sm text-text-secondary outline-none" aria-live="polite">
                  {t.period(f.dateTime(result.from), f.dateTime(result.to))} · {m.hvac.trend.minutes(Math.round(result.step / MIN))} · {t.rows(result.rows.length)}
                </p>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download aria-hidden />
                  {t.download}
                </Button>
              </div>

              {result.defs.length ? (
                <section className="rounded-lg border bg-card p-4">
                  <h2 id={id("sum")} className="mb-2 font-semibold">
                    {t.summary}
                  </h2>
                  <div tabIndex={0} role="region" aria-labelledby={id("sum")} className="relative overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">{t.point}</TableHead>
                          <TableHead scope="col">{t.unit}</TableHead>
                          <TableHead scope="col" className="text-right">{t.min}</TableHead>
                          <TableHead scope="col" className="text-right">{t.avg}</TableHead>
                          <TableHead scope="col" className="text-right">{t.max}</TableHead>
                          <TableHead scope="col" className="text-right">{t.last}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.defs.map((d, i) => {
                          const s = stats(result.rows, i);
                          const v = (x: number | undefined) => (x === undefined ? "—" : f.number(x, d.digits));
                          return (
                            <TableRow key={d.id}>
                              <TableHead scope="row" className="font-medium">
                                {pointLabel(d, m)}
                              </TableHead>
                              <TableCell>{d.unit || "—"}</TableCell>
                              <TableCell className="text-right tabular">{v(s?.min)}</TableCell>
                              <TableCell className="text-right tabular">{v(s?.avg)}</TableCell>
                              <TableCell className="text-right tabular">{v(s?.max)}</TableCell>
                              <TableCell className="text-right tabular">{v(s?.last)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ) : null}

              {result.energy ? (
                <section className="rounded-lg border bg-card p-4">
                  <h2 id={id("energy-title")} className="mb-2 font-semibold">
                    {t.energyDaily}
                  </h2>
                  <div tabIndex={0} role="region" aria-labelledby={id("energy-title")} className="relative overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">{t.day}</TableHead>
                          {METERS.map((mt) => (
                            <TableHead key={mt.id} scope="col" className="text-right">
                              {mt.label ?? mt.name}
                            </TableHead>
                          ))}
                          <TableHead scope="col" className="text-right">{t.total}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.energy.map((d) => {
                          const vals = METERS.map((mt) => d.kwh[mt.id]);
                          const total = vals.every((v) => v !== null) ? vals.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
                          return (
                            <TableRow key={d.day}>
                              <TableHead scope="row" className="font-medium tabular">{f.date(d.day)}</TableHead>
                              {vals.map((v, i) => (
                                <TableCell key={METERS[i].id} className="text-right tabular">{v === null ? "—" : f.number(v)}</TableCell>
                              ))}
                              <TableCell className="text-right font-semibold tabular">{total === null ? "—" : f.number(total)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ) : null}

              {result.defs.length ? (
                <section className="rounded-lg border bg-card p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 id={id("data")} className="font-semibold">
                      {t.data}
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="size-9" aria-label={t.prev} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeft aria-hidden />
                      </Button>
                      <span className="text-sm text-text-secondary tabular" aria-live="polite">
                        {t.page(page + 1, pages)}
                      </span>
                      <Button variant="outline" size="icon" className="size-9" aria-label={t.next} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRight aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div tabIndex={0} role="region" aria-labelledby={id("data")} className="relative max-h-[32rem] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                          <TableHead scope="col">{t.time}</TableHead>
                          {result.defs.map((d) => (
                            <TableHead key={d.id} scope="col" className="text-right">
                              {pointLabel(d, m)}
                              {d.unit ? ` (${d.unit})` : ""}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => (
                          <TableRow key={r.t}>
                            <TableHead scope="row" className="font-normal whitespace-nowrap tabular">{f.dateTime(r.t)}</TableHead>
                            {r.values.map((v, i) => (
                              <TableCell key={result.defs[i].id} className="text-right tabular">
                                {v === null ? "—" : f.number(v, result.defs[i].digits)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
