"use client";

// Alarm Active (live, with acknowledge) and Alarm Logs (history for a chosen period).

import { useEffect, useId, useMemo, useState } from "react";
import { BellOff, CheckCheck, CircleCheck, Download, History } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/pdm/status";
import { EmptyState, SkeletonCard } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import { useNow } from "@/lib/use-query";
import { alarmLog, MAX_LOG_DAYS } from "@/lib/hvac/alarms";
import { csvTime, downloadCsv, fromLocalInput, toLocalInput } from "@/lib/hvac/csv";
import type { AlarmSeverity, HvacAlarm } from "@/lib/hvac/model";
import { acknowledge, useAcked, useLive } from "@/lib/hvac/live";
import { DAY } from "@/lib/hvac/sim";
import { PageTitle, SeverityBadge, deviceLabel } from "./common";

function useAlarmText() {
  const { m, f } = useI18n();
  return (a: HvacAlarm, peak = false) => {
    const name = m.hvac.alarms.names[a.code];
    if (a.value === undefined) return { name, detail: null };
    const digits = a.unit === "kW/Ton" ? 2 : a.unit === "%RH" ? 0 : 1;
    const v = `${f.number(a.value, digits)} ${a.unit}`;
    return { name, detail: peak ? m.hvac.alarms.peak(v) : m.hvac.alarms.reading(v) };
  };
}

function ActiveAlarms() {
  const { m, f } = useI18n();
  const t = m.hvac.alarms;
  const live = useLive();
  const acked = useAcked();
  const now = useNow(30_000);
  const text = useAlarmText();
  const alarms = live?.alarms ?? [];
  const unacked = alarms.filter((a) => !acked.has(a.id));
  // The Acknowledge button disappears once used, so focus moves on: next row's button, else the heading.
  const [focusNext, setFocusNext] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (focusNext) (document.getElementById(focusNext.id) ?? document.getElementById("page-title"))?.focus();
  }, [focusNext]);

  function ack(ids: string[]) {
    const rest = unacked.filter((a) => !ids.includes(a.id));
    const after = ids.length === 1 ? rest.find((a) => alarms.indexOf(a) > alarms.findIndex((x) => x.id === ids[0])) ?? rest[0] : undefined;
    acknowledge(ids);
    setFocusNext({ id: after ? `ack-${after.id}` : "page-title" });
    toast.success(t.acked(ids.length));
  }

  return (
    <>
      <PageTitle
        actions={
          unacked.length > 1 ? (
            <Button onClick={() => ack(unacked.map((a) => a.id))}>
              <CheckCheck aria-hidden />
              {t.ackAll}
            </Button>
          ) : null
        }
      >
        {m.hvac.titles.alarms}
      </PageTitle>
      {!live ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">{m.hvac.shell.loading}</span>
          <SkeletonCard height="h-64" />
        </div>
      ) : alarms.length === 0 ? (
        <EmptyState icon={BellOff} title={t.none} description={t.noneDesc} className="min-h-96" />
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="page-title" className="relative overflow-x-auto rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">{t.tableCaption(m.hvac.titles.alarms)}</caption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{t.cols.datetime}</TableHead>
                <TableHead scope="col">{t.cols.device}</TableHead>
                <TableHead scope="col">{t.cols.name}</TableHead>
                <TableHead scope="col">{t.cols.severity}</TableHead>
                <TableHead scope="col">{t.cols.state}</TableHead>
                <TableHead scope="col">{t.cols.duration}</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">{t.cols.action}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alarms.map((a) => {
                const isAcked = acked.has(a.id);
                const { name, detail } = text(a);
                const device = deviceLabel(a.deviceId, m);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap tabular">{f.weekdayDateTime(a.start)}</TableCell>
                    <TableCell className="font-semibold whitespace-nowrap">{device}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{name}</span>
                      {detail ? <span className="block text-xs text-text-secondary tabular">{detail}</span> : null}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={a.severity} size="sm" />
                    </TableCell>
                    <TableCell>
                      {isAcked ? <Chip tone="neutral" icon={CircleCheck} label={t.states.acked} size="sm" /> : <span className="text-sm font-semibold text-warning-fg">{t.states.unacked}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular">{f.duration(Math.max(0, now - a.start))}</TableCell>
                    <TableCell className="text-right">
                      {isAcked ? null : (
                        <Button id={`ack-${a.id}`} size="sm" variant="outline" onClick={() => ack([a.id])} aria-label={t.ackLabel(name, device)}>
                          {t.ack}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function AlarmLogs() {
  const { m, f } = useI18n();
  const t = m.hvac.alarms;
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const text = useAlarmText();
  const [now] = useState(() => Date.now());
  const [fromInput, setFromInput] = useState(() => toLocalInput(now - DAY));
  const [toInput, setToInput] = useState(() => toLocalInput(now));
  const [severity, setSeverity] = useState<"all" | AlarmSeverity>("all");
  const [query, setQuery] = useState({ from: now - DAY, to: now, severity: "all" as "all" | AlarmSeverity });
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => alarmLog(query.from, query.to, now).filter((a) => query.severity === "all" || a.severity === query.severity), [query, now]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const from = fromLocalInput(fromInput);
    const to = fromLocalInput(toInput);
    if (from === null || to === null || to <= from) return setError(m.hvac.report.invalidRange);
    if (to - from > MAX_LOG_DAYS * DAY) return setError(m.hvac.report.tooLong(MAX_LOG_DAYS));
    setError(null);
    setQuery({ from, to, severity });
  }

  function download() {
    downloadCsv(`alarm-log-${csvTime(query.from).slice(0, 10)}-${csvTime(query.to).slice(0, 10)}.csv`, [
      [t.cols.datetime, t.cols.device, t.cols.name, t.cols.severity, t.cols.state, t.cols.cleared, t.cols.duration],
      ...rows.map((a) => {
        const { name, detail } = text(a, true);
        return [
          csvTime(a.start),
          deviceLabel(a.deviceId, m),
          detail ? `${name} (${detail})` : name,
          t.severity[a.severity],
          a.end === null ? t.ongoing : t.states.cleared,
          a.end === null ? null : csvTime(a.end),
          f.duration((a.end ?? Date.now()) - a.start),
        ];
      }),
    ]);
  }

  return (
    <>
      <PageTitle>{m.hvac.titles.alarmLogs}</PageTitle>
      <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor={id("from")}>{m.hvac.report.from}</Label>
          <Input id={id("from")} type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="h-10 w-52" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("to")}>{m.hvac.report.to}</Label>
          <Input id={id("to")} type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} className="h-10 w-52" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("sev")}>{t.filterSeverity}</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as "all" | AlarmSeverity)}>
            <SelectTrigger id={id("sev")} className="data-[size=default]:h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.all}</SelectItem>
              <SelectItem value="critical">{t.severity.critical}</SelectItem>
              <SelectItem value="warning">{t.severity.warning}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="h-10">
          {m.hvac.report.submit}
        </Button>
        {error ? (
          <p id={id("err")} role="alert" className="basis-full text-sm text-critical-fg">
            {error}
          </p>
        ) : null}
      </form>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary" aria-live="polite">
          {m.hvac.report.period(f.dateTime(query.from), f.dateTime(query.to))} · {t.count(rows.length)}
        </p>
        {rows.length ? (
          <Button variant="outline" size="sm" onClick={download}>
            <Download aria-hidden />
            {m.hvac.report.download}
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={History} title={t.logsEmpty} description={t.logsEmptyDesc} className="min-h-80" />
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="page-title" className="relative max-h-[40rem] overflow-auto rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">{t.tableCaption(m.hvac.titles.alarmLogs)}</caption>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{t.cols.datetime}</TableHead>
                <TableHead scope="col">{t.cols.device}</TableHead>
                <TableHead scope="col">{t.cols.name}</TableHead>
                <TableHead scope="col">{t.cols.severity}</TableHead>
                <TableHead scope="col">{t.cols.state}</TableHead>
                <TableHead scope="col">{t.cols.cleared}</TableHead>
                <TableHead scope="col">{t.cols.duration}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const { name, detail } = text(a, true);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap tabular">{f.weekdayDateTime(a.start)}</TableCell>
                    <TableCell className="font-semibold whitespace-nowrap">{deviceLabel(a.deviceId, m)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{name}</span>
                      {detail ? <span className="block text-xs text-text-secondary tabular">{detail}</span> : null}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={a.severity} size="sm" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{a.end === null ? <span className="font-semibold text-warning-fg">{t.ongoing}</span> : t.states.cleared}</TableCell>
                    <TableCell className="whitespace-nowrap tabular">{a.end === null ? "—" : f.weekdayDateTime(a.end)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular">{f.duration((a.end ?? now) - a.start)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

export function AlarmsView({ mode }: { mode: "active" | "logs" }) {
  return mode === "active" ? <ActiveAlarms /> : <AlarmLogs />;
}
