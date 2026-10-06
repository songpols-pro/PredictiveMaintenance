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
import { deviceById, type PlantSnap } from "@/lib/hvac/model";
import { useLive } from "@/lib/hvac/live";
import { predictions } from "@/lib/hvac/sim";
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
  const p = predictions(now).find((x) => x.deviceId === deviceId);
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

function content(id: string, snap: PlantSnap, m: ReturnType<typeof useI18n>["m"], r: ReturnType<typeof useReading>) {
  const d = m.hvac.device;
  const p = d.params;
  const onOff = (v: boolean) => (v ? d.on : d.off);
  const chiller = snap.chillers.find((c) => c.id === id);
  if (chiller) {
    const on = chiller.state === "on";
    const circuit = (n: 1 | 2): Row[] => {
      const c = chiller.circuits[n - 1];
      return [
        { label: p.suction, value: r(c.suction, 1, "°C") },
        { label: p.discharge, value: r(c.discharge, 1, "°C") },
        { label: p.coilOut, value: r(c.coilOut, 1, "°C") },
        { label: p.lowP, value: r(c.lowP, 1, "bar") },
        { label: p.highP, value: r(c.highP, 1, "bar") },
      ];
    };
    return {
      state: chiller.state,
      art: <ChillerArt running={on} className="h-36 w-full" />,
      headline: [
        { label: p.load, value: on ? r(chiller.loadPct, 0, "%") : "—" },
        { label: p.tons, value: on ? r(chiller.tons, 0, "Ton") : "—" },
        { label: p.kw, value: r(chiller.kw, 1, "kW") },
        { label: p.kwPerTon, value: r(chiller.kwPerTon, 2, "kW/Ton") },
      ],
      groups: [
        {
          title: d.groups.status,
          rows: [
            { label: p.comp(1), value: onOff(chiller.comp[0]) },
            { label: p.comp(2), value: onOff(chiller.comp[1]) },
            { label: p.alarmOutput, value: chiller.alarm ? d.alarm : d.normal, tone: chiller.alarm ? ("critical" as const) : undefined },
            { label: p.mode, value: m.hvac.modes[chiller.mode] },
          ],
        },
        {
          title: d.groups.water,
          rows: [
            { label: p.chwIn, value: r(chiller.chwIn, 1, "°C") },
            { label: p.chwOut, value: r(chiller.chwOut, 1, "°C") },
            { label: p.deltaT, value: on ? r(chiller.chwIn - chiller.chwOut, 1, "°C") : "—" },
            { label: p.flow, value: r(chiller.flow, 1, "CMH") },
          ],
        },
        { title: d.groups.circuit(1), rows: circuit(1) },
        { title: d.groups.circuit(2), rows: circuit(2) },
        { title: d.groups.performance, rows: [{ label: p.ambient, value: r(chiller.ambient, 1, "°C") }] },
      ],
      trend: [`${id}.chwIn`, `${id}.chwOut`, `${id}.kw`, `${id}.kwPerTon`],
    };
  }
  const air = snap.air.find((a) => a.id === id);
  if (air) {
    return {
      state: air.state,
      art: <AirHandlerArt running={air.state === "on"} className="h-36 w-full" />,
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
      art: <PumpArt running={pump.state === "on"} className="h-36 w-full" />,
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
  if (id === snap.panel.id) {
    return {
      state: snap.panel.state,
      art: <PanelArt online={snap.panel.comm} className="h-36 w-full" />,
      headline: [],
      groups: [
        { title: d.groups.operation, rows: [{ label: p.control, value: m.hvac.modes[snap.panel.mode] }] },
        { title: d.groups.communication, rows: [{ label: p.comm, value: snap.panel.comm ? d.ok : d.lost, tone: snap.panel.comm ? undefined : ("warning" as const) }] },
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
  const def = id ? deviceById(id) : undefined;
  const view = id && def && live ? content(id, live.snap, m, r) : null;
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
              <PdmPanel deviceId={id} now={now} />
            </div>
            <div tabIndex={0} role="region" aria-label={deviceLabel(id, m)} className="relative grid min-w-0 content-start gap-3 sm:grid-cols-2 md:max-h-[60dvh] md:overflow-y-auto md:pr-1">
              {view.groups.map((g) => (
                <Group key={g.title} title={g.title} rows={g.rows} />
              ))}
            </div>
          </div>
          <DialogFooter>
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
