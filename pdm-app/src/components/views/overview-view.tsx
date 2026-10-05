"use client";

import Link from "next/link";
import { useState } from "react";
import { BellOff, CalendarClock, ChevronDown, ChevronUp, ClipboardList, PartyPopper, Plus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSite } from "@/components/providers";
import { api, type AssetRow, type OverviewData } from "@/lib/api";
import { useNow, useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader, SectionHeading } from "@/components/pdm/page-header";
import { DataFreshness, ModelMeta } from "@/components/pdm/freshness";
import { KpiCard, type KpiDelta } from "@/components/pdm/kpi-card";
import { ConfidenceBadge, DueChip, PriorityChip, StatusChip, TONE_SOLID } from "@/components/pdm/status";
import { HealthMeter } from "@/components/pdm/health-meter";
import { EmptyState, ErrorState, LoadingBlock, SkeletonCard } from "@/components/pdm/states";
import { AlertItem } from "@/components/pdm/alert-item";
import { CreateWorkOrderDialog, draftFromAsset, type WorkOrderDraft } from "@/components/pdm/create-work-order-dialog";
import { cn } from "@/lib/utils";

function delta(
  value: number,
  previous: number,
  opts: { higherIsBetter: boolean; unit?: string; digits?: number; percent?: boolean; noChange: string; comparison: string },
): KpiDelta {
  const diff = value - previous;
  const digits = opts.digits ?? 0;
  const flat = Math.abs(diff) < 10 ** -digits / 2;
  const text = opts.percent
    ? `${diff >= 0 ? "+" : "−"}${Math.abs((diff / previous) * 100).toFixed(0)}%`
    : `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(digits)}${opts.unit ?? ""}`;
  return {
    text: flat ? opts.noChange : text,
    direction: flat ? "flat" : diff > 0 ? "up" : "down",
    sentiment: flat ? "neutral" : diff > 0 === opts.higherIsBetter ? "good" : "bad",
    comparison: opts.comparison,
  };
}

export function OverviewView() {
  const { m } = useI18n();
  const o = m.overview;
  const { siteId } = useSite();
  const { data, error, loading, retry } = useQuery(`overview:${siteId}`, () => api.getOverview(siteId));
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const now = useNow();
  const scope = siteId ? api.sites().find((s) => s.id === siteId)?.name : m.common.allSites;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={o.title}
        description={o.description(scope ?? "")}
        meta={
          data ? (
            <>
              <DataFreshness at={data.dataUpdatedAt} />
              <ModelMeta version={data.modelVersion} scoredAt={data.scoredAt} />
              <span className="text-xs text-muted-foreground">{o.monitored(data.assetCount)}</span>
            </>
          ) : null
        }
      />

      {error ? (
        <ErrorState title={o.errorTitle} error={error} onRetry={retry} />
      ) : loading || !data ? (
        <OverviewSkeleton />
      ) : (
        <>
          <KpiRow data={data} />
          <div className="grid gap-6 xl:grid-cols-3">
            <AttentionList assets={data.attention} now={now} onCreateWorkOrder={(a) => setDraft({ ...draftFromAsset(a, a.primaryAlert, m), returnFocusId: `att-link-${a.id}` })} />
            <section aria-labelledby="recent-alerts" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
              <SectionHeading
                id="recent-alerts"
                title={o.recentAlerts}
                description={o.recentAlertsDesc}
                actions={
                  <Link href="/app/alerts" className="text-xs font-medium text-link underline underline-offset-2 hover:decoration-2">
                    {o.viewAllAlerts}
                  </Link>
                }
              />
              {data.recentAlerts.length === 0 ? (
                <EmptyState compact icon={BellOff} title={o.noAlertsTitle} description={o.noAlertsDesc} />
              ) : (
                <ul className="divide-y">
                  {data.recentAlerts.map((a) => (
                    <li key={a.id}>
                      <AlertItem alert={a} now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <SiteHealth data={data.siteHealth} />
            <DueWorkOrders orders={data.dueWorkOrders} now={now} />
          </div>
        </>
      )}

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)} draft={draft} />
    </div>
  );
}

function OverviewSkeleton() {
  const { m } = useI18n();
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <LoadingBlock label={m.overview.loading} lines={1} className="w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <SkeletonCard className="xl:col-span-2" height="h-96" />
        <SkeletonCard height="h-96" />
      </div>
    </div>
  );
}

function KpiRow({ data }: { data: OverviewData }) {
  const { m, f } = useI18n();
  const o = m.overview;
  const atRisk = data.atRisk.critical + data.atRisk.warning;
  const atRiskDiff = atRisk - data.atRisk.previous;
  const vs30 = { noChange: m.kpi.noChange, comparison: o.vsPrev30 };
  return (
    <section aria-labelledby="kpis-heading">
      <h2 id="kpis-heading" className="sr-only">
        {o.kpisHeading}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={o.atRisk}
          value={String(atRisk)}
          emphasis={data.atRisk.critical > 0 ? "critical" : atRisk > 0 ? "warning" : undefined}
          delta={{
            text: atRiskDiff === 0 ? m.kpi.noChange : `${atRiskDiff > 0 ? "+" : "−"}${Math.abs(atRiskDiff)}`,
            direction: atRiskDiff > 0 ? "up" : atRiskDiff < 0 ? "down" : "flat",
            sentiment: atRiskDiff > 0 ? "bad" : atRiskDiff < 0 ? "good" : "neutral",
            comparison: o.vs7d,
          }}
          href="/app/assets?status=critical,warning"
          hrefLabel={o.atRiskLink}
        >
          <p className="flex flex-wrap gap-x-2 text-xs">
            <span className="font-medium text-critical-fg">{o.criticalCount(data.atRisk.critical)}</span>
            <span className="font-medium text-warning-fg">{o.warningCount(data.atRisk.warning)}</span>
          </p>
        </KpiCard>
        <KpiCard label={o.predicted} value={String(data.predicted7d.length)} unit={o.in7d} emphasis={data.predicted7d.length > 0 ? "critical" : undefined} href="/app/assets?sort=rul" hrefLabel={o.viewByRul}>
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-foreground">{data.predicted30d.length}</span> {o.in30dSuffix}
          </p>
        </KpiCard>
        <KpiCard label="MTBF" value={f.number(data.mtbf.value)} unit={o.hoursUnit} delta={delta(data.mtbf.value, data.mtbf.previous, { higherIsBetter: true, percent: true, ...vs30 })} />
        <KpiCard label="MTTR" value={data.mttr.value.toFixed(1)} unit={o.hoursUnit} delta={delta(data.mttr.value, data.mttr.previous, { higherIsBetter: false, unit: o.hoursDelta, digits: 1, ...vs30 })} />
        <KpiCard label="OEE" value={(data.oee.value * 100).toFixed(1)} unit="%" delta={delta(data.oee.value * 100, data.oee.previous * 100, { higherIsBetter: true, unit: o.pointsDelta, digits: 1, ...vs30 })} />
        <KpiCard
          label={o.downtime}
          value={data.downtime.value.toFixed(0)}
          unit={o.downtimeUnit}
          delta={delta(data.downtime.value, data.downtime.previous, { higherIsBetter: false, unit: o.hoursDelta, digits: 0, ...vs30 })}
        />
      </div>
    </section>
  );
}

function AttentionList({ assets, now, onCreateWorkOrder }: { assets: AssetRow[]; now: number; onCreateWorkOrder: (a: AssetRow) => void }) {
  const { m } = useI18n();
  const o = m.overview;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? assets : assets.slice(0, 5);
  return (
    <section aria-labelledby="attention-heading" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 xl:col-span-2">
      <SectionHeading
        id="attention-heading"
        title={o.attention}
        description={o.attentionDesc}
        actions={
          <Link href="/app/assets?status=critical,warning,offline" className="text-xs font-medium text-link underline underline-offset-2 hover:decoration-2">
            {o.openInList}
          </Link>
        }
      />
      {assets.length === 0 ? (
        <EmptyState icon={PartyPopper} title={o.attentionEmptyTitle} description={o.attentionEmptyDesc} />
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {visible.map((a, i) => (
              <li key={a.id}>
                <AttentionItem asset={a} rank={i + 1} now={now} onCreateWorkOrder={() => onCreateWorkOrder(a)} />
              </li>
            ))}
          </ol>
          {assets.length > 5 ? (
            <Button variant="ghost" className="self-start" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              {expanded ? o.showFewer : o.showAll(assets.length)}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

function AttentionItem({ asset, rank, now, onCreateWorkOrder }: { asset: AssetRow; rank: number; now: number; onCreateWorkOrder: () => void }) {
  const { m, f } = useI18n();
  const o = m.overview;
  const p = asset.prediction;
  const offline = asset.status === "offline";
  const wo = asset.openWorkOrderId;
  const factor = p?.contributingFactors[0];
  return (
    <article
      aria-labelledby={`att-${asset.id}`}
      className={cn(
        "grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto]",
        asset.status === "critical" && "border-l-4 border-l-critical",
        asset.status === "warning" && "border-l-4 border-l-warning",
        offline && "border-l-4 border-l-offline",
      )}
    >
      {/* Which */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground tabular">
            <span aria-hidden>#{rank}</span>
            <span className="sr-only">{o.rank(rank)}</span>
          </span>
          <StatusChip status={asset.status} size="sm" />
        </div>
        <h3 id={`att-${asset.id}`} className="truncate font-semibold">
          <Link id={`att-link-${asset.id}`} href={`/app/assets/${asset.id}`} className="underline-offset-2 hover:underline">
            {asset.name}
          </Link>
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {asset.id} · {asset.siteName} · {asset.lineName}
        </p>
        <HealthMeter score={asset.healthScore} status={asset.status} delta={asset.healthDelta7d} showDelta />
      </div>

      {/* Why + what to do */}
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">
        {offline ? (
          <>
            <p className="flex items-center gap-1.5 font-medium">
              <WifiOff aria-hidden className="size-4 text-offline" />
              {o.noDataFor(f.duration(now - new Date(asset.lastDataAt).getTime()))}
            </p>
            <p className="text-xs text-text-secondary">{o.pausedLastKnown(asset.healthScore)}</p>
            <p className="text-xs">
              <span className="font-medium">{o.doLabel}</span>
              {o.doOffline}
            </p>
          </>
        ) : p ? (
          <>
            <p>
              <span className="sr-only">{o.srFailureMode}</span>
              <span className="font-medium">{p.failureModes[0].mode}</span>{" "}
              <span className="text-xs text-muted-foreground">{o.likely(Math.round(p.failureModes[0].probability * 100))}</span>
            </p>
            {factor ? (
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-foreground">{o.whyLabel}</span>
                {factor.label} {factor.detail}
              </p>
            ) : null}
            <p className="text-xs">
              <span className="font-medium">{o.doLabel}</span>
              {p.recommendedAction}
            </p>
          </>
        ) : null}
      </div>

      {/* When + action */}
      <div className="flex flex-row flex-wrap items-start justify-between gap-3 md:flex-col md:items-end">
        {p && !offline ? (
          <div className="md:text-right">
            <p className="text-xs text-muted-foreground">{o.rulLabel}</p>
            <p className="text-xl font-semibold">{f.days(p.rulDays)}</p>
            <p className="text-xs text-muted-foreground">{o.intervalShort(f.rulRange(p.rulLow, p.rulHigh), Math.round(p.intervalLevel * 100))}</p>
            <ConfidenceBadge value={p.confidence} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">
              {o.scored} <time dateTime={p.scoredAt}>{f.relative(p.scoredAt, now)}</time>
            </p>
          </div>
        ) : (
          <div className="md:text-right">
            <p className="text-xs text-muted-foreground">{o.rulLabel}</p>
            <p className="font-semibold text-text-secondary">{o.paused}</p>
          </div>
        )}
        {wo ? (
          <Button variant="outline" asChild>
            <Link href={`/app/work-orders?wo=${wo}`}>
              <ClipboardList aria-hidden />
              {wo}
              <span className="sr-only">{o.forAsset(asset.name)}</span>
            </Link>
          </Button>
        ) : (
          <Button onClick={onCreateWorkOrder}>
            <Plus aria-hidden />
            {o.workOrder}
            <span className="sr-only">{o.forAsset(asset.name)}</span>
          </Button>
        )}
      </div>
    </article>
  );
}

function SiteHealth({ data }: { data: OverviewData["siteHealth"] }) {
  const { m } = useI18n();
  const o = m.overview;
  const keys = ["critical", "warning", "offline", "healthy"] as const;
  const labels = m.status.asset;
  return (
    <section aria-labelledby="site-health" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="site-health" title={o.siteHealth} description={o.siteHealthDesc} />
      <ul aria-label={m.chart.legend} className="flex flex-wrap gap-x-4 gap-y-1">
        {keys.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span aria-hidden className={cn("status-dot size-2.5 rounded-sm", TONE_SOLID[k])} />
            {labels[k]}
          </li>
        ))}
      </ul>
      <table className="w-full text-sm">
        <caption className="sr-only">{o.siteHealthCaption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{o.colSite}</th>
            <th scope="col">{o.colDistribution}</th>
            {keys.map((k) => (
              <th key={k} scope="col">
                {labels[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((s) => {
            const total = keys.reduce((n, k) => n + s[k], 0);
            return (
              <tr key={s.siteId} className="align-middle">
                <th scope="row" className="py-2 pr-2 text-left text-sm font-medium whitespace-nowrap sm:pr-3">
                  {s.siteName}
                  <span className="block text-xs font-normal text-muted-foreground">{o.assetCount(total)}</span>
                </th>
                <td className="w-full py-2" aria-hidden>
                  <div className="flex h-5 w-full min-w-16 gap-0.5 overflow-hidden rounded">
                    {keys.map((k) =>
                      s[k] > 0 ? (
                        <span
                          key={k}
                          title={`${labels[k]}: ${s[k]}`}
                          className={cn("status-dot h-full first:rounded-l last:rounded-r", TONE_SOLID[k], k === "healthy" && "opacity-60")}
                          style={{ width: `${(s[k] / total) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                </td>
                {keys.map((k) => (
                  <td key={k} className="sr-only">
                    {s[k]}
                  </td>
                ))}
                <td className="py-2 pl-2 text-xs whitespace-nowrap text-text-secondary tabular sm:pl-3" aria-hidden>
                  <span className="font-semibold text-critical-fg">{s.critical}</span> /{" "}
                  <span className="font-semibold text-warning-fg">{s.warning}</span> /{" "}
                  <span className="font-semibold text-offline-fg">{s.offline}</span> /{" "}
                  <span className="font-semibold text-healthy-fg">{s.healthy}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">{o.countsNote}</p>
    </section>
  );
}

function DueWorkOrders({ orders, now }: { orders: OverviewData["dueWorkOrders"]; now: number }) {
  const { m, f } = useI18n();
  const o = m.overview;
  return (
    <section aria-labelledby="due-wo" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading
        id="due-wo"
        title={o.dueWos}
        description={o.dueWosDesc}
        actions={
          <Link href="/app/work-orders" className="text-xs font-medium text-link underline underline-offset-2 hover:decoration-2">
            {o.openBoard}
          </Link>
        }
      />
      {orders.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title={o.dueEmptyTitle} description={o.dueEmptyDesc} />
      ) : (
        <ul className="divide-y">
          {orders.slice(0, 6).map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <PriorityChip priority={w.priority} />
              <Link href={`/app/work-orders?wo=${w.id}`} className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline">
                <span className="text-muted-foreground">{w.id}</span> {w.title}
              </Link>
              <DueChip {...f.due(w.dueDate, now)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
