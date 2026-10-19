"use client";

import Link from "next/link";
import { CircleCheck, Factory, Minus, TriangleAlert, Unplug, Wifi } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { Chip } from "@/components/pdm/status";
import { EmptyState, SkeletonCard } from "@/components/pdm/states";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { PlantLayout } from "@/lib/hvac/layout";
import { PLANT, type PlantSnap, type RunState } from "@/lib/hvac/model";
import { useAcked, useLive, type LiveData } from "@/lib/hvac/live";
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

function KpiStrip({ snap, layout }: { snap: PlantSnap; layout: PlantLayout }) {
  const { m } = useI18n();
  const o = m.hvac.overview;
  const r = useReading();
  const live = useLive();
  const acked = useAcked();
  const alarms = live?.alarms ?? [];
  const unacked = alarms.filter((a) => !acked.has(a.id)).length;
  const capacity = layout.capacityTon;
  const loadPct = capacity && Number.isFinite(snap.tons) ? Math.round((snap.tons / capacity) * 100) : null;
  const eff = snap.kwPerTon;
  const band = eff === null || Number.isNaN(eff) ? null : eff <= PLANT.efficiencyGood ? "good" : eff <= PLANT.efficiencyFair ? "fair" : "poor";
  const count = (states: RunState[]) => states.filter((s) => s === "on").length;
  return (
    <dl aria-label={o.kpis} className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Kpi label={o.load} caption={capacity && loadPct !== null ? o.loadCaption(loadPct, capacity) : undefined}>
        {r(snap.tons, 0)}
        <Unit>Ton</Unit>
      </Kpi>
      <Kpi label={o.power} caption={layout.meters.length ? o.powerCaption(layout.meters.length) : o.powerFromChillers}>
        {r(snap.kw, 1)}
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
      <Kpi label={o.water} caption={`${o.deltaT(r(snap.deltaT, 1))} · ${r(snap.flow, 0, "CMH")}`}>
        <span className="text-xl">
          <span className="sr-only">{o.supplyShort} </span>
          {r(snap.supply, 1)}
          <span aria-hidden className="mx-1 text-text-secondary">/</span>
          <span className="sr-only">{o.returnShort} </span>
          {r(snap.ret, 1)}
          <Unit>°C</Unit>
        </span>
        <span aria-hidden className="block text-xs font-normal text-muted-foreground">
          {o.supplyShort} / {o.returnShort}
        </span>
      </Kpi>
      <Kpi label={o.running}>
        <span className="flex flex-col text-sm font-semibold">
          {layout.chillers.length ? <span>{o.runningChillers(count(snap.chillers.map((c) => c.state)), layout.chillers.length)}</span> : null}
          {layout.pumps.length ? <span>{o.runningPumps(count(snap.pumps.map((p) => p.state)), layout.pumps.length)}</span> : null}
          {layout.air.length ? <span>{o.runningAir(count(snap.air.map((a) => a.state)), layout.air.length)}</span> : null}
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
      {/* The name never gets cut: the state badge moves under it when the card is narrow. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pt-2.5">
        <h4 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
          <Link href={{ pathname: "/hvac", query: { device: id } }} scroll={false} className="outline-none after:absolute after:inset-0" aria-label={m.hvac.overview.openDetail(name)}>
            {name}
          </Link>
        </h4>
        <StateBadge state={state} size="sm" />
      </div>
      <div className="mx-3 mt-2 flex h-16 items-center justify-center rounded-md bg-muted px-3 py-2 sm:h-20">{art}</div>
      <ValueList dense rows={rows} className="px-3 pt-2 pb-3" />
    </article>
  );
}

/** At most this many equipment cards per row on wide screens (the mock-up has 5 air units, 6 water-side units). */
const MAX_COLS = 6;
const cols = (n: number) => Math.max(1, Math.min(n, MAX_COLS));
/** Grid of n cards: one row of up to six on wide screens, fewer columns on smaller ones. */
const gridStyle = (n: number) => ({ "--cols": `repeat(${cols(n)}, minmax(0, 1fr))` }) as React.CSSProperties;
/** Two cards side by side from phone width, so a plant does not become one long column. */
const GRID = "grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-(--cols)";

/** Chilled-water header between the air side and the plant (decorative; values are in the KPI strip). */
function HeaderPipe({ snap, air, water }: { snap: PlantSnap; air: number; water: number }) {
  const { m } = useI18n();
  const o = m.hvac.overview;
  const r = useReading();
  const flowing = snap.flow > 0;
  const chip = "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular";
  const at = (i: number, n: number) => `${((i + 0.5) / n) * 100}%`;
  // The header runs under the outermost drops of either row.
  const edge = `${(0.5 / Math.max(cols(air), cols(water))) * 100}%`;
  return (
    <div aria-hidden className="relative hidden h-16 xl:block">
      {Array.from({ length: Math.min(air, MAX_COLS) }).map((_, i) => (
        <span key={`a${i}`} className="absolute top-0 h-1/2 w-1 -translate-x-1/2 rounded bg-primary" style={{ left: at(i, cols(air)) }} />
      ))}
      {Array.from({ length: Math.min(water, MAX_COLS) }).map((_, i) => (
        <span key={`w${i}`} className="absolute bottom-0 h-1/2 w-1 -translate-x-1/2 rounded bg-primary" style={{ left: at(i, cols(water)) }} />
      ))}
      <span className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-primary", flowing && "hvac-flow")} style={{ left: edge, right: edge }} />
      <span className={chip} style={{ left: "27%" }}>
        {o.chws} {r(snap.supply, 1, "°C")} →
      </span>
      <span className={chip} style={{ left: "50%" }}>
        {o.flow} {r(snap.flow, 0, "CMH")}
      </span>
      <span className={chip} style={{ left: "73%" }}>
        ← {o.chwr} {r(snap.ret, 1, "°C")}
      </span>
    </div>
  );
}

/** A device that reports data but is not in the project's device list: its values as they come. */
function UnassignedCard({ device }: { device: LiveData["unassigned"][number] }) {
  const { m, f } = useI18n();
  const o = m.hvac.overview;
  const values = Object.entries(device.values);
  const shown = values.slice(0, 6);
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-dashed bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold">{device.id}</h4>
        <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
          {device.ok ? <Wifi aria-hidden className="size-3.5" /> : <Unplug aria-hidden className="size-3.5 text-warning" />}
          {device.ok ? o.answering : o.notAnswering}
        </span>
      </div>
      <ValueList dense className="pt-2" rows={shown.map(([key, v]) => ({ label: key, value: v === null ? "—" : f.number(v, 2) }))} />
      {values.length > shown.length ? <p className="pt-1 text-xs text-muted-foreground">{o.moreValues(values.length - shown.length)}</p> : null}
    </article>
  );
}

function Diagram({ live }: { live: LiveData }) {
  const { m } = useI18n();
  const o = m.hvac.overview;
  const r = useReading();
  const { snap, layout, unassigned } = live;
  const art = "h-full w-auto max-w-full";
  const name = (id: string) => deviceLabel(id, m);
  const water = layout.chillers.length + layout.pumps.length + layout.panels.length;
  const empty = layout.air.length + water === 0;
  return (
    <section aria-labelledby="diagram-title" className="mt-5 flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="diagram-title" title={o.diagram} description={empty ? undefined : o.diagramDesc(layout.chillers.length, layout.pumps.length, layout.air.length)} />

      {empty ? <EmptyState icon={Factory} title={o.noDevicesTitle} description={o.noDevicesDesc} className="min-h-48" /> : null}

      {layout.air.length ? (
        <>
          <h3 className="text-xs font-medium text-text-secondary">{o.airSide}</h3>
          <div className={GRID} style={gridStyle(layout.air.length)}>
            {snap.air.map((a) => (
              <EquipmentCard
                key={a.id}
                id={a.id}
                name={name(a.id)}
                state={a.state}
                art={<AirHandlerArt running={a.state === "on"} className={art} />}
                rows={[
                  { label: o.fields.mode, value: m.hvac.modes[a.mode] },
                  { label: o.fields.temp, value: r(a.temp, 1, "°C") },
                  { label: o.fields.humid, value: r(a.humid, 0, "%RH"), tone: a.kind === "ahu" && a.humid > 65 ? "warning" : undefined },
                ]}
              />
            ))}
          </div>
        </>
      ) : null}

      {layout.air.length && water ? <HeaderPipe snap={snap} air={layout.air.length} water={water} /> : null}

      {water ? (
        <>
          <h3 className="mt-2 text-xs font-medium text-text-secondary xl:mt-0">{o.waterSide}</h3>
          <div className={GRID} style={gridStyle(water)}>
            {snap.chillers.map((c) => {
              const on = c.state === "on";
              // Two figures after the water temperatures: flow and load, or what the chiller reports instead.
              const extra = [
                { label: o.fields.flow, value: r(c.flow, 0, "CMH"), show: !Number.isNaN(c.flow) },
                { label: o.fields.load, value: on ? r(c.loadPct, 0, "%") : "—", show: !Number.isNaN(c.loadPct) },
                { label: o.fields.setpoint, value: r(c.setpoint, 1, "°C"), show: !Number.isNaN(c.setpoint) },
                { label: o.fields.power, value: r(c.kw, 1, "kW"), show: !Number.isNaN(c.kw) },
              ]
                .filter((row) => row.show)
                .slice(0, 2)
                .map(({ label, value }) => ({ label, value }));
              return (
                <EquipmentCard
                  key={c.id}
                  id={c.id}
                  name={name(c.id)}
                  state={c.state}
                  alarm={c.alarm}
                  art={<ChillerArt running={on} className={art} />}
                  rows={[
                    { label: o.fields.mode, value: m.hvac.modes[c.mode] },
                    { label: o.fields.inlet, value: r(c.chwIn, 1, "°C") },
                    { label: o.fields.outlet, value: r(c.chwOut, 1, "°C") },
                    ...extra,
                  ]}
                />
              );
            })}
            {snap.pumps.map((p) => (
              <EquipmentCard
                key={p.id}
                id={p.id}
                name={name(p.id)}
                state={p.state}
                alarm={p.state === "fault"}
                art={<PumpArt running={p.state === "on"} className={art} />}
                rows={[
                  { label: o.fields.role, value: m.hvac.roles[p.role] },
                  { label: o.fields.speed, value: p.state === "on" ? r(p.speed, 0, "%") : "—" },
                ]}
              />
            ))}
            {snap.panels.map((panel) => (
              <EquipmentCard
                key={panel.id}
                id={panel.id}
                name={name(panel.id)}
                state={panel.state}
                art={<PanelArt online={panel.comm} className={art} />}
                rows={[
                  { label: o.fields.status, value: panel.comm ? o.normal : o.alarmState, tone: panel.comm ? undefined : "warning" },
                  { label: o.fields.control, value: m.hvac.modes[panel.mode] },
                ]}
              />
            ))}
          </div>
        </>
      ) : null}

      {unassigned.length ? (
        <>
          <h3 className="mt-2 text-xs font-medium text-text-secondary">{o.unassigned}</h3>
          <p className="-mt-2 text-sm text-text-secondary">{o.unassignedDesc}</p>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {unassigned.map((d) => (
              <UnassignedCard key={d.id} device={d} />
            ))}
          </div>
        </>
      ) : null}
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
          <KpiStrip snap={live.snap} layout={live.layout} />
          <Diagram live={live} />
        </>
      ) : (
        <div role="status" aria-live="polite">
          <span className="sr-only">{m.hvac.shell.loading}</span>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
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
