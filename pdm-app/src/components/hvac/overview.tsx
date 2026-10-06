"use client";

import Link from "next/link";
import { CircleCheck, Minus, TriangleAlert } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { Chip } from "@/components/pdm/status";
import { SkeletonCard } from "@/components/pdm/states";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import { AIR_SIDE, CHILLERS, METERS, PANEL, PLANT, PUMPS, type PlantSnap, type RunState } from "@/lib/hvac/model";
import { useAcked, useLive } from "@/lib/hvac/live";
import { AirHandlerArt, ChillerArt, PanelArt, PumpArt } from "./art";
import { PageTitle, StateBadge, ValueList, deviceLabel, useReading } from "./common";
import { DeviceDialog } from "./device-dialog";

/** Same look as the KPI cards on the PdM overview. */
function Kpi({ label, children, caption, className }: { label: string; children: React.ReactNode; caption?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-4", className)}>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular">{children}</dd>
      {caption ? <dd className="text-xs text-muted-foreground">{caption}</dd> : null}
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-sm font-normal text-muted-foreground">{children}</span>;
}

function KpiStrip({ snap }: { snap: PlantSnap }) {
  const { m, f } = useI18n();
  const o = m.hvac.overview;
  const r = useReading();
  const live = useLive();
  const acked = useAcked();
  const alarms = live?.alarms ?? [];
  const unacked = alarms.filter((a) => !acked.has(a.id)).length;
  const capacity = PLANT.chillerCapacityTon * CHILLERS.length;
  const eff = snap.kwPerTon;
  const band = eff === null ? null : eff <= PLANT.efficiencyGood ? "good" : eff <= PLANT.efficiencyFair ? "fair" : "poor";
  const count = (states: RunState[]) => states.filter((s) => s === "on").length;
  return (
    <dl aria-label={o.kpis} className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Kpi label={o.load} caption={o.loadCaption(Math.round((snap.tons / capacity) * 100), capacity)}>
        {f.number(snap.tons)}
        <Unit>Ton</Unit>
      </Kpi>
      <Kpi label={o.power} caption={o.powerCaption(METERS.length)}>
        {f.number(snap.kw, 1)}
        <Unit>kW</Unit>
      </Kpi>
      <Kpi
        label={o.efficiency}
        caption={o.efficiencyCaption(PLANT.efficiencyGood, PLANT.efficiencyFair)}
      >
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>
            {r(eff, 2)}
            <Unit>kW/Ton</Unit>
          </span>
          {band === "good" ? <Chip tone="healthy" icon={CircleCheck} label={o.bands.good} size="sm" /> : null}
          {band === "fair" ? <Chip tone="neutral" icon={Minus} label={o.bands.fair} size="sm" /> : null}
          {band === "poor" ? <Chip tone="warning" icon={TriangleAlert} label={o.bands.poor} size="sm" /> : null}
        </span>
      </Kpi>
      <Kpi label={o.water} caption={`${o.deltaT(f.number(snap.deltaT, 1))} · ${f.number(snap.flow)} CMH`}>
        <span className="text-xl">
          <span className="sr-only">{o.supplyShort} </span>
          {f.number(snap.supply, 1)}
          <span aria-hidden className="mx-1 text-text-secondary">/</span>
          <span className="sr-only">{o.returnShort} </span>
          {f.number(snap.ret, 1)}
          <Unit>°C</Unit>
        </span>
        <span aria-hidden className="block text-xs font-normal text-muted-foreground">
          {o.supplyShort} / {o.returnShort}
        </span>
      </Kpi>
      <Kpi label={o.running}>
        <span className="flex flex-col text-sm font-semibold">
          <span>{o.runningChillers(count(snap.chillers.map((c) => c.state)), CHILLERS.length)}</span>
          <span>{o.runningPumps(count(snap.pumps.map((p) => p.state)), PUMPS.length)}</span>
          <span>{o.runningAir(count(snap.air.map((a) => a.state)), AIR_SIDE.length)}</span>
        </span>
      </Kpi>
      <Kpi
        label={o.alarms}
        caption={
          alarms.length ? (
            <Link href="/hvac/alarms" className="font-medium text-link underline underline-offset-2 hover:decoration-2">
              {o.viewAlarms}
            </Link>
          ) : (
            o.alarmsNone
          )
        }
      >
        <span className="inline-flex flex-wrap items-center gap-2">
          {alarms.length}
          {alarms.length ? <Chip tone={unacked ? "warning" : "neutral"} icon={unacked ? TriangleAlert : CircleCheck} label={o.alarmsCaption(unacked)} size="sm" /> : null}
        </span>
      </Kpi>
    </dl>
  );
}

function EquipmentCard({ id, name, state, art, rows, alarm }: { id: string; name: string; state: RunState; art: React.ReactNode; rows: { label: string; value: React.ReactNode; tone?: "warning" | "critical" }[]; alarm?: boolean }) {
  const { m } = useI18n();
  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-input hover:bg-accent/40",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring",
        alarm && "border-critical-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <h4 className="min-w-0 truncate text-sm font-semibold">
          <Link href={{ pathname: "/hvac", query: { device: id } }} scroll={false} className="outline-none after:absolute after:inset-0" aria-label={m.hvac.overview.openDetail(name)}>
            {name}
          </Link>
        </h4>
        <StateBadge state={state} size="sm" />
      </div>
      <div className="mx-3 mt-2 flex h-20 items-center justify-center rounded-md bg-muted px-3 py-2">{art}</div>
      <ValueList dense rows={rows} className="px-3 pt-2 pb-3" />
    </article>
  );
}

/** Chilled-water header between the air side and the plant (decorative; values are in the KPI strip). */
function HeaderPipe({ snap }: { snap: PlantSnap }) {
  const { m, f } = useI18n();
  const o = m.hvac.overview;
  const flowing = snap.flow > 0;
  const chip = "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular";
  return (
    <div aria-hidden className="relative hidden h-16 xl:block">
      {AIR_SIDE.map((d, i) => (
        <span key={d.id} className="absolute top-0 h-1/2 w-1 -translate-x-1/2 rounded bg-primary" style={{ left: `${((i + 0.5) / AIR_SIDE.length) * 100}%` }} />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="absolute bottom-0 h-1/2 w-1 -translate-x-1/2 rounded bg-primary" style={{ left: `${((i + 0.5) / 6) * 100}%` }} />
      ))}
      <span className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-primary", flowing && "hvac-flow")} style={{ left: `${(0.5 / 6) * 100}%`, right: `${(0.5 / 6) * 100}%` }} />
      <span className={chip} style={{ left: "27%" }}>
        {o.chws} {f.number(snap.supply, 1)} °C →
      </span>
      <span className={chip} style={{ left: "50%" }}>
        {o.flow} {f.number(snap.flow)} CMH
      </span>
      <span className={chip} style={{ left: "73%" }}>
        ← {o.chwr} {f.number(snap.ret, 1)} °C
      </span>
    </div>
  );
}

function Diagram({ snap }: { snap: PlantSnap }) {
  const { m } = useI18n();
  const o = m.hvac.overview;
  const r = useReading();
  const art = "h-full w-auto max-w-full";
  return (
    <section aria-labelledby="diagram-title" className="mt-5 flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="diagram-title" title={o.diagram} description={o.diagramDesc} />

      <h3 className="text-xs font-medium text-text-secondary">{o.airSide}</h3>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {snap.air.map((a) => {
          const def = AIR_SIDE.find((d) => d.id === a.id)!;
          return (
            <EquipmentCard
              key={a.id}
              id={a.id}
              name={def.name}
              state={a.state}
              art={<AirHandlerArt running={a.state === "on"} className={art} />}
              rows={[
                { label: o.fields.mode, value: m.hvac.modes[a.mode] },
                { label: o.fields.temp, value: r(a.temp, 1, "°C") },
                { label: o.fields.humid, value: r(a.humid, 0, "%RH"), tone: a.kind === "ahu" && a.humid > 65 ? "warning" : undefined },
              ]}
            />
          );
        })}
      </div>

      <HeaderPipe snap={snap} />

      <h3 className="mt-2 text-xs font-medium text-text-secondary xl:mt-0">{o.waterSide}</h3>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {snap.chillers.map((c) => {
          const def = CHILLERS.find((d) => d.id === c.id)!;
          const on = c.state === "on";
          return (
            <EquipmentCard
              key={c.id}
              id={c.id}
              name={def.name}
              state={c.state}
              alarm={c.alarm}
              art={<ChillerArt running={on} className={art} />}
              rows={[
                { label: o.fields.mode, value: m.hvac.modes[c.mode] },
                { label: o.fields.inlet, value: r(c.chwIn, 1, "°C") },
                { label: o.fields.outlet, value: r(c.chwOut, 1, "°C") },
                { label: o.fields.flow, value: r(c.flow, 0, "CMH") },
                { label: o.fields.load, value: on ? r(c.loadPct, 0, "%") : "—" },
              ]}
            />
          );
        })}
        {snap.pumps.map((p) => (
          <EquipmentCard
            key={p.id}
            id={p.id}
            name={deviceLabel(p.id, m)}
            state={p.state}
            alarm={p.state === "fault"}
            art={<PumpArt running={p.state === "on"} className={art} />}
            rows={[
              { label: o.fields.role, value: m.hvac.roles[p.role] },
              { label: o.fields.speed, value: p.state === "on" ? r(p.speed, 0, "%") : "—" },
            ]}
          />
        ))}
        <EquipmentCard
          id={PANEL.id}
          name={deviceLabel(PANEL.id, m)}
          state={snap.panel.state}
          art={<PanelArt online={snap.panel.comm} className={art} />}
          rows={[
            { label: o.fields.status, value: snap.panel.comm ? o.normal : o.alarmState, tone: snap.panel.comm ? undefined : "warning" },
            { label: o.fields.control, value: m.hvac.modes[snap.panel.mode] },
          ]}
        />
      </div>
    </section>
  );
}

export function PlantOverview() {
  const { m } = useI18n();
  const live = useLive();
  return (
    <>
      <PageTitle>{m.hvac.titles.plant}</PageTitle>
      {live ? (
        <>
          <KpiStrip snap={live.snap} />
          <Diagram snap={live.snap} />
        </>
      ) : (
        <div role="status" aria-live="polite">
          <span className="sr-only">{m.hvac.shell.loading}</span>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} height="h-24" />
            ))}
          </div>
          <SkeletonCard className="mt-5" height="h-[28rem]" />
        </div>
      )}
      <DeviceDialog />
    </>
  );
}
