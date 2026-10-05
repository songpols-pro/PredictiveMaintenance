"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { CircleCheck, Link2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type AssetRow } from "@/lib/api";
import type { Alert, MaintenanceType, PartLine, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "./use-dialog-focus";

export interface WorkOrderDraft {
  assetId?: string;
  alertId?: string;
  alertTitle?: string;
  title?: string;
  description?: string;
  priority?: Priority;
  type?: MaintenanceType;
  assigneeId?: string;
  dueInDays?: number;
  parts?: PartLine[];
  /** element to focus after a work order is created (the opener may be replaced by a link) */
  returnFocusId?: string;
}

/** Pre-fills a work order from an asset's prediction and (optionally) the alert that triggered it. */
export function draftFromAsset(asset: AssetRow, alert?: Alert): WorkOrderDraft {
  const p = asset.prediction;
  const degrading = asset.status === "critical" || asset.status === "warning";
  if (asset.status === "offline" || alert?.source === "connectivity") {
    return {
      assetId: asset.id,
      alertId: alert?.id,
      alertTitle: alert?.title,
      title: `Restore sensor connectivity – ${asset.name}`,
      description: alert?.description ?? "Asset is not sending data. Check sensor power, wiring and the edge gateway.",
      priority: "P3",
      type: "corrective",
      assigneeId: alert?.assigneeId,
      dueInDays: 1,
      parts: [],
    };
  }
  return {
    assetId: asset.id,
    alertId: alert?.id,
    alertTitle: alert?.title,
    title: degrading && p ? `${p.failureModes[0].mode} – ${asset.name}` : `Inspection – ${asset.name}`,
    description:
      degrading && p
        ? `${p.recommendedAction}\n\nModel: ${p.failureModes[0].mode} (${Math.round(p.failureModes[0].probability * 100)}% likely). RUL ${p.rulDays} d (${p.rulLow}–${p.rulHigh} d), ${Math.round(p.confidence * 100)}% confidence.`
        : (alert?.description ?? ""),
    priority: alert?.severity === "critical" || asset.status === "critical" ? "P1" : degrading ? "P2" : "P3",
    type: degrading ? "predictive" : "inspection",
    assigneeId: alert?.assigneeId,
    dueInDays: p && degrading ? Math.max(1, Math.floor(p.rulLow / 2)) : 7,
    parts: degrading && p ? p.recommendedParts.map((partNo) => ({ partNo, qty: 1 })) : [],
  };
}

interface Errors {
  title?: string;
  assetId?: string;
  dueDate?: string;
  parts?: string;
}

export function CreateWorkOrderDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: WorkOrderDraft | null;
}) {
  const focus = useDialogFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" {...focus.contentProps}>
        {open && draft ? (
          <WorkOrderForm
            key={`${draft.assetId}-${draft.alertId}`}
            draft={draft}
            onDone={(didCreate) => {
              // The opener is often replaced by a "View WO" link after creating, so aim at a stable element.
              focus.returnFocusTo(didCreate ? (draft.returnFocusId ?? null) : null);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderForm({ draft, onDone }: { draft: WorkOrderDraft; onDone: (created: boolean) => void }) {
  const router = useRouter();
  const uid = useId();
  const [today] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [title, setTitle] = useState(draft.title ?? "");
  const [assetId, setAssetId] = useState(draft.assetId ?? "");
  const [priority, setPriority] = useState<Priority>(draft.priority ?? "P3");
  const [type, setType] = useState<MaintenanceType>(draft.type ?? "corrective");
  const [assigneeId, setAssigneeId] = useState(draft.assigneeId ?? "none");
  const [dueDate, setDueDate] = useState(() => format(addDays(new Date(), draft.dueInDays ?? 7), "yyyy-MM-dd"));
  const [description, setDescription] = useState(draft.description ?? "");
  const [parts, setParts] = useState<PartLine[]>(draft.parts ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const assets = api.assetOptions();
  const users = api.users().filter((u) => u.active);
  const catalog = api.parts();
  const ids = { title: `${uid}-title`, asset: `${uid}-asset`, due: `${uid}-due`, desc: `${uid}-desc`, priority: `${uid}-priority`, type: `${uid}-type`, assignee: `${uid}-assignee` };

  function validate(): Errors {
    const e: Errors = {};
    if (!title.trim()) e.title = "Enter a title, for example “Replace drive-end bearing”.";
    if (!assetId) e.assetId = "Choose the asset this work applies to.";
    if (!dueDate) e.dueDate = "Choose a due date.";
    else if (dueDate < today) e.dueDate = "Due date can’t be in the past.";
    if (parts.some((p) => !p.partNo || p.qty < 1)) e.parts = "Each part needs a part number and a quantity of at least 1.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      // Move focus to the first invalid field.
      setTimeout(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 0);
      return;
    }
    setSaving(true);
    const wo = await api.createWorkOrder({
      title: title.trim(),
      description: description.trim(),
      assetId,
      alertId: draft.alertId,
      priority,
      type,
      assigneeId: assigneeId === "none" ? undefined : assigneeId,
      dueDate: new Date(`${dueDate}T17:00:00`).toISOString(),
      parts,
    });
    setSaving(false);
    toast.success(`Work order ${wo.id} created`, {
      description: draft.alertId ? `Linked to alert ${draft.alertId}.` : undefined,
      action: { label: "View", onClick: () => router.push(`/work-orders?wo=${wo.id}`) },
    });
    onDone(true);
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Create work order</DialogTitle>
        <DialogDescription>
          Fields marked <span aria-hidden>*</span>
          <span className="sr-only">with an asterisk</span> are required.
        </DialogDescription>
      </DialogHeader>

      {draft.alertId ? (
        <p className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-text-secondary">
          <Link2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Created from alert <span className="font-semibold text-foreground">{draft.alertId}</span>
            {draft.alertTitle ? `: ${draft.alertTitle}` : ""}. The alert will be linked and acknowledged.
          </span>
        </p>
      ) : null}

      <Field id={ids.title} label="Title" required error={errors.title}>
        <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${ids.title}-err` : undefined} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={ids.asset} label="Asset" required error={errors.assetId}>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger id={ids.asset} className="h-9 w-full" aria-invalid={!!errors.assetId} aria-describedby={errors.assetId ? `${ids.asset}-err` : undefined}>
              <SelectValue placeholder="Select an asset" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {api.sites().map((site) => (
                <SelectGroup key={site.id}>
                  <SelectLabel>{site.name}</SelectLabel>
                  {assets
                    .filter((a) => a.siteId === site.id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.id})
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id={ids.due} label="Due date" required error={errors.dueDate}>
          <Input id={ids.due} type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={!!errors.dueDate} aria-describedby={errors.dueDate ? `${ids.due}-err` : undefined} className="h-9" />
        </Field>

        <Field id={ids.priority} label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id={ids.priority} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="P1">P1 – Urgent (within 24 h)</SelectItem>
              <SelectItem value="P2">P2 – High (this week)</SelectItem>
              <SelectItem value="P3">P3 – Normal</SelectItem>
              <SelectItem value="P4">P4 – Low / next shutdown</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id={ids.type} label="Maintenance type">
          <Select value={type} onValueChange={(v) => setType(v as MaintenanceType)}>
            <SelectTrigger id={ids.type} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="predictive">Predictive</SelectItem>
              <SelectItem value="corrective">Corrective</SelectItem>
              <SelectItem value="preventive">Preventive</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id={ids.assignee} label="Assignee" className="sm:col-span-2">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger id={ids.assignee} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field id={ids.desc} label="Description and instructions">
        <Textarea id={ids.desc} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </Field>

      <fieldset className="grid gap-2" aria-describedby={errors.parts ? `${uid}-parts-err` : undefined}>
        <legend className="mb-1 text-sm font-medium">Parts required</legend>
        {parts.length === 0 ? <p className="text-xs text-muted-foreground">No parts added.</p> : null}
        <ul className="grid gap-2">
          {parts.map((line, i) => {
            const part = catalog.find((p) => p.partNo === line.partNo);
            const short = part ? part.inStock < line.qty : false;
            return (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`${uid}-part-${i}`} className="sr-only">
                    Part {i + 1}
                  </Label>
                  <Select
                    value={line.partNo}
                    onValueChange={(v) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, partNo: v } : p)))}
                  >
                    <SelectTrigger id={`${uid}-part-${i}`} className="h-9 w-full">
                      <SelectValue placeholder="Select a part" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {catalog.map((p) => (
                        <SelectItem key={p.partNo} value={p.partNo}>
                          {p.name} ({p.partNo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {part ? (
                    <span className={cn("flex items-center gap-1 text-xs", short ? "text-warning-fg" : "text-muted-foreground")}>
                      {short ? <TriangleAlert aria-hidden className="size-3.5 text-warning" /> : <CircleCheck aria-hidden className="size-3.5 text-healthy" />}
                      {short ? `Only ${part.inStock} in stock · lead time ${part.leadTimeDays} d` : `${part.inStock} in stock`}
                    </span>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor={`${uid}-qty-${i}`} className="sr-only">
                    Quantity for part {i + 1}
                  </Label>
                  <Input
                    id={`${uid}-qty-${i}`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, qty: Number(e.target.value) } : p)))}
                    className="h-9"
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Remove part ${i + 1}`} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        {errors.parts ? (
          <p id={`${uid}-parts-err`} className="text-xs text-critical-fg">
            {errors.parts}
          </p>
        ) : null}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setParts((ps) => [...ps, { partNo: "", qty: 1 }])}>
            <Plus aria-hidden />
            Add part
          </Button>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Creating…" : "Create work order"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ id, label, required, error, className, children }: { id: string; label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-critical-fg">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="flex items-center gap-1 text-xs text-critical-fg">
          <TriangleAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
