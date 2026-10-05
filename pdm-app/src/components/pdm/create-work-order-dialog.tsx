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
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

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
export function draftFromAsset(asset: AssetRow, alert: Alert | undefined, m: Messages): WorkOrderDraft {
  const p = asset.prediction;
  const degrading = asset.status === "critical" || asset.status === "warning";
  if (asset.status === "offline" || alert?.source === "connectivity") {
    return {
      assetId: asset.id,
      alertId: alert?.id,
      alertTitle: alert?.title,
      title: m.woForm.restoreTitle(asset.name),
      description: alert?.description ?? m.woForm.restoreDesc,
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
    title: degrading && p ? `${p.failureModes[0].mode} – ${asset.name}` : m.woForm.inspectionTitle(asset.name),
    description:
      degrading && p
        ? `${p.recommendedAction}\n\n${m.woForm.modelNote(p.failureModes[0].mode, Math.round(p.failureModes[0].probability * 100), p.rulDays, p.rulLow, p.rulHigh, Math.round(p.confidence * 100))}`
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
  const { m } = useI18n();
  const w = m.woForm;
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
    if (!title.trim()) e.title = w.errTitle;
    if (!assetId) e.assetId = w.errAsset;
    if (!dueDate) e.dueDate = w.errDueRequired;
    else if (dueDate < today) e.dueDate = w.errDuePast;
    if (parts.some((p) => !p.partNo || p.qty < 1)) e.parts = w.errParts;
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
    toast.success(w.toastCreated(wo.id), {
      description: draft.alertId ? w.toastLinked(draft.alertId) : undefined,
      action: { label: m.common.view, onClick: () => router.push(`/app/work-orders?wo=${wo.id}`) },
    });
    onDone(true);
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{w.title}</DialogTitle>
        <DialogDescription>
          {w.requiredPrefix} <span aria-hidden>*</span>
          <span className="sr-only">{w.requiredSr}</span> {w.requiredSuffix}
        </DialogDescription>
      </DialogHeader>

      {draft.alertId ? (
        <p className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-text-secondary">
          <Link2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span>
            {w.fromAlertPrefix} <span className="font-semibold text-foreground">{draft.alertId}</span>
            {draft.alertTitle ? `: ${draft.alertTitle}` : ""} · {w.fromAlertSuffix}
          </span>
        </p>
      ) : null}

      <Field id={ids.title} label={w.fieldTitle} required error={errors.title}>
        <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${ids.title}-err` : undefined} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={ids.asset} label={w.asset} required error={errors.assetId}>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger id={ids.asset} className="h-9 w-full" aria-invalid={!!errors.assetId} aria-describedby={errors.assetId ? `${ids.asset}-err` : undefined}>
              <SelectValue placeholder={w.selectAsset} />
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

        <Field id={ids.due} label={w.dueDate} required error={errors.dueDate}>
          <Input id={ids.due} type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={!!errors.dueDate} aria-describedby={errors.dueDate ? `${ids.due}-err` : undefined} className="h-9" />
        </Field>

        <Field id={ids.priority} label={w.priority}>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id={ids.priority} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {m.status.priorityLong[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id={ids.type} label={w.type}>
          <Select value={type} onValueChange={(v) => setType(v as MaintenanceType)}>
            <SelectTrigger id={ids.type} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["predictive", "corrective", "preventive", "inspection"] as const).map((t) => (
                <SelectItem key={t} value={t}>
                  {m.status.maintenanceType[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id={ids.assignee} label={w.assignee} className="sm:col-span-2">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger id={ids.assignee} className="h-9 w-full">
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
        </Field>
      </div>

      <Field id={ids.desc} label={w.description}>
        <Textarea id={ids.desc} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </Field>

      <fieldset className="grid gap-2" aria-describedby={errors.parts ? `${uid}-parts-err` : undefined}>
        <legend className="mb-1 text-sm font-medium">{w.parts}</legend>
        {parts.length === 0 ? <p className="text-xs text-muted-foreground">{w.noParts}</p> : null}
        <ul className="grid gap-2">
          {parts.map((line, i) => {
            const part = catalog.find((p) => p.partNo === line.partNo);
            const short = part ? part.inStock < line.qty : false;
            return (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`${uid}-part-${i}`} className="sr-only">
                    {w.partN(i + 1)}
                  </Label>
                  <Select
                    value={line.partNo}
                    onValueChange={(v) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, partNo: v } : p)))}
                  >
                    <SelectTrigger id={`${uid}-part-${i}`} className="h-9 w-full">
                      <SelectValue placeholder={w.selectPart} />
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
                      {short ? w.onlyInStock(part.inStock, part.leadTimeDays) : w.inStock(part.inStock)}
                    </span>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor={`${uid}-qty-${i}`} className="sr-only">
                    {w.qtyFor(i + 1)}
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
                <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={w.removePart(i + 1)} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}>
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
            {w.addPart}
          </Button>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={() => onDone(false)}>
          {m.common.cancel}
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? w.submitting : w.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ id, label, required, error, className, children }: { id: string; label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  const { m } = useI18n();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-critical-fg">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">{m.common.required}</span> : null}
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
