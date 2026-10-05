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
import { api, partName, userName, type WorkOrderRow } from "@/lib/api";
import type { Priority, WorkOrderStatus } from "@/lib/types";
import { dueLabel, formatDate, formatDateTime } from "@/lib/format";
import { useNow, useQuery } from "@/lib/use-query";
import { PageHeader } from "@/components/pdm/page-header";
import { DataFreshness } from "@/components/pdm/freshness";
import { DueChip, PriorityChip, WO_STATUS, WorkOrderStatusChip } from "@/components/pdm/status";
import { EmptyState, ErrorState } from "@/components/pdm/states";
import { CreateWorkOrderDialog, type WorkOrderDraft } from "@/components/pdm/create-work-order-dialog";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";

const COLUMNS: WorkOrderStatus[] = ["open", "in_progress", "done"];
const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function WorkOrdersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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
  const selected = data?.find((w) => w.id === openId) ?? null;
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
    return data.filter((w) => {
      if (needle && ![w.id, w.title, w.asset.name, w.asset.id].some((f) => f.toLowerCase().includes(needle))) return false;
      if (assignee === "me" && w.assigneeId !== api.currentUserId) return false;
      if (assignee === "none" && w.assigneeId) return false;
      if (!["all", "me", "none"].includes(assignee) && w.assigneeId !== assignee) return false;
      if (priority !== "all" && w.priority !== priority) return false;
      return true;
    });
  }, [data, search, assignee, priority]);

  async function move(wo: WorkOrderRow, status: WorkOrderStatus) {
    if (wo.status === status) return;
    await api.updateWorkOrder(wo.id, { status });
    toast.success(`${wo.id} moved to ${WO_STATUS[status].label}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Work orders"
        description="Plan and track maintenance work. Create work orders from alerts, assign technicians and check parts."
        meta={data && fetchedAt ? <DataFreshness at={new Date(fetchedAt).toISOString()} label="Refreshed" /> : null}
        actions={
          <Button onClick={() => setDraft({ priority: "P3", type: "corrective", dueInDays: 7, parts: [] })}>
            <Plus aria-hidden />
            New work order
          </Button>
        }
      />

      <section aria-label="Work order filters" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid min-w-56 flex-1 gap-1">
          <label htmlFor="wo-search" className="text-xs font-medium text-text-secondary">
            Search
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="wo-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID, title or asset" className="h-9 pl-8" />
          </div>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-assignee" className="text-xs font-medium text-text-secondary">
            Assignee
          </label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="wo-assignee" className="h-9 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="none">Unassigned</SelectItem>
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
            Priority
          </label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="wo-priority" className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="P1">P1 Urgent</SelectItem>
              <SelectItem value="P2">P2 High</SelectItem>
              <SelectItem value="P3">P3 Normal</SelectItem>
              <SelectItem value="P4">P4 Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p aria-live="polite" className="ml-auto self-center text-xs text-text-secondary">
          {data ? `${filtered.length} of ${data.length} work orders` : ""}
        </p>
      </section>

      {error ? (
        <ErrorState title="Couldn’t load work orders" error={error} onRetry={retry} />
      ) : loading || !data ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-3">
          <span className="sr-only">Loading work orders…</span>
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
          title="No work orders yet"
          description="Create a work order from an alert or an at-risk asset, or start one from scratch."
          action={
            <Button onClick={() => setDraft({ priority: "P3", type: "corrective", dueInDays: 7, parts: [] })}>
              <Plus aria-hidden />
              New work order
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => {
            const meta = WO_STATUS[status];
            const Icon = meta.icon;
            const items = filtered
              .filter((w) => w.status === status)
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
                  const wo = data.find((w) => w.id === dragId);
                  setDragId(null);
                  setDropTarget(null);
                  if (wo) move(wo, status);
                }}
                className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/60 p-3 transition-colors", dropTarget === status && "border-primary bg-selected")}
              >
                <h2 id={`col-${status}`} className="flex items-center gap-2 text-sm font-semibold">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  {meta.label}
                  <span className="rounded-full bg-card px-2 text-xs font-medium text-text-secondary tabular">{items.length}</span>
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card px-3 py-6 text-center text-xs text-text-secondary">
                    {status === "done" ? "Nothing completed yet." : "No work orders in this column."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((w) => (
                      <li key={w.id}>
                        <WorkOrderCard wo={w} now={now} onOpen={() => setOpen(w.id)} onMove={(s) => move(w, s)} onDragStart={() => setDragId(w.id)} onDragEnd={() => { setDragId(null); setDropTarget(null); }} dragging={dragId === w.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" {...sheetFocus.contentProps}>
          {selected ? <WorkOrderDetail wo={selected} now={now} /> : null}
        </SheetContent>
      </Sheet>

      {openId && data && !selected ? (
        <p role="status" className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm">
          <ClipboardX aria-hidden className="size-4 text-muted-foreground" />
          Work order {openId} isn’t in the current site filter.
        </p>
      ) : null}

      <CreateWorkOrderDialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)} draft={draft} />
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
  const parts = wo.parts.map((l) => ({ ...l, part: api.parts().find((p) => p.partNo === l.partNo) }));
  const short = parts.filter((l) => l.part && l.part.inStock < l.qty).length;
  const due = wo.status === "done" ? null : dueLabel(wo.dueDate, now);
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
        <span className="text-xs text-muted-foreground capitalize">· {wo.type}</span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Actions for ${wo.id}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <ArrowRightLeft aria-hidden className="size-3.5" />
              Move to
            </DropdownMenuLabel>
            {COLUMNS.filter((c) => c !== wo.status).map((c) => (
              <DropdownMenuItem key={c} onSelect={() => onMove(c)}>
                {WO_STATUS[c].label}
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
        <Link href={`/assets/${wo.asset.id}`} className="text-link underline underline-offset-2 hover:decoration-2">
          {wo.asset.name}
        </Link>{" "}
        · {wo.asset.siteName}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {due ? <DueChip {...due} /> : <span className="text-text-secondary">Completed {wo.completedAt ? formatDate(wo.completedAt) : ""}</span>}
        <span className="inline-flex items-center gap-1 text-text-secondary">
          <UserRound aria-hidden className="size-3.5" />
          <span className="sr-only">Assignee:</span>
          {userName(wo.assigneeId)}
        </span>
      </div>
      {(parts.length > 0 || wo.alertId) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-text-secondary">
          {parts.length > 0 ? (
            <span className={cn("inline-flex items-center gap-1", short > 0 && wo.status !== "done" && "font-medium text-warning-fg")}>
              {short > 0 && wo.status !== "done" ? <TriangleAlert aria-hidden className="size-3.5 text-warning" /> : <Package aria-hidden className="size-3.5" />}
              {parts.length} part{parts.length === 1 ? "" : "s"}
              {short > 0 && wo.status !== "done" ? ` · ${short} short` : ""}
            </span>
          ) : null}
          {wo.alertId ? (
            <Link href={`/alerts?id=${wo.alertId}`} className="inline-flex items-center gap-1 text-link underline underline-offset-2 hover:decoration-2">
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
  const users = api.users().filter((u) => u.active);
  const due = dueLabel(wo.dueDate, now);

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
          <Link href={`/assets/${wo.asset.id}`} className="font-medium text-link underline underline-offset-2 hover:decoration-2">
            {wo.asset.name}
          </Link>{" "}
          · {wo.asset.siteName} › {wo.asset.lineName}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="wo-status" className="text-xs font-medium text-text-secondary">
            Status
          </label>
          <Select value={wo.status} onValueChange={(v) => patch({ status: v as WorkOrderStatus }, `${wo.id} moved to ${WO_STATUS[v as WorkOrderStatus].label}`)}>
            <SelectTrigger id="wo-status" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c} value={c}>
                  {WO_STATUS[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-prio" className="text-xs font-medium text-text-secondary">
            Priority
          </label>
          <Select value={wo.priority} onValueChange={(v) => patch({ priority: v as Priority }, `${wo.id} priority set to ${v}`)}>
            <SelectTrigger id="wo-prio" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="P1">P1 – Urgent</SelectItem>
              <SelectItem value="P2">P2 – High</SelectItem>
              <SelectItem value="P3">P3 – Normal</SelectItem>
              <SelectItem value="P4">P4 – Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="wo-assign" className="text-xs font-medium text-text-secondary">
            Assignee
          </label>
          <Select value={wo.assigneeId ?? "none"} onValueChange={(v) => patch({ assigneeId: v === "none" ? undefined : v }, v === "none" ? `${wo.id} unassigned` : `${wo.id} assigned to ${userName(v)}`)}>
            <SelectTrigger id="wo-assign" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
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
            Due date
          </label>
          <Input
            id="wo-due"
            type="date"
            className="h-9"
            value={format(new Date(wo.dueDate), "yyyy-MM-dd")}
            onChange={(e) => e.target.value && patch({ dueDate: new Date(`${e.target.value}T17:00:00`).toISOString() }, `${wo.id} due date updated`)}
          />
          {wo.status !== "done" ? <span className="text-xs">{<DueChip {...due} />}</span> : null}
        </div>
      </div>

      {wo.description ? (
        <section aria-labelledby="wo-desc" className="grid gap-1">
          <h3 id="wo-desc" className="text-sm font-semibold">
            Instructions
          </h3>
          <p className="text-sm whitespace-pre-line text-text-secondary">{wo.description}</p>
        </section>
      ) : null}

      <section aria-labelledby="wo-parts" className="grid gap-2">
        <h3 id="wo-parts" className="text-sm font-semibold">
          Parts required
        </h3>
        {wo.parts.length === 0 ? (
          <p className="text-sm text-text-secondary">No parts required.</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Parts table" className="relative overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">Parts required for {wo.id}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Part</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                  <th scope="col" className="px-3 py-2 font-medium">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {wo.parts.map((l) => {
                  const part = api.parts().find((p) => p.partNo === l.partNo);
                  const ok = part ? part.inStock >= l.qty : false;
                  return (
                    <tr key={l.partNo}>
                      <td className="px-3 py-2">
                        {partName(l.partNo)}
                        <span className="block text-xs text-muted-foreground">{l.partNo}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{l.qty}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-healthy-fg" : "font-medium text-warning-fg")}>
                          {ok ? <CircleCheck aria-hidden className="size-3.5 text-healthy" /> : <TriangleAlert aria-hidden className="size-3.5 text-warning" />}
                          {ok ? `In stock (${part?.inStock})` : `Short · ${part?.inStock ?? 0} in stock, ${part?.leadTimeDays ?? "?"} d lead time`}
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
        <dt className="text-text-secondary">Type</dt>
        <dd className="capitalize">{wo.type}</dd>
        <dt className="text-text-secondary">Created</dt>
        <dd>{formatDateTime(wo.createdAt)}</dd>
        {wo.completedAt ? (
          <>
            <dt className="text-text-secondary">Completed</dt>
            <dd>{formatDateTime(wo.completedAt)}</dd>
          </>
        ) : null}
        <dt className="text-text-secondary">Source alert</dt>
        <dd>
          {wo.alertId ? (
            <Link href={`/alerts?id=${wo.alertId}`} className="text-link underline underline-offset-2 hover:decoration-2">
              {wo.alertId}
            </Link>
          ) : (
            "None (planned work)"
          )}
        </dd>
      </dl>
    </div>
  );
}
