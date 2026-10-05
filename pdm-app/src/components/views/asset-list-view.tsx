"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Factory, FilterX, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/providers";
import { api, byUrgency, type AssetRow } from "@/lib/api";
import type { AssetStatus, AssetType } from "@/lib/types";
import { useNow, useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/pdm/page-header";
import { DataFreshness } from "@/components/pdm/freshness";
import { ASSET_STATUS, StatusChip } from "@/components/pdm/status";
import { HealthMeter } from "@/components/pdm/health-meter";
import { EmptyState, ErrorState } from "@/components/pdm/states";
import { cn } from "@/lib/utils";

type SortKey = "urgency" | "name" | "site" | "line" | "type" | "health" | "rul" | "inspection";

const STATUSES: AssetStatus[] = ["critical", "warning", "healthy", "offline"];
const TYPES: AssetType[] = ["Air Compressor", "CNC Spindle", "Centrifugal Pump", "Conveyor", "Electric Motor", "Fan / Blower", "Gearbox", "Hydraulic Press"];

export function AssetListView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { m, f, locale } = useI18n();
  const a11n = m.assets;
  const { siteId } = useSite();
  const now = useNow();
  const { data, error, loading, retry } = useQuery(`assets:${siteId}`, () => api.listAssets(siteId));

  // Filters live in the URL so views are shareable and the back button works.
  const q = params.get("q") ?? "";
  const statusParam = params.get("status");
  const statusFilter = useMemo(
    () => (statusParam?.split(",").filter((s) => STATUSES.includes(s as AssetStatus)) ?? []) as AssetStatus[],
    [statusParam],
  );
  const typeFilter = params.get("type") ?? "all";
  const lineFilter = params.get("line") ?? "all";
  const sort = (params.get("sort") as SortKey) ?? "urgency";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const [search, setSearch] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setSearch(q);
  }

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const sites = api.sites().filter((s) => !siteId || s.id === siteId);

  const filtered = useMemo(() => {
    if (!data) return [];
    const typeLabel = (t: AssetType) => m.assetTypes[t];
    const collator = new Intl.Collator(locale);
    const sorters: Record<SortKey, (a: AssetRow, b: AssetRow) => number> = {
      urgency: byUrgency,
      name: (a, b) => collator.compare(a.name, b.name),
      site: (a, b) => collator.compare(a.siteName, b.siteName) || collator.compare(a.lineName, b.lineName),
      line: (a, b) => collator.compare(a.lineName, b.lineName),
      type: (a, b) => collator.compare(typeLabel(a.type), typeLabel(b.type)),
      health: (a, b) => a.healthScore - b.healthScore,
      rul: (a, b) => (a.status === "offline" ? 1e6 : (a.prediction?.rulDays ?? 1e5)) - (b.status === "offline" ? 1e6 : (b.prediction?.rulDays ?? 1e5)),
      inspection: (a, b) => a.lastInspectionAt.localeCompare(b.lastInspectionAt),
    };
    const needle = q.trim().toLowerCase();
    const rows = data.assets.filter((a) => {
      if (needle && ![a.name, a.id, a.type, typeLabel(a.type), a.manufacturer, a.model].some((field) => field.toLowerCase().includes(needle))) return false;
      if (statusFilter.length && !statusFilter.includes(a.status)) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (lineFilter !== "all" && a.lineId !== lineFilter) return false;
      return true;
    });
    const sorter = sorters[sort] ?? byUrgency;
    rows.sort((a, b) => (dir === "asc" ? sorter(a, b) : -sorter(a, b)) || a.id.localeCompare(b.id));
    return rows;
  }, [data, q, statusFilter, typeFilter, lineFilter, sort, dir, m, locale]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, healthy: 0, offline: 0 } as Record<AssetStatus, number>;
    data?.assets.forEach((a) => c[a.status]++);
    return c;
  }, [data]);

  const hasFilters = !!q || statusFilter.length > 0 || typeFilter !== "all" || lineFilter !== "all";

  function toggleStatus(s: AssetStatus) {
    const next = statusFilter.includes(s) ? statusFilter.filter((x) => x !== s) : [...statusFilter, s];
    update({ status: next.join(",") || null });
  }

  function setSort(key: SortKey) {
    if (sort === key) update({ dir: dir === "asc" ? "desc" : "asc" });
    else update({ sort: key, dir: "asc" });
  }

  const clearAll = () => update({ q: null, status: null, type: null, line: null });

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={a11n.title} description={a11n.description} meta={data ? <DataFreshness at={data.dataUpdatedAt} /> : null} />

      <section aria-label={a11n.filters} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-56 flex-1 gap-1">
            <label htmlFor="asset-search" className="text-xs font-medium text-text-secondary">
              {m.common.search}
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="asset-search"
                type="search"
                value={search}
                placeholder={a11n.searchPlaceholder}
                className="h-9 pl-8"
                onChange={(e) => {
                  setSearch(e.target.value);
                  update({ q: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <label htmlFor="line-filter" className="text-xs font-medium text-text-secondary">
              {a11n.line}
            </label>
            <Select value={lineFilter} onValueChange={(v) => update({ line: v })}>
              <SelectTrigger id="line-filter" className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{a11n.allLines}</SelectItem>
                {sites.map((s) => (
                  <SelectGroup key={s.id}>
                    <SelectLabel>{s.name}</SelectLabel>
                    {s.lines.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        <span className="sr-only">, {s.name}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="type-filter" className="text-xs font-medium text-text-secondary">
              {a11n.type}
            </label>
            <Select value={typeFilter} onValueChange={(v) => update({ type: v })}>
              <SelectTrigger id="type-filter" className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{m.common.allTypes}</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {m.assetTypes[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters ? (
            <Button variant="ghost" className="h-9" onClick={clearAll}>
              <FilterX aria-hidden />
              {m.common.clearFilters}
            </Button>
          ) : null}
        </div>
        <div role="group" aria-label={a11n.statusGroup} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-secondary" aria-hidden>
            {a11n.status}
          </span>
          {STATUSES.map((s) => {
            const meta = ASSET_STATUS[s];
            const Icon = meta.icon;
            const pressed = statusFilter.includes(s);
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                aria-pressed={pressed}
                onClick={() => toggleStatus(s)}
                className={cn("h-8 rounded-full", pressed && "border-primary bg-selected text-link hover:bg-selected")}
              >
                <Icon aria-hidden className={cn(meta.tone === "critical" && "text-critical", meta.tone === "warning" && "text-warning", meta.tone === "healthy" && "text-healthy", meta.tone === "offline" && "text-offline")} />
                {m.status.asset[s]}
                <span className="text-muted-foreground tabular">{data ? counts[s] : "–"}</span>
              </Button>
            );
          })}
        </div>
      </section>

      {error ? (
        <ErrorState title={a11n.errorTitle} error={error} onRetry={retry} />
      ) : loading || !data ? (
        <TableSkeleton label={a11n.loading} />
      ) : data.assets.length === 0 ? (
        <EmptyState icon={Factory} title={a11n.emptyTitle} description={a11n.emptyDesc} action={<Button onClick={() => toast.info(a11n.connectToast)}>{a11n.connect}</Button>} />
      ) : (
        <section aria-labelledby="asset-table-caption" className="flex min-w-0 flex-col gap-2">
          <p aria-live="polite" className="text-xs text-text-secondary">
            {a11n.showing(filtered.length, data.assets.length)}
          </p>
          {filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={a11n.noMatchTitle}
              description={a11n.noMatchDesc}
              action={
                <Button variant="outline" onClick={clearAll}>
                  {m.common.clearFilters}
                </Button>
              }
            />
          ) : (
            <div tabIndex={0} role="region" aria-label={a11n.tableRegion} className="relative overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[1100px] text-sm">
                <caption id="asset-table-caption" className="sr-only">
                  {a11n.caption(a11n.sortBy[sort], dir === "asc")}
                </caption>
                <thead className="border-b bg-muted text-left text-xs text-text-secondary">
                  <tr>
                    <SortHeader label={a11n.cols.asset} k="name" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.site} k="site" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.line} k="line" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.type} k="type" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.health} k="health" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.rul} k="rul" sort={sort} dir={dir} onSort={setSort} hint={a11n.rulHint} />
                    <SortHeader label={a11n.cols.status} k="urgency" sort={sort} dir={dir} onSort={setSort} />
                    <SortHeader label={a11n.cols.inspection} k="inspection" sort={sort} dir={dir} onSort={setSort} />
                    <th scope="col" className="px-3 py-2 font-medium">
                      {a11n.cols.openAlerts}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-accent/60">
                      <th scope="row" className="px-3 py-2.5 text-left font-normal">
                        <Link href={`/app/assets/${a.id}`} className="font-medium whitespace-nowrap underline-offset-2 hover:underline">
                          {a.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{a.id}</span>
                      </th>
                      <td className="px-3 py-2.5 whitespace-nowrap">{a.siteName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{a.lineName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{m.assetTypes[a.type]}</td>
                      <td className="px-3 py-2.5">
                        <HealthMeter score={a.healthScore} status={a.status} delta={a.healthDelta7d} showDelta />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {a.status === "offline" || !a.prediction ? (
                          <span className="text-text-secondary">{a11n.paused}</span>
                        ) : (
                          <>
                            <span className="font-semibold tabular">{f.days(a.prediction.rulDays)}</span>
                            <span className="block text-xs text-muted-foreground tabular">
                              {f.rulRange(a.prediction.rulLow, a.prediction.rulHigh)} · {m.status.confidenceShort(Math.round(a.prediction.confidence * 100))}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusChip status={a.status} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <time dateTime={a.lastInspectionAt}>{f.date(a.lastInspectionAt)}</time>
                        <span className="block text-xs text-muted-foreground">{f.relative(a.lastInspectionAt, now)}</span>
                      </td>
                      <td className="px-3 py-2.5 tabular">
                        {a.openAlerts > 0 ? (
                          <Link href={`/app/alerts?asset=${a.id}`} className="font-medium text-link underline underline-offset-2 hover:decoration-2">
                            {a.openAlerts}
                            <span className="sr-only">{a11n.openAlertsSr(a.name)}</span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SortHeader({ label, k, sort, dir, onSort, hint }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; hint?: string }) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-1.5 py-1.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        title={hint}
        className={cn("inline-flex h-8 items-center gap-1 rounded-md px-1.5 whitespace-nowrap hover:bg-accent hover:text-foreground", active && "text-foreground")}
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5", !active && "opacity-60")} />
      </button>
    </th>
  );
}

function TableSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
