"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BellOff, Check, CheckCheck, ClipboardList, Clock3, ExternalLink, Inbox, PauseCircle, Plus, RotateCcw, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/providers";
import { api, type AlertRow } from "@/lib/api";
import type { AlertStatus, Severity } from "@/lib/types";
import { useMediaQuery, useNow, useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/pdm/page-header";
import { DataFreshness, ModelMeta } from "@/components/pdm/freshness";
import { AlertStatusChip, ConfidenceBadge, SEVERITY, SeverityChip, TONE_SOLID } from "@/components/pdm/status";
import { EmptyState, ErrorState, LoadingBlock, SkeletonCard } from "@/components/pdm/states";
import { CreateWorkOrderDialog, draftFromAsset, type WorkOrderDraft } from "@/components/pdm/create-work-order-dialog";
import { EvidenceChart } from "@/components/charts/evidence-chart";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";

type StatusTab = AlertStatus | "all";
const TABS: StatusTab[] = ["open", "acknowledged", "snoozed", "resolved", "all"];
const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const SEV_RANK = { critical: 0, warning: 1, info: 2 } as const;
const SNOOZE_HOURS = [1, 4, 24, 72];

export function AlertsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { m, f } = useI18n();
  const al = m.alerts;
  const { siteId } = useSite();
  const now = useNow();
  const wide = useMediaQuery("(min-width: 1024px)");
  const { data, error, loading, retry, fetchedAt } = useQuery(`alerts:${siteId}`, () => api.listAlerts(siteId));

  const selectedId = params.get("id");
  const assetFilter = params.get("asset");
  const [tab, setTab] = useState<StatusTab>(() => (params.get("id") || params.get("asset") ? "all" : "open"));
  const [severities, setSeverities] = useState<Severity[]>([]);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sheetFocus = useDialogFocus();
  const tabLabel = (t: StatusTab) => (t === "all" ? al.all : m.status.alert[t]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { open: 0, acknowledged: 0, snoozed: 0, resolved: 0, all: 0 };
    data?.forEach((a) => {
      if (assetFilter && a.assetId !== assetFilter) return;
      c[a.status]++;
      c.all++;
    });
    return c;
  }, [data, assetFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data
      .filter((a) => (tab === "all" ? true : a.status === tab))
      .filter((a) => (severities.length ? severities.includes(a.severity) : true))
      .filter((a) => (assetFilter ? a.assetId === assetFilter : true))
      .filter((a) => (needle ? [a.title, a.asset.name, a.asset.id, a.id].some((field) => field.toLowerCase().includes(needle)) : true))
      .sort((a, b) => (tab === "resolved" || tab === "all" ? 0 : SEV_RANK[a.severity] - SEV_RANK[b.severity]) || b.triggeredAt.localeCompare(a.triggeredAt));
  }, [data, tab, severities, assetFilter, search]);

  const selected = data?.find((a) => a.id === selectedId) ?? null;
  const assetName = assetFilter ? (data?.find((a) => a.assetId === assetFilter)?.asset.name ?? assetFilter) : null;
  const createFrom = (a: AlertRow) => setDraft({ ...draftFromAsset(a.asset, a, m), returnFocusId: "alert-detail-title" });

  // Open the first alert on wide screens so the detail panel is never blank.
  useEffect(() => {
    if (wide && data && !selectedId && filtered[0]) setParam("id", filtered[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, data, selectedId, filtered]);

  function select(id: string) {
    setParam("id", id);
    if (!wide) setSheetOpen(true);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-alert]") ?? []);
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    e.preventDefault();
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    next?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={al.title} description={al.description} meta={data && fetchedAt ? <DataFreshness at={new Date(fetchedAt).toISOString()} label={m.freshness.refreshed} /> : null} />

      <section aria-label={al.filters} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div role="group" aria-label={al.statusGroup} className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Button key={t} variant="ghost" aria-pressed={tab === t} onClick={() => setTab(t)} className={cn("h-9 gap-1.5", tab === t && "bg-selected text-link hover:bg-selected")}>
              {tabLabel(t)}
              <span className={cn("rounded-full px-1.5 text-xs tabular", tab === t ? "bg-card" : "bg-muted")}>{data ? counts[t] : "–"}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <label htmlFor="alert-search" className="sr-only">
              {al.searchLabel}
            </label>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="alert-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={al.searchPlaceholder} className="h-9 pl-8" />
          </div>
          <div role="group" aria-label={al.severityGroup} className="flex flex-wrap items-center gap-2">
            {SEVERITIES.map((s) => {
              const Icon = SEVERITY[s].icon;
              const on = severities.includes(s);
              return (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  aria-pressed={on}
                  onClick={() => setSeverities((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                  className={cn("h-8 rounded-full", on && "border-primary bg-selected text-link hover:bg-selected")}
                >
                  <Icon aria-hidden className={cn(s === "critical" && "text-critical", s === "warning" && "text-warning", s === "info" && "text-info")} />
                  {m.status.severity[s]}
                </Button>
              );
            })}
          </div>
          {assetFilter ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted pr-1 pl-3 text-xs">
              {al.assetFilter} <span className="font-medium">{assetName}</span>
              <Button variant="ghost" size="icon-xs" aria-label={al.removeAssetFilter} onClick={() => setParam("asset", null)} className="rounded-full">
                <X aria-hidden />
              </Button>
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <ErrorState title={al.errorTitle} error={error} onRetry={retry} />
      ) : loading || !data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" aria-busy="true">
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <LoadingBlock label={al.loading} lines={1} className="w-40" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <SkeletonCard height="h-[32rem]" className="hidden lg:block" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Inbox} title={al.emptyTitle} description={al.emptyDesc} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <section aria-labelledby="alert-list-heading" className="flex min-w-0 flex-col rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h2 id="alert-list-heading" className="text-sm font-semibold">
                {al.listHeading(tabLabel(tab))}
              </h2>
              <p aria-live="polite" className="text-xs text-text-secondary">
                {al.shown(filtered.length)}
              </p>
            </div>
            {filtered.length === 0 ? (
              <EmptyState compact icon={BellOff} title={al.nothingTitle} description={al.nothingDesc} className="m-3" />
            ) : (
              <ul ref={listRef} onKeyDown={onListKeyDown} className="divide-y" aria-label={al.listLabel}>
                {filtered.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-alert
                      aria-current={a.id === selectedId ? "true" : undefined}
                      onClick={() => select(a.id)}
                      className={cn("relative flex w-full gap-3 px-3 py-3 text-left hover:bg-accent/60", a.id === selectedId && "bg-selected hover:bg-selected")}
                    >
                      <span aria-hidden className={cn("status-dot w-1 shrink-0 self-stretch rounded-full", TONE_SOLID[SEVERITY[a.severity].tone])} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <SeverityChip severity={a.severity} size="sm" />
                          <AlertStatusChip status={a.status} />
                          <span className="text-xs text-muted-foreground">{a.id}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            <time dateTime={a.triggeredAt}>{f.relative(a.triggeredAt, now)}</time>
                          </span>
                        </span>
                        <span className="font-medium">{a.title}</span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                          <span className="font-medium text-foreground">{a.asset.name}</span>
                          <span>{a.asset.siteName}</span>
                          <span className="inline-flex items-center gap-1">
                            <UserRound aria-hidden className="size-3.5" />
                            <span className="sr-only">{m.status.sr.assignee}</span>
                            {api.userName(a.assigneeId)}
                          </span>
                          {a.workOrderId ? (
                            <span className="inline-flex items-center gap-1">
                              <ClipboardList aria-hidden className="size-3.5" />
                              {a.workOrderId}
                            </span>
                          ) : null}
                          {a.status === "snoozed" && a.snoozedUntil ? (
                            <span className="inline-flex items-center gap-1">
                              <PauseCircle aria-hidden className="size-3.5" />
                              {al.until(f.dateTime(a.snoozedUntil))}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {wide ? (
            <aside aria-label={al.details} className="sticky top-[calc(var(--topbar-height)+1rem)] rounded-lg border bg-card">
              {selected ? (
                <AlertDetail alert={selected} now={now} onCreateWorkOrder={() => createFrom(selected)} />
              ) : (
                <EmptyState compact icon={Inbox} title={al.selectTitle} description={al.selectDesc} className="m-3 border-none" />
              )}
            </aside>
          ) : (
            <Sheet open={sheetOpen && !!selected} onOpenChange={setSheetOpen}>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" {...sheetFocus.contentProps}>
                <SheetHeader className="sr-only">
                  <SheetTitle>{al.details}</SheetTitle>
                  <SheetDescription>{al.sheetDesc}</SheetDescription>
                </SheetHeader>
                {selected ? <AlertDetail alert={selected} now={now} onCreateWorkOrder={() => createFrom(selected)} /> : null}
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)} draft={draft} />
    </div>
  );
}

function AlertDetail({ alert, now, onCreateWorkOrder }: { alert: AlertRow; now: number; onCreateWorkOrder: () => void }) {
  const { m, f } = useI18n();
  const al = m.alerts;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const users = api.users().filter((u) => u.active);
  const p = alert.asset.prediction;
  const closed = alert.status === "resolved";

  const refocus = useRef(false);
  // The button that was pressed may disappear once fresh data arrives; keep focus in the panel.
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      headingRef.current?.focus();
    }
  }, [alert.status, alert.assigneeId, alert.workOrderId, alert.events.length]);

  async function run(action: Promise<unknown>, message: string) {
    refocus.current = true;
    await action;
    toast.success(message);
  }

  return (
    <article className="flex flex-col gap-4 p-4" aria-labelledby="alert-detail-title">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={alert.severity} />
          <AlertStatusChip status={alert.status} size="md" />
          <span className="text-xs text-muted-foreground">{alert.id}</span>
        </div>
        <h2 id="alert-detail-title" ref={headingRef} tabIndex={-1} className="text-lg leading-snug font-semibold outline-none">
          {alert.title}
        </h2>
        <p className="text-sm">
          <Link href={`/app/assets/${alert.asset.id}`} className="inline-flex items-center gap-1 font-medium text-link underline underline-offset-2 hover:decoration-2">
            {alert.asset.name}
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>{" "}
          <span className="text-text-secondary">
            · {alert.asset.siteName} › {alert.asset.lineName}
          </span>
        </p>
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <Clock3 aria-hidden className="size-3.5" />
          {al.triggered} <time dateTime={alert.triggeredAt}>{f.weekdayDateTime(alert.triggeredAt)}</time> ({f.relative(alert.triggeredAt, now)})
        </p>
      </header>

      {/* Actions */}
      <div className="flex flex-col gap-3 rounded-md border bg-muted/50 p-3">
        <div className="flex flex-wrap gap-2">
          {alert.status === "open" || alert.status === "snoozed" ? (
            <Button onClick={() => run(api.acknowledgeAlert(alert.id), al.toastAcknowledged(alert.id))}>
              <Check aria-hidden />
              {al.acknowledge}
            </Button>
          ) : null}
          {alert.workOrderId ? (
            <Button variant="outline" asChild>
              <Link href={`/app/work-orders?wo=${alert.workOrderId}`}>
                <ClipboardList aria-hidden />
                {m.assetDetail.viewWo(alert.workOrderId)}
              </Link>
            </Button>
          ) : !closed ? (
            <Button variant={alert.status === "open" ? "outline" : "default"} onClick={onCreateWorkOrder}>
              <Plus aria-hidden />
              {m.assetDetail.createWo}
            </Button>
          ) : null}
          {!closed ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <PauseCircle aria-hidden />
                  {al.snooze}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel>{al.snoozeFor}</DropdownMenuLabel>
                {SNOOZE_HOURS.map((h) => (
                  <DropdownMenuItem key={h} onSelect={() => run(api.snoozeAlert(alert.id, h), al.toastSnoozed(alert.id, al.snoozeOptions[h]))}>
                    {al.snoozeOptions[h]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {!closed ? (
            <Button variant="ghost" onClick={() => run(api.resolveAlert(alert.id), al.toastResolved(alert.id))}>
              <CheckCheck aria-hidden />
              {al.resolve}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => run(api.reopenAlert(alert.id), al.toastReopened(alert.id))}>
              <RotateCcw aria-hidden />
              {al.reopen}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="assignee" className="text-xs font-medium text-text-secondary">
            {al.assignee}
          </label>
          <Select
            value={alert.assigneeId ?? "none"}
            onValueChange={(v) => run(api.assignAlert(alert.id, v === "none" ? null : v), v === "none" ? al.toastUnassigned(alert.id) : al.toastAssigned(api.userName(v)))}
          >
            <SelectTrigger id="assignee" className="h-9 min-w-56 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{m.common.unassigned}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {m.roles[u.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Why */}
      <section aria-labelledby="why" className="flex flex-col gap-2">
        <h3 id="why" className="text-sm font-semibold">
          {al.why}
        </h3>
        <p className="text-sm">{alert.description}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{al.rule}</dt>
          <dd>{alert.rule}</dd>
          <dt className="text-muted-foreground">{al.source}</dt>
          <dd>{m.status.alertSource[alert.source]}</dd>
          {alert.value !== undefined ? (
            <>
              <dt className="text-muted-foreground">{al.reading}</dt>
              <dd className="tabular">{al.readingValue(alert.value, alert.threshold)}</dd>
            </>
          ) : null}
        </dl>
        {alert.confidence !== undefined && p ? (
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge value={alert.confidence} />
            <ModelMeta version={p.modelVersion} scoredAt={p.scoredAt} />
          </div>
        ) : null}
      </section>

      <Evidence alert={alert} />

      {p && alert.source !== "connectivity" && (alert.asset.status === "critical" || alert.asset.status === "warning") ? (
        <section aria-labelledby="prediction" className="flex flex-col gap-1.5 rounded-md border p-3">
          <h3 id="prediction" className="text-sm font-semibold">
            {al.prediction}
          </h3>
          <p className="text-sm">
            <span className="font-medium">{p.failureModes[0].mode}</span> · RUL <span className="font-semibold">{f.days(p.rulDays)}</span>{" "}
            <span className="text-text-secondary">({m.overview.intervalShort(f.rulRange(p.rulLow, p.rulHigh), Math.round(p.intervalLevel * 100))})</span>
          </p>
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-foreground">{al.recommended}</span>
            {p.recommendedAction}
          </p>
          <ConfidenceBadge value={p.confidence} className="self-start" />
        </section>
      ) : null}

      <section aria-labelledby="timeline" className="flex flex-col gap-2">
        <h3 id="timeline" className="text-sm font-semibold">
          {al.timeline}
        </h3>
        <ol className="relative ml-1.5 border-l pl-4">
          {[...alert.events].reverse().map((e, i) => (
            <li key={i} className="relative pb-3 last:pb-0">
              <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-muted-foreground" />
              <p className="text-sm">{e.text}</p>
              <time dateTime={e.at} className="text-xs text-muted-foreground">
                {f.dateTime(e.at)} · {f.relative(e.at, now)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function Evidence({ alert }: { alert: AlertRow }) {
  const { m } = useI18n();
  const al = m.alerts;
  const { data, error, loading, retry } = useQuery(`evidence:${alert.id}`, () => api.getAlertEvidence(alert));
  if (!alert.sensor) return null;
  const unit = alert.unit ?? "";
  const label = m.sensors[alert.sensor];
  return (
    <section aria-labelledby="evidence" className="flex flex-col gap-2">
      <h3 id="evidence" className="text-sm font-semibold">
        {al.evidence}
      </h3>
      {error ? (
        <ErrorState compact title={al.evidenceError} error={error} onRetry={retry} />
      ) : loading || !data ? (
        <LoadingBlock label={al.evidenceLoading} lines={3} />
      ) : data.length === 0 ? (
        <p className="text-sm text-text-secondary">{al.evidenceEmpty}</p>
      ) : (
        <figure className="flex flex-col gap-1">
          <EvidenceChart
            points={data}
            threshold={alert.threshold}
            triggeredAt={new Date(alert.triggeredAt).getTime()}
            unit={unit}
            label={label}
            summary={m.evidence.summary(alert.value, alert.threshold)}
          />
          <figcaption className="text-xs text-text-secondary">{m.evidence.caption(alert.value, unit, alert.threshold)}</figcaption>
        </figure>
      )}
    </section>
  );
}
