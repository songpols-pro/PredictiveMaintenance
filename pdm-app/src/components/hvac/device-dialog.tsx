"use client";

// Device detail ("Device Detail" in the mock-up): opened from the plant diagram through ?device=ID,
// so a detail view can be linked and the browser Back button closes it.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cpu, LineChart, Sparkles } from "lucide-react";
import { HealthMeter } from "@/components/pdm/health-meter";
import { ConfidenceBadge } from "@/components/pdm/status";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/provider";
import { useNow } from "@/lib/use-query";
import { findDevice, type PlantLayout } from "@/lib/hvac/layout";
import type { ChillerSnap, PlantSnap } from "@/lib/hvac/model";
import { offeredPointsOf } from "@/lib/hvac/points";
import { useLive } from "@/lib/hvac/live";
import { predictions } from "@/lib/hvac/sim";
import { HVAC_SOURCE } from "@/lib/hvac/source";
import { DeviceAlarms } from "./alarms";
import { AirHandlerArt, ChillerArt, PanelArt, PumpArt } from "./art";
import { StateBadge, ValueList, deviceLabel, useReading } from "./common";

type Row = { label: string; value: React.ReactNode; tone?: "warning" | "critical" };

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="rounded-lg border bg-muted/40 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ValueList rows={rows} />
    </section>
  );
}

function PdmPanel({ deviceId, now }: { deviceId: string; now: number }) {
  const { m, f } = useI18n();
  // The predictions are simulated: with live data the panel stays hidden until a real model writes them.
  const p = HVAC_SOURCE === "sim" ? predictions(now).find((x) => x.deviceId === deviceId) : undefined;
  if (!p) return null;
  const t = m.hvac.device.pdm;
  const status = p.health < 60 ? "critical" : p.health < 80 ? "warning" : "healthy";
  const range = f.rulRange(p.daysLow, p.daysHigh);
  return (
    <section aria-labelledby={`pdm-${deviceId}`} className="rounded-lg border bg-muted/40 p-3">
      <h3 id={`pdm-${deviceId}`} className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles aria-hidden className="size-4 text-primary" />
        {t.title}
      </h3>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t.health}</span>
        <HealthMeter score={p.health} status={status} />
      </div>
      <p className="mt-2 font-semibold">{t.findings[p.finding]}</p>
      <p className="text-sm text-text-secondary">{t.details[p.finding]}</p>
      <p className="mt-2 text-sm font-medium">
        {t.action[p.finding](range)}
        {p.finding !== "none" ? <span className="text-muted-foreground"> ({t.interval})</span> : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ConfidenceBadge value={p.confidence} />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Cpu aria-hidden className="size-3.5" />
          <time dateTime={new Date(p.modelRunAt).toISOString()} title={f.dateTime(p.modelRunAt)}>
            {t.modelRun(f.relative(p.modelRunAt, now))}
          </time>
        </span>
      </div>
    </section>
  );
}

/** A reading the device reports (NaN: it does not). */
const has = (v: number | null) => v === null || !Number.isNaN(v);

function chillerContent(chiller: ChillerSnap, layout: PlantLayout, snap: PlantSnap, m: ReturnType<typeof useI18n>["m"], r: ReturnType<typeof useReading>) {
  const d = m.hvac.device;
  const p = d.params;
  const onOff = (v: boolean) => (v ? d.on : d.off);
  const on = chiller.state === "on";
  const id = chiller.id;
  // Rows of values the chiller does not report are left out (a Carrier 30RAM has no flow, kW or
  // refrigerant pressures; the mock-up's chillers have none of the modular unit's points).
  const known = (rows: (Row & { show?: boolean })[]): Row[] => rows.filter((row) => row.show !== false).map((row) => ({ label: row.label, value: row.value, tone: row.tone }));
  const temp = (label: string, v: number): Row & { show: boolean } => ({ label, value: r(v, 1, "°C"), show: has(v) });
  const flag = (label: string, v: boolean | null): Row & { show: boolean } => ({ label, value: v === null ? "—" : onOff(v), show: v !== null });
  const circuit = (n: 1 | 2): Row[] => {
    const c = chiller.circuits[n - 1];
    return known([
      temp(p.suction, c.suction),
      temp(p.discharge, c.discharge),
      temp(p.coilOut, c.coilOut),
      temp(p.innerCoil, c.innerCoil),
      temp(p.fin, c.fin),
      { label: p.lowP, value: r(c.lowP, 1, "bar"), show: has(c.lowP) },
      { label: p.highP, value: r(c.highP, 1, "bar"), show: has(c.highP) },
    ]);
  };
  // Tandem compressors one by one when the chiller reports them, else per circuit.
  const tandem = chiller.compressors.some((c) => c !== null);
  const compressors = tandem
    ? (["1A", "1B", "2A", "2B"] as const).map((name, i) => flag(p.comp(name), chiller.compressors[i]))
    : [
        { label: p.comp(1), value: onOff(chiller.comp[0]) },
        { label: p.comp(2), value: onOff(chiller.comp[1]) },
      ];
  const modeCode = Number.isNaN(chiller.modeCode) ? null : (d.opModes[chiller.modeCode] ?? d.opModeOther(chiller.modeCode));
  const meterNames = chiller.kwMeters.map((mt) => findDevice(layout, mt)?.label ?? deviceLabel(mt, m)).join(", ");
  const kwLabel = chiller.kwMeters.length ? p.kwFrom(meterNames) : p.kw;

  // Up to four headline figures: performance first, then the water temperatures to fill the row.
  const headline = known([
    { label: chiller.loadFromStages ? p.loadStages : p.load, value: on ? r(chiller.loadPct, 0, "%") : "—", show: has(chiller.loadPct) },
    { label: p.tons, value: on ? r(chiller.tons, 0, "Ton") : "—", show: has(chiller.tons) },
    { label: kwLabel, value: r(chiller.kw, 1, "kW"), show: has(chiller.kw) },
    { label: p.kwPerTon, value: r(chiller.kwPerTon, 2, "kW/Ton"), show: has(chiller.kwPerTon) },
    temp(p.chwOut, chiller.chwOut),
    temp(p.chwSetpoint, chiller.setpoint),
  ]).slice(0, 4);

  const exv = known(chiller.exv.map((v, i) => ({ label: p.exv(i + 1), value: r(v, 0, d.steps), show: has(v) })));
  const groups = [
    {
      title: d.groups.status,
      rows: known([
        ...compressors,
        flag(p.fan(1), chiller.fans[0]),
        flag(p.fan(2), chiller.fans[1]),
        flag(p.defrost, chiller.defrost),
        { label: p.alarmOutput, value: chiller.alarm ? d.alarm : d.normal, tone: chiller.alarm ? ("critical" as const) : undefined },
        { label: p.mode, value: m.hvac.modes[chiller.mode] },
        { label: p.controllerMode, value: modeCode ?? "—", show: modeCode !== null },
      ]),
    },
    {
      title: d.groups.water,
      rows: known([
        temp(p.chwIn, chiller.chwIn),
        temp(p.chwOut, chiller.chwOut),
        { label: p.deltaT, value: on ? r(chiller.chwIn - chiller.chwOut, 1, "°C") : "—", show: has(chiller.chwIn) && has(chiller.chwOut) },
        temp(p.chwSetpoint, chiller.setpoint),
        { label: p.flow, value: r(chiller.flow, 1, "CMH"), show: has(chiller.flow) },
        temp(p.headerOut, chiller.headerOut),
        temp(p.headerIn, chiller.headerIn),
        temp(p.antifreeze, chiller.antifreeze),
      ]),
    },
    { title: d.groups.circuit(1), rows: circuit(1) },
    { title: d.groups.circuit(2), rows: circuit(2) },
    { title: d.groups.exv, rows: exv },
    { title: d.groups.performance, rows: known([temp(p.ambient, chiller.ambient)]) },
  ].filter((g) => g.rows.length > 0);

  // "Open trend" with the first four of these that the chiller reports.
  const offered = new Set(offeredPointsOf(id, layout, snap).map((pt) => pt.id));
  const trend = ["chwIn", "chwOut", "kw", "kwPerTon", "setpoint"].map((key) => `${id}.${key}`).filter((pt) => offered.has(pt)).slice(0, 4);
  return { state: chiller.state, art: <ChillerArt running={on} className="h-24 w-full sm:h-36" />, headline, groups, trend };
}

function content(id: string, layout: PlantLayout, snap: PlantSnap, m: ReturnType<typeof useI18n>["m"], r: ReturnType<typeof useReading>) {
  const d = m.hvac.device;
  const p = d.params;
  const chiller = snap.chillers.find((c) => c.id === id);
  if (chiller) return chillerContent(chiller, layout, snap, m, r);
  const air = snap.air.find((a) => a.id === id);
  if (air) {
    return {
      state: air.state,
      art: <AirHandlerArt running={air.state === "on"} className="h-24 w-full sm:h-36" />,
      headline: [
        { label: p.temp, value: r(air.temp, 1, "°C") },
        { label: p.humid, value: r(air.humid, 0, "%RH") },
      ],
      groups: [
        { title: d.groups.operation, rows: [{ label: p.mode, value: m.hvac.modes[air.mode] }] },
        {
          title: d.groups.air,
          rows: [
            { label: p.temp, value: r(air.temp, 1, "°C") },
            { label: p.setpoint, value: r(air.setpoint, 1, "°C") },
            { label: p.humid, value: r(air.humid, 0, "%RH"), tone: air.kind === "ahu" && air.humid > 65 ? ("warning" as const) : undefined },
            { label: p.supplyAir, value: r(air.supplyAir, 1, "°C") },
          ],
        },
        { title: d.groups.water, rows: [{ label: p.valve, value: r(air.valve, 0, "%") }] },
      ],
      trend: [`${id}.temp`, `${id}.humid`, `${id}.supplyAir`],
    };
  }
  const pump = snap.pumps.find((x) => x.id === id);
  if (pump) {
    return {
      state: pump.state,
      art: <PumpArt running={pump.state === "on"} className="h-24 w-full sm:h-36" />,
      headline: [
        { label: p.role, value: m.hvac.roles[pump.role] },
        { label: p.speed, value: pump.state === "on" ? r(pump.speed, 0, "%") : "—" },
      ],
      groups: [
        {
          title: d.groups.operation,
          rows: [
            { label: p.role, value: m.hvac.roles[pump.role] },
            { label: p.speed, value: pump.state === "on" ? r(pump.speed, 0, "%") : d.notRunning },
            { label: p.hours, value: r(pump.hours, 0, "h") },
          ],
        },
      ],
      trend: [`${id}.speed`, `${id}.running`],
    };
  }
  const panel = snap.panels.find((x) => x.id === id);
  if (panel) {
    return {
      state: panel.state,
      art: <PanelArt online={panel.comm} className="h-24 w-full sm:h-36" />,
      headline: [],
      groups: [
        { title: d.groups.operation, rows: [{ label: p.control, value: m.hvac.modes[panel.mode] }] },
        { title: d.groups.communication, rows: [{ label: p.comm, value: panel.comm ? d.ok : d.lost, tone: panel.comm ? undefined : ("warning" as const) }] },
      ],
      trend: [] as string[],
    };
  }
  return null;
}

export function DeviceDialog() {
  const { m, f } = useI18n();
  const r = useReading();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const live = useLive();
  const now = useNow(1000);
  const focus = useDialogFocus();
  const id = params.get("device");
  const def = id && live ? findDevice(live.layout, id) : undefined;
  const view = id && def && live ? content(id, live.layout, live.snap, m, r) : null;
  const close = () => router.replace(pathname, { scroll: false });

  return (
    <Dialog open={Boolean(view)} onOpenChange={(open) => (open ? null : close())}>
      {view && id && live ? (
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl" {...focus.contentProps}>
          <DialogHeader className="pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg font-semibold">{deviceLabel(id, m)}</DialogTitle>
              <StateBadge state={view.state} />
            </div>
            <DialogDescription>
              <time dateTime={new Date(live.receivedAt).toISOString()} title={f.dateTime(live.receivedAt)}>
                {m.hvac.device.updated(m.hvac.shell.secondsAgo(Math.max(0, Math.round((now - live.receivedAt) / 1000))))}
              </time>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="rounded-lg bg-muted p-3">{view.art}</div>
              {view.headline.length ? (
                <dl className="grid grid-cols-2 gap-2">
                  {view.headline.map((h) => (
                    <div key={h.label} className="rounded-lg border bg-card p-2.5">
                      <dt className="text-xs text-muted-foreground">{h.label}</dt>
                      <dd className="text-lg font-semibold tabular">{h.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <DeviceAlarms deviceId={id} />
              <PdmPanel deviceId={id} now={now} />
            </div>
            {/* One scroll for the whole dialog (no inner scroll area), with the buttons kept in view below. */}
            <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
              {view.groups.map((g) => (
                <Group key={g.title} title={g.title} rows={g.rows} />
              ))}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 bg-popover">
            {view.trend.length ? (
              <Button asChild variant="outline">
                <Link href={{ pathname: "/hvac/trend", query: { points: view.trend.join(","), range: "h24" } }}>
                  <LineChart aria-hidden />
                  {m.hvac.device.openTrend}
                </Link>
              </Button>
            ) : null}
            <Button onClick={close}>{m.hvac.device.close}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
