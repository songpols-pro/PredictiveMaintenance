"use client";

// Alarm Active (live, with acknowledge) and Alarm Logs (history for a chosen period).

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { BellOff, BellRing, CheckCheck, CircleCheck, Download, History } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/pdm/status";
import { EmptyState, ErrorState, LoadingBlock, SkeletonCard } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useMediaQuery, useNow } from "@/lib/use-query";
import { useHvacAccount } from "@/lib/hvac/account";
import { alarmLog, MAX_LOG_DAYS } from "@/lib/hvac/alarms";
import { loadAlarmLog, useHistory } from "@/lib/hvac/history";
import { csvTime, downloadCsv, fromLocalInput, toLocalInput } from "@/lib/hvac/csv";
import type { AlarmCode, AlarmSeverity, HvacAlarm } from "@/lib/hvac/model";
import { acknowledge, useAcked, useLive, type Ack } from "@/lib/hvac/live";
import { DAY } from "@/lib/hvac/sim";
import { PageTitle, SeverityBadge, deviceLabel } from "./common";

export function useAlarmText() {
  const { m, f, locale } = useI18n();
  return (a: HvacAlarm, peak = false) => {
    // Fault alarms from a register profile bring their own names; built-in codes use the messages.
    const name = a.label ? a.label[locale] : (m.hvac.alarms.names[a.code as AlarmCode] ?? a.code);
    if (a.value === undefined) return { name, detail: null };
    const digits = a.unit === "kW/Ton" ? 2 : a.unit === "%RH" ? 0 : 1;
    const v = `${f.number(a.value, digits)} ${a.unit}`;
    return { name, detail: peak ? m.hvac.alarms.peak(v) : m.hvac.alarms.reading(v) };
  };
}

/** "who, when" of an acknowledgement (who is unknown in the simulation, which has no sign-in). */
export function useAckText() {
  const { m, f } = useI18n();
  return (ack: Ack) => m.hvac.alarms.ackedBy(ack.by ?? null, f.dateTime(ack.at));
}

/** Who acknowledged (the account, wrapped anywhere) above when, in a table cell (cells do not wrap). */
function AckNote({ ack, className }: { ack: Ack; className?: string }) {
  const { f } = useI18n();
  return (
    <span className={className}>
      {ack.by ? <span className="block text-xs whitespace-normal text-text-secondary [overflow-wrap:anywhere]">{ack.by}</span> : null}
      <span className="block text-xs text-text-secondary tabular">{f.dateTime(ack.at)}</span>
    </span>
  );
}

/** Active alarms of one device, for its detail dialog (Alarm Active lists every device). */
export function DeviceAlarms({ deviceId }: { deviceId: string }) {
  const { m, f } = useI18n();
  const t = m.hvac.device.alarms;
  const live = useLive();
  const acked = useAcked();
  const now = useNow(30_000);
  const text = useAlarmText();
  const ackText = useAckText();
  const alarms = (live?.alarms ?? []).filter((a) => a.deviceId === deviceId);
  const heading = `device-alarms-${deviceId}`;
  return (
    <section aria-labelledby={heading} className="rounded-lg border bg-muted/40 p-3">
      <h3 id={heading} className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <BellRing aria-hidden className="size-4 text-primary" />
        {t.title}
      </h3>
      {alarms.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.none}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {alarms.map((a) => {
              const { name, detail } = text(a);
              const given = acked.get(a.id);
              return (
                <li key={a.id} className="rounded-md border bg-card p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={a.severity} size="sm" />
                    <span className="text-sm font-medium">{name}</span>
                  </div>
                  {detail ? <p className="mt-1 text-xs text-text-secondary tabular">{detail}</p> : null}
                  <p className="mt-1 text-xs text-text-secondary tabular">{t.since(f.dateTime(a.start), f.duration(Math.max(0, now - a.start)))}</p>
                  <p className={given ? "text-xs text-text-secondary [overflow-wrap:anywhere]" : "text-xs font-semibold text-warning-fg"}>{given ? t.acked(ackText(given)) : t.unacked}</p>
                </li>
              );
            })}
          </ul>
          <Link href="/hvac/alarms" className="mt-2 inline-flex min-h-6 items-center text-sm font-medium text-link underline underline-offset-2 hover:decoration-2">
            {t.open}
          </Link>
        </>
      )}
    </section>
  );
}

function ActiveAlarms() {
  const { m, f } = useI18n();
  const t = m.hvac.alarms;
  const live = useLive();
  const acked = useAcked();
  const now = useNow(30_000);
  const text = useAlarmText();
  const by = useHvacAccount()?.email ?? undefined;
  // Phones get cards: a table that wide would hide the Acknowledge buttons off screen.
  const narrow = useMediaQuery("(max-width: 767px)");
  // What needs someone first: not acknowledged, then critical, then the newest.
  const alarms = [...(live?.alarms ?? [])].sort(
    (a, b) => Number(acked.has(a.id)) - Number(acked.has(b.id)) || Number(a.severity !== "critical") - Number(b.severity !== "critical") || b.start - a.start,
  );
  const unacked = alarms.filter((a) => !acked.has(a.id));
  // The Acknowledge button disappears once used, so focus moves on: next row's button, else the heading.
  const [focusNext, setFocusNext] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (focusNext) (document.getElementById(focusNext.id) ?? document.getElementById("page-title"))?.focus();
  }, [focusNext]);

  function ack(ids: string[]) {
    const rest = unacked.filter((a) => !ids.includes(a.id));
    const after = ids.length === 1 ? rest.find((a) => alarms.indexOf(a) > alarms.findIndex((x) => x.id === ids[0])) ?? rest[0] : undefined;
    acknowledge(ids, by);
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
      ) : narrow ? (
        <ul aria-labelledby="page-title" className="flex flex-col gap-3">
          {alarms.map((a) => {
            const given = acked.get(a.id);
            const { name, detail } = text(a);
            const device = deviceLabel(a.deviceId, m);
            return (
              <li key={a.id} className={cn("rounded-lg border bg-card p-3", !given && "border-l-4", !given && (a.severity === "critical" ? "border-l-critical" : "border-l-warning"))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{device}</p>
                    <p className="font-medium">{name}</p>
                    {detail ? <p className="text-xs text-text-secondary tabular">{detail}</p> : null}
                  </div>
                  <SeverityBadge severity={a.severity} size="sm" />
                </div>
                <p className="mt-1 text-xs text-text-secondary tabular">
                  {f.weekdayDateTime(a.start)} · {f.duration(Math.max(0, now - a.start))}
                </p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                  {given ? (
                    <div className="min-w-0">
                      <Chip tone="neutral" icon={CircleCheck} label={t.states.acked} size="sm" />
                      <AckNote ack={given} className="mt-1 block" />
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-warning-fg">{t.states.unacked}</span>
                      <Button id={`ack-${a.id}`} variant="outline" className="h-10" onClick={() => ack([a.id])} aria-label={t.ackLabel(name, device)}>
                        {t.ack}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="page-title" className="relative overflow-x-auto rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">{t.activeCaption(m.hvac.titles.alarms)}</caption>
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
                const given = acked.get(a.id);
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
                      {given ? (
                        <>
                          <Chip tone="neutral" icon={CircleCheck} label={t.states.acked} size="sm" />
                          <AckNote ack={given} className="mt-1 block" />
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-warning-fg">{t.states.unacked}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular">{f.duration(Math.max(0, now - a.start))}</TableCell>
                    <TableCell className="text-right">
                      {given ? null : (
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
  const acked = useAcked();
  const [now] = useState(() => Date.now());
  const [fromInput, setFromInput] = useState(() => toLocalInput(now - DAY));
  const [toInput, setToInput] = useState(() => toLocalInput(now));
  const [severity, setSeverity] = useState<"all" | AlarmSeverity>("all");
  const [query, setQuery] = useState({ from: now - DAY, to: now, severity: "all" as "all" | AlarmSeverity });
  const [error, setError] = useState<string | null>(null);
  const project = useHvacAccount()?.project ?? null;
  const log = useHistory(
    `alarm-log|${project}|${query.from}|${query.to}`,
    () => loadAlarmLog(project, query.from, query.to, now),
    () => alarmLog(query.from, query.to, now),
  );
  const narrow = useMediaQuery("(max-width: 767px)");
  // The log says who acknowledged; an acknowledgement given on this screen since shows at once.
  const ackOf = (a: HvacAlarm): Ack | undefined => (a.ackedAt !== undefined ? { at: a.ackedAt, ...(a.ackedBy ? { by: a.ackedBy } : {}) } : acked.get(a.id));
  const rows = useMemo(() => (log.data ?? []).filter((a) => query.severity === "all" || a.severity === query.severity), [log.data, query.severity]);

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
      [t.cols.datetime, t.cols.device, t.cols.name, t.cols.severity, t.cols.state, t.cols.cleared, t.cols.duration, t.cols.ackedBy, t.cols.ackedAt],
      ...rows.map((a) => {
        const { name, detail } = text(a, true);
        const ack = ackOf(a);
        return [
          csvTime(a.start),
          deviceLabel(a.deviceId, m),
          detail ? `${name} (${detail})` : name,
          t.severity[a.severity],
          a.end === null ? t.ongoing : t.states.cleared,
          a.end === null ? null : csvTime(a.end),
          f.duration((a.end ?? Date.now()) - a.start),
          ack ? (ack.by ?? null) : null,
          ack ? csvTime(ack.at) : null,
        ];
      }),
    ]);
  }

  return (
    <>
      <PageTitle>{m.hvac.titles.alarmLogs}</PageTitle>
      <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor={id("from")}>{m.hvac.report.from}</Label>
          <Input id={id("from")} type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="h-10 w-full sm:w-56" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor={id("to")}>{m.hvac.report.to}</Label>
          <Input id={id("to")} type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} className="h-10 w-full sm:w-56" aria-invalid={error ? true : undefined} aria-describedby={error ? id("err") : undefined} />
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

      {log.error ? (
        <ErrorState onRetry={log.retry} compact />
      ) : log.loading ? (
        <LoadingBlock label={m.hvac.shell.loading} lines={6} className="rounded-lg border bg-card p-4" />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title={t.logsEmpty} description={t.logsEmptyDesc} className="min-h-80" />
      ) : narrow ? (
        <ul aria-labelledby="page-title" className="flex flex-col gap-3">
          {rows.map((a) => {
            const { name, detail } = text(a, true);
            const ack = ackOf(a);
            return (
              <li key={a.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{deviceLabel(a.deviceId, m)}</p>
                    <p className="font-medium">{name}</p>
                    {detail ? <p className="text-xs text-text-secondary tabular">{detail}</p> : null}
                  </div>
                  <SeverityBadge severity={a.severity} size="sm" />
                </div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-text-secondary">{t.cols.datetime}</dt>
                  <dd className="tabular">{f.weekdayDateTime(a.start)}</dd>
                  <dt className="text-text-secondary">{t.cols.cleared}</dt>
                  <dd className="tabular">{a.end === null ? <span className="font-semibold text-warning-fg">{t.ongoing}</span> : f.weekdayDateTime(a.end)}</dd>
                  <dt className="text-text-secondary">{t.cols.duration}</dt>
                  <dd className="tabular">{f.duration((a.end ?? now) - a.start)}</dd>
                  <dt className="text-text-secondary">{t.cols.acked}</dt>
                  <dd>{ack ? <AckNote ack={ack} /> : "—"}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
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
                <TableHead scope="col">{t.cols.acked}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const { name, detail } = text(a, true);
                const ack = ackOf(a);
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
                    <TableCell className="min-w-36">{ack ? <AckNote ack={ack} /> : "—"}</TableCell>
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
