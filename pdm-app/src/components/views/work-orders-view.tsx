"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRightLeft, Bell, CircleCheck, ClipboardList, ClipboardX, MoreHorizontal, Package, Plus, Search, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/providers";
import { api, type WorkOrderRow } from "@/lib/api";
import type { Priority, WorkOrderStatus } from "@/lib/types";
import { useNow, useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/pdm/page-header";
import { DataFreshness } from "@/components/pdm/freshness";
import { DueChip, PriorityChip, WO_STATUS, WorkOrderStatusChip } from "@/components/pdm/status";
import { EmptyState, ErrorState } from "@/components/pdm/states";
import { CreateWorkOrderDialog, type WorkOrderDraft } from "@/components/pdm/create-work-order-dialog";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";

const COLUMNS: WorkOrderStatus[] = ["open", "in_progress", "done"];
const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
const NEW_DRAFT: WorkOrderDraft = { priority: "P3", type: "corrective", dueInDays: 7, parts: [] };

export function WorkOrdersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { m } = useI18n();
  const w = m.workOrders;
  const { siteId } = useSite();
  const now = useNow();
  const { data, error, loading, retry, fetchedAt } = useQuery(`wos:${siteId}`, () => api.listWorkOrders(siteId));
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkOrderStatus | null>(null);
  const openId = params.get("wo");
  const sheetFocus = useDialogFocus();
  const selected = data?.find((wo) => wo.id === openId) ?? null;
  const users = api.users();

  function setOpen(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("wo", id);
    else next.delete("wo");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.filter((wo) => {
      if (needle && ![wo.id, wo.title, wo.asset.name, wo.asset.id].some((field) => field.toLowerCase().includes(needle))) return false;
      if (assignee === "me" && wo.assigneeId !== api.currentUserId) return false;
      if (assignee === "none" && wo.assigneeId) return false;
      if (!["all", "me", "none"].includes(assignee) && wo.assigneeId !== assignee) return false;
      if (priority !== "all" && wo.priority !== priority) return false;
      return true;
    });
  }, [data, search, assignee, priority]);

  async function move(wo: WorkOrderRow, status: WorkOrderStatus) {
    if (wo.status === status) return;
    await api.updateWorkOrder(wo.id, { status });
    toast.success(w.moved(wo.id, m.status.workOrder[status]));
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={w.title}
        description={w.description}
        meta={data && fetchedAt ? <DataFreshness at={new Date(fetchedAt).toISOString()} label={m.freshness.refreshed} /> : null}
        actions={
          <Button onClick={() => setDraft(NEW_DRAFT)}>
            <Plus aria-hidden />
            {w.new}
          </Button>
        }
      />

      <section aria-label={w.filters} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid min-w-56 flex-1 gap-1">
          <label htmlFor="wo-search" className="text-xs font-medium text-text-secondary">
            {m.common.search}
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="wo-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={w.searchPlaceholder} className="h-9 pl-8" />
          </div>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-assignee" className="text-xs font-medium text-text-secondary">
            {w.assignee}
          </label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="wo-assignee" className="h-9 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{w.everyone}</SelectItem>
              <SelectItem value="me">{w.me}</SelectItem>
              <SelectItem value="none">{m.common.unassigned}</SelectItem>
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-priority" className="text-xs font-medium text-text-secondary">
            {w.priority}
          </label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="wo-priority" className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{w.allPriorities}</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {m.status.priority[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p aria-live="polite" className="ml-auto self-center text-xs text-text-secondary">
          {data ? w.count(filtered.length, data.length) : ""}
        </p>
      </section>

      {error ? (
        <ErrorState title={w.errorTitle} error={error} onRetry={retry} />
      ) : loading || !data ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-3">
          <span className="sr-only">{w.loading}</span>
          {COLUMNS.map((c) => (
            <div key={c} className="flex flex-col gap-3 rounded-lg border bg-muted/60 p-3">
              <Skeleton className="h-6 w-32" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={w.emptyTitle}
          description={w.emptyDesc}
          action={
            <Button onClick={() => setDraft(NEW_DRAFT)}>
              <Plus aria-hidden />
              {w.new}
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => {
            const Icon = WO_STATUS[status].icon;
            const items = filtered
              .filter((wo) => wo.status === status)
              .sort((a, b) => (status === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueDate.localeCompare(b.dueDate)));
            return (
              <section
                key={status}
                aria-labelledby={`col-${status}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setDropTarget(status);
                }}
                onDragLeave={() => setDropTarget((t) => (t === status ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  const wo = data.find((x) => x.id === dragId);
                  setDragId(null);
                  setDropTarget(null);
                  if (wo) move(wo, status);
                }}
                className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/60 p-3 transition-colors", dropTarget === status && "border-primary bg-selected")}
              >
                <h2 id={`col-${status}`} className="flex items-center gap-2 text-sm font-semibold">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  {m.status.workOrder[status]}
                  <span className="rounded-full bg-card px-2 text-xs font-medium text-text-secondary tabular">{items.length}</span>
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card px-3 py-6 text-center text-xs text-text-secondary">{status === "done" ? w.columnEmptyDone : w.columnEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((wo) => (
                      <li key={wo.id}>
                        <WorkOrderCard
                          wo={wo}
                          now={now}
                          onOpen={() => setOpen(wo.id)}
                          onMove={(s) => move(wo, s)}
                          onDragStart={() => setDragId(wo.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropTarget(null);
                          }}
                          dragging={dragId === wo.id}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" {...sheetFocus.contentProps}>
          {selected ? <WorkOrderDetail wo={selected} now={now} /> : null}
        </SheetContent>
      </Sheet>

      {openId && data && !selected ? (
        <p role="status" className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm">
          <ClipboardX aria-hidden className="size-4 text-muted-foreground" />
          {w.notInSite(openId)}
        </p>
      ) : null}

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)} draft={draft} />
    </div>
  );
}

function WorkOrderCard({
  wo,
  now,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  wo: WorkOrderRow;
  now: number;
  onOpen: () => void;
  onMove: (s: WorkOrderStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { m, f } = useI18n();
  const w = m.workOrders;
  const catalog = api.parts();
  const parts = wo.parts.map((l) => ({ ...l, part: catalog.find((p) => p.partNo === l.partNo) }));
  const short = parts.filter((l) => l.part && l.part.inStock < l.qty).length;
  const due = wo.status === "done" ? null : f.due(wo.dueDate, now);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      aria-labelledby={`wo-${wo.id}-title`}
      className={cn("flex flex-col gap-2 rounded-md border bg-card p-3 shadow-xs", dragging && "opacity-50", wo.priority === "P1" && wo.status !== "done" && "border-l-4 border-l-critical")}
    >
      <div className="flex items-center gap-2">
        <PriorityChip priority={wo.priority} />
        <span className="text-xs text-muted-foreground">{wo.id}</span>
        <span className="text-xs text-muted-foreground">· {m.status.maintenanceType[wo.type]}</span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={w.actions(wo.id)}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <ArrowRightLeft aria-hidden className="size-3.5" />
              {w.moveTo}
            </DropdownMenuLabel>
            {COLUMNS.filter((c) => c !== wo.status).map((c) => (
              <DropdownMenuItem key={c} onSelect={() => onMove(c)}>
                {m.status.workOrder[c]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h3 id={`wo-${wo.id}-title`} className="text-sm leading-snug font-medium">
        <button type="button" onClick={onOpen} className="text-left underline-offset-2 hover:underline">
          {wo.title}
        </button>
      </h3>
      <p className="text-xs text-text-secondary">
        <Link href={`/app/assets/${wo.asset.id}`} className="text-link underline underline-offset-2 hover:decoration-2">
          {wo.asset.name}
        </Link>{" "}
        · {wo.asset.siteName}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {due ? <DueChip {...due} /> : <span className="text-text-secondary">{w.completedOn(wo.completedAt ? f.date(wo.completedAt) : "")}</span>}
        <span className="inline-flex items-center gap-1 text-text-secondary">
          <UserRound aria-hidden className="size-3.5" />
          <span className="sr-only">{m.status.sr.assignee}</span>
          {api.userName(wo.assigneeId)}
        </span>
      </div>
      {(parts.length > 0 || wo.alertId) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-text-secondary">
          {parts.length > 0 ? (
            <span className={cn("inline-flex items-center gap-1", short > 0 && wo.status !== "done" && "font-medium text-warning-fg")}>
              {short > 0 && wo.status !== "done" ? <TriangleAlert aria-hidden className="size-3.5 text-warning" /> : <Package aria-hidden className="size-3.5" />}
              {w.partsCount(parts.length)}
              {short > 0 && wo.status !== "done" ? w.shortCount(short) : ""}
            </span>
          ) : null}
          {wo.alertId ? (
            <Link href={`/app/alerts?id=${wo.alertId}`} className="inline-flex items-center gap-1 text-link underline underline-offset-2 hover:decoration-2">
              <Bell aria-hidden className="size-3.5" />
              {wo.alertId}
            </Link>
          ) : null}
        </div>
      )}
    </article>
  );
}

function WorkOrderDetail({ wo, now }: { wo: WorkOrderRow; now: number }) {
  const { m, f } = useI18n();
  const w = m.workOrders;
  const users = api.users().filter((u) => u.active);
  const catalog = api.parts();
  const due = f.due(wo.dueDate, now);

  async function patch(p: Parameters<typeof api.updateWorkOrder>[1], message: string) {
    await api.updateWorkOrder(wo.id, p);
    toast.success(message);
  }

  return (
    <div className="flex flex-col gap-5 p-4 pt-10">
      <SheetHeader className="p-0">
        <div className="flex flex-wrap items-center gap-2">
          <WorkOrderStatusChip status={wo.status} size="md" />
          <PriorityChip priority={wo.priority} size="md" />
          <span className="text-xs text-muted-foreground">{wo.id}</span>
        </div>
        <SheetTitle className="text-lg leading-snug">{wo.title}</SheetTitle>
        <SheetDescription>
          <Link href={`/app/assets/${wo.asset.id}`} className="font-medium text-link underline underline-offset-2 hover:decoration-2">
            {wo.asset.name}
          </Link>{" "}
          · {wo.asset.siteName} › {wo.asset.lineName}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="wo-status" className="text-xs font-medium text-text-secondary">
            {w.status}
          </label>
          <Select value={wo.status} onValueChange={(v) => patch({ status: v as WorkOrderStatus }, w.moved(wo.id, m.status.workOrder[v as WorkOrderStatus]))}>
            <SelectTrigger id="wo-status" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c} value={c}>
                  {m.status.workOrder[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-prio" className="text-xs font-medium text-text-secondary">
            {w.priority}
          </label>
          <Select value={wo.priority} onValueChange={(v) => patch({ priority: v as Priority }, w.toastPriority(wo.id, m.status.priority[v as Priority]))}>
            <SelectTrigger id="wo-prio" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {m.status.priority[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-assign" className="text-xs font-medium text-text-secondary">
            {w.assignee}
          </label>
          <Select
            value={wo.assigneeId ?? "none"}
            onValueChange={(v) => patch({ assigneeId: v === "none" ? undefined : v }, v === "none" ? w.toastUnassigned(wo.id) : w.toastAssigned(wo.id, api.userName(v)))}
          >
            <SelectTrigger id="wo-assign" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{m.common.unassigned}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-due" className="text-xs font-medium text-text-secondary">
            {w.dueDate}
          </label>
          <Input
            id="wo-due"
            type="date"
            className="h-9"
            value={format(new Date(wo.dueDate), "yyyy-MM-dd")}
            onChange={(e) => e.target.value && patch({ dueDate: new Date(`${e.target.value}T17:00:00`).toISOString() }, w.toastDue(wo.id))}
          />
          {wo.status !== "done" ? (
            <span className="text-xs">
              <DueChip {...due} />
            </span>
          ) : null}
        </div>
      </div>

      {wo.description ? (
        <section aria-labelledby="wo-desc" className="grid gap-1">
          <h3 id="wo-desc" className="text-sm font-semibold">
            {w.instructions}
          </h3>
          <p className="text-sm whitespace-pre-line text-text-secondary">{wo.description}</p>
        </section>
      ) : null}

      <section aria-labelledby="wo-parts" className="grid gap-2">
        <h3 id="wo-parts" className="text-sm font-semibold">
          {w.parts}
        </h3>
        {wo.parts.length === 0 ? (
          <p className="text-sm text-text-secondary">{w.noParts}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={w.partsRegion} className="relative overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{w.partsCaption(wo.id)}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {w.colPart}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {w.colQty}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {w.colAvailability}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {wo.parts.map((l) => {
                  const part = catalog.find((p) => p.partNo === l.partNo);
                  const ok = part ? part.inStock >= l.qty : false;
                  return (
                    <tr key={l.partNo}>
                      <td className="px-3 py-2">
                        {api.partName(l.partNo)}
                        <span className="block text-xs text-muted-foreground">{l.partNo}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{l.qty}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-healthy-fg" : "font-medium text-warning-fg")}>
                          {ok ? <CircleCheck aria-hidden className="size-3.5 text-healthy" /> : <TriangleAlert aria-hidden className="size-3.5 text-warning" />}
                          {ok ? w.inStock(part?.inStock ?? 0) : w.shortStock(part?.inStock ?? 0, part?.leadTimeDays ?? "?")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-text-secondary">{w.type}</dt>
        <dd>{m.status.maintenanceType[wo.type]}</dd>
        <dt className="text-text-secondary">{w.created}</dt>
        <dd>{f.dateTime(wo.createdAt)}</dd>
        {wo.completedAt ? (
          <>
            <dt className="text-text-secondary">{w.completed}</dt>
            <dd>{f.dateTime(wo.completedAt)}</dd>
          </>
        ) : null}
        <dt className="text-text-secondary">{w.sourceAlert}</dt>
        <dd>
          {wo.alertId ? (
            <Link href={`/app/alerts?id=${wo.alertId}`} className="text-link underline underline-offset-2 hover:decoration-2">
              {wo.alertId}
            </Link>
          ) : (
            w.plannedWork
          )}
        </dd>
      </dl>
    </div>
  );
}
