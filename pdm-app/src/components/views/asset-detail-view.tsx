"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  BellOff,
  CalendarCheck2,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Gauge,
  Hourglass,
  Lightbulb,
  Plus,
  ScanSearch,
  SearchX,
  Stethoscope,
  TriangleAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type AssetDetail } from "@/lib/api";
import type { MaintenanceType, SensorKind, TimeRange } from "@/lib/types";
import { useNow, useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
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
const RANGES: TimeRange[] = ["24h", "7d", "30d", "90d"];

export function AssetDetailView({ id }: { id: string }) {
  const { m, f } = useI18n();
  const d = m.assetDetail;
  const { data, error, loading, retry } = useQuery(`asset:${id}`, () => api.getAsset(id));
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const now = useNow();

  if (error) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumb name={id} />
        <ErrorState title={d.errorTitle} error={error} onRetry={retry} />
      </div>
    );
  }
  if (loading || data === undefined) return <DetailSkeleton id={id} />;
  if (data === null) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumb name={id} />
        <h1 className="sr-only">{d.notFound}</h1>
        <EmptyState
          icon={SearchX}
          title={d.notFoundTitle(id)}
          description={d.notFoundDesc}
          action={
            <Button asChild variant="outline">
              <Link href="/app/assets">{d.back}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { asset } = data;
  const offline = asset.status === "offline";
  const openDraft = () => setDraft({ ...draftFromAsset(asset, asset.primaryAlert, m), returnFocusId: "page-title" });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={asset.name}
        meta={
          <>
            <StatusChip status={asset.status} />
            <span className="text-xs text-text-secondary">
              {asset.id} · {m.assetTypes[asset.type]} · {asset.siteName} › {asset.lineName}
            </span>
            <span className="text-xs text-text-secondary">
              {asset.manufacturer} {asset.model} · {d.criticality(asset.criticality)}
            </span>
            <DataFreshness at={asset.lastDataAt} label={m.freshness.lastData} />
          </>
        }
        actions={
          <>
            {asset.openAlerts > 0 ? (
              <Button variant="outline" asChild>
                <Link href={`/app/alerts?asset=${asset.id}`}>
                  <TriangleAlert aria-hidden />
                  {d.openAlerts(asset.openAlerts)}
                </Link>
              </Button>
            ) : null}
            {asset.openWorkOrderId ? (
              <Button variant="outline" asChild>
                <Link href={`/app/work-orders?wo=${asset.openWorkOrderId}`}>
                  <ClipboardList aria-hidden />
                  {asset.openWorkOrderId}
                </Link>
              </Button>
            ) : null}
            <Button onClick={openDraft}>
              <Plus aria-hidden />
              {d.createWo}
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
            <p className="font-semibold text-offline-fg">{d.offlineTitle(f.dateTime(asset.lastDataAt), f.relative(asset.lastDataAt, now))}</p>
            <p className="text-text-secondary">{d.offlineDesc}</p>
          </div>
        </div>
      ) : null}

      <PredictionSummary detail={data} now={now} onCreateWorkOrder={openDraft} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {data.health.length === 0 ? (
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="hf-empty">
              <h2 id="hf-empty" className="font-semibold">
                {m.healthChart.title}
              </h2>
              <EmptyState compact icon={Hourglass} title={d.collecting} description={d.collectingChart} />
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
        <section aria-labelledby="asset-activity" className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4">
          <SectionHeading id="asset-activity" title={d.activity} description={d.activityDesc} />
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d.alerts}</h3>
            {data.alerts.length === 0 ? (
              <p className="py-3 text-sm text-text-secondary">{d.noAlerts}</p>
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
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d.workOrders}</h3>
            {data.workOrders.length === 0 ? (
              <p className="py-3 text-sm text-text-secondary">{d.noWorkOrders}</p>
            ) : (
              <ul className="divide-y">
                {data.workOrders.map((w) => (
                  <li key={w.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <WorkOrderStatusChip status={w.status} />
                      <PriorityChip priority={w.priority} />
                    </div>
                    <Link href={`/app/work-orders?wo=${w.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                      <span className="text-muted-foreground">{w.id}</span> {w.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{d.dueLabel(f.date(w.dueDate))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)} draft={draft} />
    </div>
  );
}

function Breadcrumb({ name }: { name: string }) {
  const { m } = useI18n();
  return (
    <nav aria-label={m.assetDetail.breadcrumb}>
      <ol className="flex items-center gap-1 text-xs text-text-secondary">
        <li>
          <Link href="/app/assets" className="text-link underline underline-offset-2 hover:decoration-2">
            {m.nav.assets}
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
  const { m } = useI18n();
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Breadcrumb name={id} />
      <LoadingBlock label={m.assetDetail.loading} lines={2} className="w-80" />
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

function SummaryCard({ id, title, icon: Icon, children, className }: { id: string; title: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
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
  const { m, f } = useI18n();
  const d = m.assetDetail;
  const { asset, settings } = detail;
  const p = asset.prediction;
  const offline = asset.status === "offline";
  const zone = asset.healthScore < settings.healthCriticalBelow ? "critical" : asset.healthScore < settings.healthWarningBelow ? "warning" : "healthy";

  if (!p) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard id="sum-health" title={d.health} icon={Gauge}>
          <p className="text-sm text-text-secondary">{d.notAvailable}</p>
        </SummaryCard>
        <SummaryCard id="sum-prediction" title={d.prediction} icon={Hourglass} className="md:col-span-1 xl:col-span-3">
          <p className="font-medium">{d.collecting}</p>
          <p className="text-sm text-text-secondary">{d.collectingDesc}</p>
        </SummaryCard>
      </div>
    );
  }

  const failFrom = now + p.rulLow * 86_400_000;
  const failTo = now + p.rulHigh * 86_400_000;
  const top = p.failureModes[0];
  const degrading = asset.status === "critical" || asset.status === "warning";

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard id="sum-health" title={d.health} icon={Gauge}>
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{asset.healthScore}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </p>
        <p className={cn("text-xs font-medium", asset.healthDelta7d < 0 ? "text-critical-fg" : "text-text-secondary")}>{d.deltaIn7d(asset.healthDelta7d)}</p>
        <p className="text-xs text-text-secondary">
          {zone === "critical" ? d.belowCritical(settings.healthCriticalBelow) : zone === "warning" ? d.belowWarning(settings.healthWarningBelow) : d.aboveWarning(settings.healthWarningBelow)}
        </p>
        <DataFreshness at={asset.lastDataAt} label={m.freshness.updated} className="mt-auto" />
      </SummaryCard>

      <SummaryCard id="sum-rul" title={d.rulTitle} icon={Hourglass}>
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{p.rulDays > 180 ? "> 180" : p.rulDays}</span>
          <span className="text-sm text-muted-foreground">{p.rulDays > 180 ? d.days : d.daysMedian}</span>
        </p>
        <p className="text-xs text-text-secondary">
          {d.intervalLabel(Math.round(p.intervalLevel * 100))}
          <span className="font-medium text-foreground">{f.rulRange(p.rulLow, p.rulHigh)}</span>
          {degrading && !offline ? (
            <>
              <br />
              {d.likelyFailure(f.shortDate(failFrom), f.shortDate(failTo))}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge value={p.confidence} minimum={settings.minConfidence} />
        </div>
        <ModelMeta version={p.modelVersion} scoredAt={p.scoredAt} className="mt-auto" />
      </SummaryCard>

      <SummaryCard id="sum-mode" title={d.failureMode} icon={Stethoscope}>
        {degrading ? (
          <>
            <p className="leading-snug font-semibold">{top.mode}</p>
            <ul className="flex flex-col gap-1.5" aria-label={d.probabilities}>
              {p.failureModes.map((fm) => (
                <li key={fm.mode} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="truncate text-text-secondary" title={fm.mode}>
                    {fm.mode}
                  </span>
                  <span className="text-right font-medium tabular">{Math.round(fm.probability * 100)}%</span>
                  <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-accent">
                    <span className="block h-full rounded-full bg-chart-1" style={{ width: `${fm.probability * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-auto text-xs text-muted-foreground">{d.p30(String(Math.round(p.failureProbability30d * 100)))}</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 font-medium">
              <CircleCheck aria-hidden className="size-4 text-healthy" />
              {d.noFailureMode}
            </p>
            <p className="text-xs text-text-secondary">{d.p30((p.failureProbability30d * 100).toFixed(1))}</p>
          </>
        )}
      </SummaryCard>

      <SummaryCard id="sum-action" title={d.action} icon={Lightbulb}>
        <p className="text-sm leading-snug">{offline ? d.offlineAction : p.recommendedAction}</p>
        {p.recommendedParts.length > 0 && !offline ? (
          <ul className="flex flex-col gap-1 text-xs" aria-label={d.parts}>
            {p.recommendedParts.map((pn) => {
              const part = detail.parts.find((x) => x.partNo === pn);
              const out = part ? part.inStock === 0 : false;
              return (
                <li key={pn} className="flex items-start gap-1.5">
                  {out ? <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-healthy" />}
                  <span>
                    {api.partName(pn)}{" "}
                    <span className={out ? "font-medium text-warning-fg" : "text-muted-foreground"}>{out ? d.outOfStock(part?.leadTimeDays ?? 0) : d.inStock(part?.inStock ?? 0)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-auto pt-1">
          {asset.openWorkOrderId ? (
            <Button variant="outline" asChild className="w-full">
              <Link href={`/app/work-orders?wo=${asset.openWorkOrderId}`}>
                <ClipboardList aria-hidden />
                {d.viewWo(asset.openWorkOrderId)}
              </Link>
            </Button>
          ) : (
            <Button className="w-full" onClick={onCreateWorkOrder} variant={degrading || offline ? "default" : "outline"}>
              <Plus aria-hidden />
              {d.createWo}
            </Button>
          )}
        </div>
      </SummaryCard>
    </div>
  );
}

function ContributingFactors({ detail }: { detail: AssetDetail }) {
  const { m } = useI18n();
  const d = m.assetDetail;
  const p = detail.asset.prediction;
  const factors = p?.contributingFactors ?? [];
  return (
    <section aria-labelledby="factors" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="factors" title={d.factors} description={d.factorsDesc} />
      {factors.length === 0 ? (
        <EmptyState compact icon={CircleCheck} title={d.factorsEmptyTitle} description={d.factorsEmptyDesc} />
      ) : (
        <ol className="flex flex-col gap-3">
          {factors.map((factor, i) => (
            <li key={factor.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  <span className="sr-only">{d.factorN(i + 1)}</span>
                  {factor.label}
                </span>
                <span className="text-sm font-semibold tabular">{Math.round(factor.weight * 100)}%</span>
              </div>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-accent">
                <span className="block h-full rounded-full bg-chart-1" style={{ width: `${factor.weight * 100}%` }} />
              </span>
              <span className="text-xs text-text-secondary">{factor.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SensorSection({ detail }: { detail: AssetDetail }) {
  const { m } = useI18n();
  const d = m.assetDetail;
  const [range, setRange] = useState<TimeRange>("30d");
  const { asset } = detail;
  return (
    <section aria-labelledby="sensors" className="flex flex-col gap-3">
      <SectionHeading
        id="sensors"
        title={d.sensors}
        description={d.sensorsDesc}
        actions={
          <div role="group" aria-label={d.timeRange} className="inline-flex rounded-lg border bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  "h-8 min-w-12 rounded-md px-2.5 text-sm font-medium text-text-secondary hover:bg-accent hover:text-foreground",
                  range === r && "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
                )}
              >
                {d.ranges[r]}
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
                {m.sensors[kind]}
              </h3>
              <EmptyState compact icon={Activity} title={d.notInstrumented} description={d.notInstrumentedDesc(m.sensors[kind])} className="flex-1" />
            </section>
          ),
        )}
      </div>
    </section>
  );
}

function SensorPanel({ assetId, kind, range }: { assetId: string; kind: SensorKind; range: TimeRange }) {
  const { m } = useI18n();
  const d = m.assetDetail;
  const label = m.sensors[kind];
  const { data, error, loading, retry } = useQuery(`sensor:${assetId}:${kind}:${range}`, () => api.getSensorSeries(assetId, kind, range));
  if (error) return <ErrorState compact title={d.sensorError(label)} error={error} onRetry={retry} />;
  if (loading || data === undefined)
    return (
      <div className="flex h-[22rem] flex-col gap-3 rounded-lg border bg-card p-4" aria-busy="true">
        <LoadingBlock label={d.sensorLoading(label)} lines={1} className="w-48" />
        <SkeletonCard className="flex-1" />
      </div>
    );
  if (!data || data.points.length === 0 || data.points.every((p) => p.v === null))
    return (
      <section aria-labelledby={`empty-${kind}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h3 id={`empty-${kind}`} className="font-semibold">
          {label}
        </h3>
        <EmptyState compact icon={BellOff} title={d.noReadingsTitle} description={d.noReadingsDesc} className="flex-1" />
      </section>
    );
  return <SensorChart series={data} range={range} />;
}

const HISTORY_META: Record<MaintenanceType, { icon: LucideIcon; className: string }> = {
  preventive: { icon: CalendarCheck2, className: "text-healthy" },
  corrective: { icon: Wrench, className: "text-critical" },
  inspection: { icon: ScanSearch, className: "text-info" },
  predictive: { icon: Activity, className: "text-chart-1" },
};

function MaintenanceTimeline({ detail }: { detail: AssetDetail }) {
  const { m, f } = useI18n();
  const d = m.assetDetail;
  const upcoming = detail.workOrders.filter((w) => w.status !== "done");
  return (
    <section aria-labelledby="history" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 xl:col-span-2">
      <SectionHeading id="history" title={d.history} description={d.historyDesc} />
      {upcoming.length > 0 ? (
        <div className="rounded-md border border-dashed p-3">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d.planned}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <WorkOrderStatusChip status={w.status} />
                <Link href={`/app/work-orders?wo=${w.id}`} className="font-medium underline-offset-2 hover:underline">
                  {w.id}
                </Link>
                <span className="text-text-secondary">{w.title}</span>
                <span className="text-xs text-muted-foreground">{d.dueOn(f.date(w.dueDate))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.history.length === 0 ? (
        <EmptyState compact icon={Wrench} title={d.historyEmptyTitle} description={d.historyEmptyDesc} />
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
                    {f.date(h.date)}
                  </time>
                  <span className="text-xs font-semibold text-text-secondary">{m.status.maintenanceType[h.type]}</span>
                </div>
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-xs text-text-secondary">
                  {h.technician} · {h.downtimeHours > 0 ? d.downtime(h.downtimeHours) : d.noDowntime} · {h.notes}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
