"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BellOff,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Gauge,
  Hourglass,
  Lightbulb,
  Plus,
  SearchX,
  Stethoscope,
  TriangleAlert,
  Wrench,
  WifiOff,
  type LucideIcon,
  ScanSearch,
  CalendarCheck2,
  Activity,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { api, partName, SENSOR_LABELS, type AssetDetail } from "@/lib/api";
import type { MaintenanceType, SensorKind, TimeRange } from "@/lib/types";
import { formatDate, formatDays, formatRelative, formatRulRange } from "@/lib/format";
import { useNow, useQuery } from "@/lib/use-query";
import { PageHeader, SectionHeading } from "@/components/pdm/page-header";
import { DataFreshness, ModelMeta } from "@/components/pdm/freshness";
import { ConfidenceBadge, PriorityChip, StatusChip, WorkOrderStatusChip } from "@/components/pdm/status";
import { EmptyState, ErrorState, LoadingBlock, SkeletonCard } from "@/components/pdm/states";
import { AlertItem } from "@/components/pdm/alert-item";
import { CreateWorkOrderDialog, draftFromAsset, type WorkOrderDraft } from "@/components/pdm/create-work-order-dialog";
import { HealthForecastChart } from "@/components/charts/health-forecast-chart";
import { SensorChart } from "@/components/charts/sensor-chart";
import { cn } from "@/lib/utils";

const ALL_SENSORS: SensorKind[] = ["vibration", "temperature", "pressure", "current"];
const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
];

export function AssetDetailView({ id }: { id: string }) {
  const { data, error, loading, retry } = useQuery(`asset:${id}`, () => api.getAsset(id));
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const now = useNow();

  if (error) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumb name={id} />
        <ErrorState title="Couldn’t load this asset" error={error} onRetry={retry} />
      </div>
    );
  }
  if (loading || data === undefined) return <DetailSkeleton id={id} />;
  if (data === null) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumb name={id} />
        <h1 className="sr-only">Asset not found</h1>
        <EmptyState
          icon={SearchX}
          title={`No asset with ID “${id}”`}
          description="It may have been decommissioned or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link href="/assets">Back to assets</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { asset } = data;
  const offline = asset.status === "offline";
  const openDraft = () => setDraft({ ...draftFromAsset(asset, asset.primaryAlert), returnFocusId: "page-title" });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={asset.name}
        meta={
          <>
            <StatusChip status={asset.status} />
            <span className="text-xs text-text-secondary">
              {asset.id} · {asset.type} · {asset.siteName} › {asset.lineName}
            </span>
            <span className="text-xs text-text-secondary">
              {asset.manufacturer} {asset.model} · Criticality {asset.criticality}
            </span>
            <DataFreshness at={asset.lastDataAt} label="Last data" />
          </>
        }
        actions={
          <>
            {asset.openAlerts > 0 ? (
              <Button variant="outline" asChild>
                <Link href={`/alerts?asset=${asset.id}`}>
                  <TriangleAlert aria-hidden />
                  {asset.openAlerts} open alert{asset.openAlerts === 1 ? "" : "s"}
                </Link>
              </Button>
            ) : null}
            {asset.openWorkOrderId ? (
              <Button variant="outline" asChild>
                <Link href={`/work-orders?wo=${asset.openWorkOrderId}`}>
                  <ClipboardList aria-hidden />
                  {asset.openWorkOrderId}
                </Link>
              </Button>
            ) : null}
            <Button onClick={openDraft}>
              <Plus aria-hidden />
              Create work order
            </Button>
          </>
        }
      >
        <Breadcrumb name={asset.name} />
      </PageHeader>

      {offline ? (
        <div className="flex items-start gap-3 rounded-lg border border-offline-border bg-offline-bg p-3 text-sm">
          <WifiOff aria-hidden className="mt-0.5 size-5 shrink-0 text-offline" />
          <div>
            <p className="font-semibold text-offline-fg">No data since {format(new Date(asset.lastDataAt), "MMM d, HH:mm")} ({formatRelative(asset.lastDataAt, now)})</p>
            <p className="text-text-secondary">Predictions are paused. Health score and RUL below are the last known values and may be out of date.</p>
          </div>
        </div>
      ) : null}

      <PredictionSummary detail={data} now={now} onCreateWorkOrder={openDraft} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {data.health.length === 0 ? (
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="hf-empty">
              <h2 id="hf-empty" className="font-semibold">
                Health score and RUL forecast
              </h2>
              <EmptyState compact icon={Hourglass} title="Collecting baseline data" description="Health scores and RUL forecasts appear after 14 days of sensor data. Check back soon." />
            </section>
          ) : (
            <HealthForecastChart points={data.health} prediction={asset.prediction} settings={data.settings} now={now} stale={offline} />
          )}
        </div>
        <ContributingFactors detail={data} />
      </div>

      <SensorSection detail={data} />

      <div className="grid gap-6 xl:grid-cols-3">
        <MaintenanceTimeline detail={data} />
        <section aria-labelledby="asset-activity" className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <SectionHeading id="asset-activity" title="Alerts and work orders" description="For this asset" />
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Alerts</h3>
            {data.alerts.length === 0 ? (
              <p className="py-3 text-sm text-text-secondary">No alerts for this asset.</p>
            ) : (
              <ul className="divide-y">
                {data.alerts.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <AlertItem alert={a} now={now} showAsset={false} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Work orders</h3>
            {data.workOrders.length === 0 ? (
              <p className="py-3 text-sm text-text-secondary">No work orders for this asset.</p>
            ) : (
              <ul className="divide-y">
                {data.workOrders.map((w) => (
                  <li key={w.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <WorkOrderStatusChip status={w.status} />
                      <PriorityChip priority={w.priority} />
                    </div>
                    <Link href={`/work-orders?wo=${w.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                      <span className="text-muted-foreground">{w.id}</span> {w.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">Due {formatDate(w.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)} draft={draft} />
    </div>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-xs text-text-secondary">
        <li>
          <Link href="/assets" className="text-link underline underline-offset-2 hover:decoration-2">
            Assets
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="size-3.5" />
        </li>
        <li aria-current="page" className="truncate">
          {name}
        </li>
      </ol>
    </nav>
  );
}

function DetailSkeleton({ id }: { id: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Breadcrumb name={id} />
      <LoadingBlock label="Loading asset details…" lines={2} className="w-80" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} height="h-40" />
        ))}
      </div>
      <SkeletonCard height="h-80" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} height="h-64" />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ title, icon: Icon, children, className }: { title: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
  const id = `sum-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4", className)}>
      <h2 id={id} className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function PredictionSummary({ detail, now, onCreateWorkOrder }: { detail: AssetDetail; now: number; onCreateWorkOrder: () => void }) {
  const { asset, settings } = detail;
  const p = asset.prediction;
  const offline = asset.status === "offline";
  const zone = asset.healthScore < settings.healthCriticalBelow ? "critical" : asset.healthScore < settings.healthWarningBelow ? "warning" : "healthy";

  if (!p) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Health score" icon={Gauge}>
          <p className="text-sm text-text-secondary">Not available yet</p>
        </SummaryCard>
        <SummaryCard title="Prediction" icon={Hourglass} className="md:col-span-1 xl:col-span-3">
          <p className="font-medium">Collecting baseline data</p>
          <p className="text-sm text-text-secondary">
            The model needs about 14 days of readings to learn this asset’s normal behavior. Remaining useful life, failure mode and recommendations appear after that.
          </p>
        </SummaryCard>
      </div>
    );
  }

  const failFrom = new Date(now + p.rulLow * 86_400_000);
  const failTo = new Date(now + p.rulHigh * 86_400_000);
  const top = p.failureModes[0];
  const degrading = asset.status === "critical" || asset.status === "warning";

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="Health score" icon={Gauge}>
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{asset.healthScore}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </p>
        <p className={cn("text-xs font-medium", asset.healthDelta7d < 0 ? "text-critical-fg" : "text-text-secondary")}>
          {asset.healthDelta7d === 0 ? "No change" : `${asset.healthDelta7d > 0 ? "+" : "−"}${Math.abs(asset.healthDelta7d)} pts`} in 7 days
        </p>
        <p className="text-xs text-text-secondary">
          {zone === "critical"
            ? `Below the critical level (${settings.healthCriticalBelow})`
            : zone === "warning"
              ? `Below the warning level (${settings.healthWarningBelow})`
              : `Above the warning level (${settings.healthWarningBelow})`}
        </p>
        <DataFreshness at={asset.lastDataAt} label="Updated" className="mt-auto" />
      </SummaryCard>

      <SummaryCard title="Remaining useful life (RUL)" icon={Hourglass}>
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{formatDays(p.rulDays).replace(" d", "")}</span>
          <span className="text-sm text-muted-foreground">{p.rulDays > 180 ? "days" : "days (median)"}</span>
        </p>
        <p className="text-xs text-text-secondary">
          {Math.round(p.intervalLevel * 100)}% interval: <span className="font-medium text-foreground">{formatRulRange(p.rulLow, p.rulHigh)}</span>
          {degrading && !offline ? (
            <>
              <br />
              Likely failure between {format(failFrom, "MMM d")} and {format(failTo, "MMM d")}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge value={p.confidence} minimum={settings.minConfidence} />
        </div>
        <ModelMeta version={p.modelVersion} scoredAt={p.scoredAt} className="mt-auto" />
      </SummaryCard>

      <SummaryCard title="Predicted failure mode" icon={Stethoscope}>
        {degrading ? (
          <>
            <p className="font-semibold leading-snug">{top.mode}</p>
            <ul className="flex flex-col gap-1.5" aria-label="Failure mode probabilities">
              {p.failureModes.map((m) => (
                <li key={m.mode} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="truncate text-text-secondary" title={m.mode}>
                    {m.mode}
                  </span>
                  <span className="text-right font-medium tabular">{Math.round(m.probability * 100)}%</span>
                  <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-accent">
                    <span className="block h-full rounded-full bg-chart-1" style={{ width: `${m.probability * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-auto text-xs text-muted-foreground">Failure probability within 30 days: {Math.round(p.failureProbability30d * 100)}%</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 font-medium">
              <CircleCheck aria-hidden className="size-4 text-healthy" />
              No failure mode indicated
            </p>
            <p className="text-xs text-text-secondary">Failure probability within 30 days: {(p.failureProbability30d * 100).toFixed(1)}%</p>
          </>
        )}
      </SummaryCard>

      <SummaryCard title="Recommended action" icon={Lightbulb}>
        <p className="text-sm leading-snug">{offline ? "Check the sensor power and the edge gateway, then confirm data is flowing again." : p.recommendedAction}</p>
        {p.recommendedParts.length > 0 && !offline ? (
          <ul className="flex flex-col gap-1 text-xs" aria-label="Recommended parts">
            {p.recommendedParts.map((pn) => {
              const part = detail.parts.find((x) => x.partNo === pn);
              const out = part ? part.inStock === 0 : false;
              return (
                <li key={pn} className="flex items-start gap-1.5">
                  {out ? <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-healthy" />}
                  <span>
                    {partName(pn)}{" "}
                    <span className={out ? "font-medium text-warning-fg" : "text-muted-foreground"}>
                      {out ? `· out of stock, ${part?.leadTimeDays} d lead time` : `· ${part?.inStock} in stock`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-auto pt-1">
          {asset.openWorkOrderId ? (
            <Button variant="outline" asChild className="w-full">
              <Link href={`/work-orders?wo=${asset.openWorkOrderId}`}>
                <ClipboardList aria-hidden />
                View {asset.openWorkOrderId}
              </Link>
            </Button>
          ) : (
            <Button className="w-full" onClick={onCreateWorkOrder} variant={degrading || offline ? "default" : "outline"}>
              <Plus aria-hidden />
              Create work order
            </Button>
          )}
        </div>
      </SummaryCard>
    </div>
  );
}

function ContributingFactors({ detail }: { detail: AssetDetail }) {
  const p = detail.asset.prediction;
  const factors = p?.contributingFactors ?? [];
  return (
    <section aria-labelledby="factors" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="factors" title="Contributing factors" description="What drives this prediction, by share of model attribution" />
      {factors.length === 0 ? (
        <EmptyState compact icon={CircleCheck} title="No degradation drivers" description="All sensor features are close to this asset’s learned baseline." />
      ) : (
        <ol className="flex flex-col gap-3">
          {factors.map((f, i) => (
            <li key={f.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  <span className="sr-only">Factor {i + 1}: </span>
                  {f.label}
                </span>
                <span className="text-sm font-semibold tabular">{Math.round(f.weight * 100)}%</span>
              </div>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-accent">
                <span className="block h-full rounded-full bg-chart-1" style={{ width: `${f.weight * 100}%` }} />
              </span>
              <span className="text-xs text-text-secondary">{f.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SensorSection({ detail }: { detail: AssetDetail }) {
  const [range, setRange] = useState<TimeRange>("30d");
  const { asset } = detail;
  return (
    <section aria-labelledby="sensors" className="flex flex-col gap-3">
      <SectionHeading
        id="sensors"
        title="Sensor data"
        description="Threshold lines and anomaly markers are shown on every chart. Use “View table” for exact values."
        actions={
          <div role="group" aria-label="Time range" className="inline-flex rounded-lg border bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "h-8 min-w-12 rounded-md px-2.5 text-sm font-medium text-text-secondary hover:bg-accent hover:text-foreground",
                  range === r.value && "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {ALL_SENSORS.map((kind) =>
          asset.sensors.includes(kind) ? (
            <SensorPanel key={kind} assetId={asset.id} kind={kind} range={range} />
          ) : (
            <section key={kind} aria-labelledby={`nosensor-${kind}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h3 id={`nosensor-${kind}`} className="font-semibold">
                {SENSOR_LABELS[kind]}
              </h3>
              <EmptyState compact icon={Activity} title="Not instrumented" description={`This ${asset.type.toLowerCase()} has no ${SENSOR_LABELS[kind].toLowerCase()} sensor.`} className="flex-1" />
            </section>
          ),
        )}
      </div>
    </section>
  );
}

function SensorPanel({ assetId, kind, range }: { assetId: string; kind: SensorKind; range: TimeRange }) {
  const { data, error, loading, retry } = useQuery(`sensor:${assetId}:${kind}:${range}`, () => api.getSensorSeries(assetId, kind, range));
  if (error) return <ErrorState compact title={`Couldn’t load ${SENSOR_LABELS[kind].toLowerCase()} data`} error={error} onRetry={retry} />;
  if (loading || data === undefined)
    return (
      <div className="flex h-[22rem] flex-col gap-3 rounded-lg border bg-card p-4" aria-busy="true">
        <LoadingBlock label={`Loading ${SENSOR_LABELS[kind]} data…`} lines={1} className="w-48" />
        <SkeletonCard className="flex-1" />
      </div>
    );
  if (!data || data.points.length === 0 || data.points.every((p) => p.v === null))
    return (
      <section aria-labelledby={`empty-${kind}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h3 id={`empty-${kind}`} className="font-semibold">
          {SENSOR_LABELS[kind]}
        </h3>
        <EmptyState compact icon={BellOff} title="No readings in this time range" description="The sensor hasn’t reported data for the selected period. Try a longer range." className="flex-1" />
      </section>
    );
  return <SensorChart series={data} range={range} />;
}

const HISTORY_META: Record<MaintenanceType, { label: string; icon: LucideIcon; className: string }> = {
  preventive: { label: "Preventive", icon: CalendarCheck2, className: "text-healthy" },
  corrective: { label: "Corrective", icon: Wrench, className: "text-critical" },
  inspection: { label: "Inspection", icon: ScanSearch, className: "text-info" },
  predictive: { label: "Predictive", icon: Activity, className: "text-chart-1" },
};

function MaintenanceTimeline({ detail }: { detail: AssetDetail }) {
  const upcoming = detail.workOrders.filter((w) => w.status !== "done");
  return (
    <section aria-labelledby="history" className="flex flex-col gap-3 rounded-lg border bg-card p-4 xl:col-span-2">
      <SectionHeading id="history" title="Maintenance history" description="Most recent first, last 24 months" />
      {upcoming.length > 0 ? (
        <div className="rounded-md border border-dashed p-3">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Planned</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <WorkOrderStatusChip status={w.status} />
                <Link href={`/work-orders?wo=${w.id}`} className="font-medium underline-offset-2 hover:underline">
                  {w.id}
                </Link>
                <span className="text-text-secondary">{w.title}</span>
                <span className="text-xs text-muted-foreground">due {formatDate(w.dueDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.history.length === 0 ? (
        <EmptyState compact icon={Wrench} title="No maintenance recorded" description="Completed work orders and inspections for this asset will appear here." />
      ) : (
        <ol className="relative ml-3 border-l pl-6">
          {detail.history.map((h) => {
            const meta = HISTORY_META[h.type];
            const Icon = meta.icon;
            return (
              <li key={h.id} className="relative pb-5 last:pb-0">
                <span aria-hidden className="absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full border bg-card">
                  <Icon className={cn("size-3.5", meta.className)} />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <time dateTime={h.date} className="text-xs font-medium text-text-secondary tabular">
                    {formatDate(h.date)}
                  </time>
                  <span className="text-xs font-semibold text-text-secondary">{meta.label}</span>
                </div>
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-xs text-text-secondary">
                  {h.technician} · {h.downtimeHours > 0 ? `${h.downtimeHours} h downtime` : "No downtime"} · {h.notes}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
