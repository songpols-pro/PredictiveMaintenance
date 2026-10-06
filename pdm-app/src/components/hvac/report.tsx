"use client";

// Report: device list on the right (as in the mock-up), a period and sampling, then a summary,
// the data table and a CSV download. "Energy" adds a daily kWh table per power meter.

import { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import { csvTime, downloadCsv, fromLocalInput, toLocalInput } from "@/lib/hvac/csv";
import { METERS } from "@/lib/hvac/model";
import { DAY, MIN, dayStart, energyBetween } from "@/lib/hvac/sim";
import { POINT_GROUPS, SAMPLING_MINUTES, effectiveStep, pointById, pointsOf, sampleRows, type PointDef, type SampleRow } from "@/lib/hvac/points";
import { PageTitle, deviceLabel } from "./common";
import { pointLabel } from "./trend";

const MAX_DAYS = 31;
const PAGE = 50;

interface Result {
  from: number;
  to: number;
  step: number;
  defs: PointDef[];
  rows: SampleRow[];
  energy: { day: number; kwh: Record<string, number> }[] | null;
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
  const [page, setPage] = useState(0);

  const toggle = (pid: string, on: boolean) => setSelected((s) => (on ? [...s, pid] : s.filter((x) => x !== pid)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
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
    const defs = selected.map(pointById).filter((p): p is PointDef => Boolean(p));
    const s = effectiveStep(from, end, step);
    const rows = defs.length ? sampleRows(defs.map((d) => d.id), from, end, s) : [];
    let daily: Result["energy"] = null;
    if (energy) {
      daily = [];
      for (let d = dayStart(from); d < end; d += DAY) {
        const a = Math.max(d, from);
        const b = Math.min(d + DAY, end);
        daily.push({ day: d, kwh: Object.fromEntries(METERS.map((mt) => [mt.id, energyBetween(mt.id, a, b)])) });
      }
    }
    setResult({ from, to: end, step: s, defs, rows, energy: daily });
    setPage(0);
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
      out.push([t.day, ...METERS.map((mt) => `${mt.label} (kWh)`), `${t.total} (kWh)`]);
      for (const d of result.energy) {
        const vals = METERS.map((mt) => Math.round(d.kwh[mt.id]));
        out.push([csvTime(d.day).slice(0, 10), ...vals, vals.reduce((a, b) => a + b, 0)]);
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
              {POINT_GROUPS.map((g) => (
                <details key={g.group} className="rounded-md bg-muted">
                  <summary className="flex min-h-10 cursor-pointer items-center justify-center px-3 py-2 font-medium">{t.categories[g.group]}</summary>
                  <div className="flex flex-col gap-1.5 px-2 pb-2">
                    {g.devices.map((deviceId) => {
                      const n = pointsOf(deviceId).filter((p) => selected.includes(p.id)).length;
                      return (
                        <details key={deviceId} className="rounded-md bg-card" open={g.devices.length === 1}>
                          <summary className="flex min-h-9 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm font-semibold">
                            {deviceLabel(deviceId, m)}
                            {n ? <span className="text-xs font-normal text-text-secondary">{t.selected(n)}</span> : null}
                          </summary>
                          <fieldset className="px-3 pb-2">
                            <legend className="sr-only">{deviceLabel(deviceId, m)}</legend>
                            <ul className="grid gap-1">
                              {pointsOf(deviceId).map((p) => {
                                const cid = id(p.id);
                                return (
                                  <li key={p.id} className="flex min-h-7 items-center gap-2">
                                    <Checkbox id={cid} checked={selected.includes(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
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
              <details className="rounded-md bg-muted">
                <summary className="flex min-h-10 cursor-pointer items-center justify-center px-3 py-2 font-medium">{t.categories.energy}</summary>
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
            <Button type="submit" className="h-11 text-base" disabled={count === 0}>
              {t.submit}
            </Button>
          </fieldset>
        </form>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          {!result ? (
            <EmptyState icon={FileSpreadsheet} title={t.empty} description={t.emptyDesc} className="min-h-80" />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-secondary" aria-live="polite">
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
                              {mt.label}
                            </TableHead>
                          ))}
                          <TableHead scope="col" className="text-right">{t.total}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.energy.map((d) => {
                          const vals = METERS.map((mt) => d.kwh[mt.id]);
                          return (
                            <TableRow key={d.day}>
                              <TableHead scope="row" className="font-medium tabular">{f.date(d.day)}</TableHead>
                              {vals.map((v, i) => (
                                <TableCell key={METERS[i].id} className="text-right tabular">{f.number(v)}</TableCell>
                              ))}
                              <TableCell className="text-right font-semibold tabular">{f.number(vals.reduce((a, b) => a + b, 0))}</TableCell>
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
