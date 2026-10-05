"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BellRing, Check, Minus, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, Undo2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Channel, NotificationRule, PredictionSettings, Role, Severity, ThresholdSetting, User } from "@/lib/types";
import { useQuery } from "@/lib/use-query";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";
import { PageHeader, SectionHeading } from "@/components/pdm/page-header";
import { EmptyState, ErrorState } from "@/components/pdm/states";
import { SeverityChip } from "@/components/pdm/status";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";

export function SettingsView() {
  const { m } = useI18n();
  const s = m.settings;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={s.title} description={s.description} />
      <Tabs defaultValue="thresholds" className="gap-4">
        <TabsList className="h-auto min-h-10 flex-wrap justify-start">
          <TabsTrigger value="thresholds" className="px-3">
            <SlidersHorizontal aria-hidden />
            {s.tabs.thresholds}
          </TabsTrigger>
          <TabsTrigger value="rules" className="px-3">
            <BellRing aria-hidden />
            {s.tabs.rules}
          </TabsTrigger>
          <TabsTrigger value="users" className="px-3">
            <Users aria-hidden />
            {s.tabs.users}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="thresholds">
          <ThresholdsTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ---- Thresholds -----------------------------------------------------------------------

type RowErrors = Record<number, string>;

function ThresholdsTab() {
  const { m } = useI18n();
  const { data, error, loading, retry } = useQuery("settings", () => api.getSettings());
  if (error) return <ErrorState title={m.settings.thresholdsError} error={error} onRetry={retry} />;
  if (loading || !data) return <TabSkeleton label={m.settings.thresholdsLoading} />;
  return <ThresholdsForm key={JSON.stringify(data.thresholds) + JSON.stringify(data.prediction)} thresholds={data.thresholds} prediction={data.prediction} />;
}

function ThresholdsForm({ thresholds: initialRows, prediction: initialPrediction }: { thresholds: ThresholdSetting[]; prediction: PredictionSettings }) {
  const { m } = useI18n();
  const s = m.settings;
  const [rows, setRows] = useState(initialRows);
  const [prediction, setPrediction] = useState(initialPrediction);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [predError, setPredError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const dirty = JSON.stringify(rows) !== JSON.stringify(initialRows) || JSON.stringify(prediction) !== JSON.stringify(initialPrediction);
  const types = useMemo(() => [...new Set(rows.map((r) => r.assetType))], [rows]);
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => typeFilter === "all" || r.assetType === typeFilter);

  function setRow(i: number, patch: Partial<ThresholdSetting>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function validate() {
    const errs: RowErrors = {};
    rows.forEach((r, i) => {
      if (!Number.isFinite(r.warning) || !Number.isFinite(r.critical)) errs[i] = s.errBothLimits;
      else if (r.direction === "above" && r.critical <= r.warning) errs[i] = s.errCriticalHigher;
      else if (r.direction === "below" && r.critical >= r.warning) errs[i] = s.errCriticalLower;
    });
    let pe: string | null = null;
    if (prediction.healthCriticalBelow >= prediction.healthWarningBelow) pe = s.errHealthOrder;
    else if (prediction.minConfidence < 0.3 || prediction.minConfidence > 0.95) pe = s.errConfidence;
    else if (prediction.rulAlertDays < 1) pe = s.errRul;
    return { errs, pe };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { errs, pe } = validate();
    setRowErrors(errs);
    setPredError(pe);
    if (Object.keys(errs).length || pe) {
      // Show rows with errors even if filtered out, then move focus to the summary.
      if (Object.keys(errs).length) setTypeFilter("all");
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setSaving(true);
    await api.saveThresholds(rows, prediction);
    setSaving(false);
    toast.success(s.savedToast, { description: s.savedDesc });
  }

  const errorCount = Object.keys(rowErrors).length + (predError ? 1 : 0);

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {errorCount > 0 ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
            <TriangleAlert aria-hidden className="size-4" />
            {s.fixProblems(errorCount)}
          </p>
          <ul className="mt-1 list-disc pl-6">
            {predError ? (
              <li>
                <a href={`#${uid}-health-warning`} className="inline-flex min-h-6 items-center underline">
                  {predError}
                </a>
              </li>
            ) : null}
            {Object.entries(rowErrors).map(([i, msg]) => {
              const r = rows[Number(i)];
              return (
                <li key={i}>
                  <a href={`#${uid}-w-${i}`} className="inline-flex min-h-6 items-center underline">
                    {m.assetTypes[r.assetType]} · {m.sensors[r.sensor]}: {msg}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <section aria-labelledby={`${uid}-pred`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading id={`${uid}-pred`} title={s.predHeading} description={s.predDesc} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberField id={`${uid}-health-warning`} label={s.healthWarning} suffix="/ 100" value={prediction.healthWarningBelow} onChange={(v) => setPrediction((p) => ({ ...p, healthWarningBelow: v }))} invalid={!!predError} />
          <NumberField id={`${uid}-health-critical`} label={s.healthCritical} suffix="/ 100" value={prediction.healthCriticalBelow} onChange={(v) => setPrediction((p) => ({ ...p, healthCriticalBelow: v }))} invalid={!!predError} />
          <NumberField id={`${uid}-rul`} label={s.rulUnder} suffix={s.days} value={prediction.rulAlertDays} onChange={(v) => setPrediction((p) => ({ ...p, rulAlertDays: v }))} />
          <NumberField
            id={`${uid}-conf`}
            label={s.minConfidence}
            suffix="%"
            value={Math.round(prediction.minConfidence * 100)}
            onChange={(v) => setPrediction((p) => ({ ...p, minConfidence: v / 100 }))}
            hint={s.minConfidenceHint}
          />
        </div>
      </section>

      <section aria-labelledby={`${uid}-sensors`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading
          id={`${uid}-sensors`}
          title={s.sensorHeading}
          description={s.sensorDesc}
          actions={
            <div className="flex items-center gap-2">
              <label htmlFor={`${uid}-type`} className="text-xs font-medium text-text-secondary">
                {s.assetType}
              </label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id={`${uid}-type`} className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{m.common.allTypes}</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {m.assetTypes[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState compact icon={SlidersHorizontal} title={s.noThresholdsTitle} description={s.noThresholdsDesc} />
        ) : (
          <div tabIndex={0} role="region" aria-label={s.thresholdsRegion} className="relative overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{s.thresholdsCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.assetType}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colSensor}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colAlertWhen}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colWarning}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colCritical}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map(({ r, i }) => {
                  const err = rowErrors[i];
                  const label = `${m.assetTypes[r.assetType]}, ${m.sensors[r.sensor]}`;
                  return (
                    <tr key={`${r.assetType}-${r.sensor}`} className={cn(err && "bg-critical-bg/60")}>
                      <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {m.assetTypes[r.assetType]}
                      </th>
                      <td className="px-3 py-2 whitespace-nowrap">{m.sensors[r.sensor]}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{r.direction === "above" ? s.aboveLimit : s.belowLimit}</td>
                      <td className="px-3 py-2">
                        <UnitInput id={`${uid}-w-${i}`} label={s.warningLimitLabel(label, r.unit)} unit={r.unit} value={r.warning} onChange={(v) => setRow(i, { warning: v })} invalid={!!err} describedBy={err ? `${uid}-err-${i}` : undefined} />
                      </td>
                      <td className="px-3 py-2">
                        <UnitInput id={`${uid}-c-${i}`} label={s.criticalLimitLabel(label, r.unit)} unit={r.unit} value={r.critical} onChange={(v) => setRow(i, { critical: v })} invalid={!!err} describedBy={err ? `${uid}-err-${i}` : undefined} />
                        {err ? (
                          <p id={`${uid}-err-${i}`} className="mt-1 flex items-center gap-1 text-xs text-critical-fg">
                            <TriangleAlert aria-hidden className="size-3.5" />
                            {err}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <p className="mr-auto text-xs text-text-secondary" aria-live="polite">
          {dirty ? s.unsaved : s.allSaved}
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!dirty}
          onClick={() => {
            setRows(initialRows);
            setPrediction(initialPrediction);
            setRowErrors({});
            setPredError(null);
          }}
        >
          <Undo2 aria-hidden />
          {s.discard}
        </Button>
        <Button type="submit" size="lg" disabled={!dirty || saving}>
          {saving ? s.saving : s.saveThresholds}
        </Button>
      </div>
    </form>
  );
}

function NumberField({ id, label, suffix, value, onChange, invalid, hint }: { id: string; label: string; suffix: string; value: number; onChange: (v: number) => void; invalid?: boolean; hint?: string }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          aria-invalid={invalid}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-9 w-24"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function UnitInput({ id, label, unit, value, onChange, invalid, describedBy }: { id: string; label: string; unit: string; value: number; onChange: (v: number) => void; invalid?: boolean; describedBy?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        step="any"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="h-9 w-24 tabular"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

// ---- Notification rules ---------------------------------------------------------------

const CHANNELS: Channel[] = ["email", "sms", "teams", "line"];
const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const ESCALATE_MINUTES = [15, 30, 60, 240];

function RulesTab() {
  const { m } = useI18n();
  const s = m.settings;
  const { data, error, loading, retry } = useQuery("settings", () => api.getSettings());
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);
  const editFocus = useDialogFocus();
  const deleteFocus = useDialogFocus();

  if (error) return <ErrorState title={s.rulesError} error={error} onRetry={retry} />;
  if (loading || !data) return <TabSkeleton label={s.rulesLoading} />;

  const blank: NotificationRule = { id: "", name: "", enabled: true, severities: ["critical"], siteIds: [], channels: ["email"], recipients: "", escalateAfterMinutes: null, escalateTo: null };
  const sites = api.sites();

  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading
        id="rules-heading"
        title={s.rulesHeading}
        description={s.rulesDesc}
        actions={
          <Button id="add-rule" onClick={() => setEditing(blank)}>
            <Plus aria-hidden />
            {s.addRule}
          </Button>
        }
      />
      {data.rules.length === 0 ? (
        <EmptyState
          compact
          icon={BellRing}
          title={s.rulesEmptyTitle}
          description={s.rulesEmptyDesc}
          action={
            <Button onClick={() => setEditing(blank)}>
              <Plus aria-hidden />
              {s.addRule}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {data.rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-3">
              <Switch
                checked={r.enabled}
                onCheckedChange={async (v) => {
                  await api.setRuleEnabled(r.id, v);
                  toast.success(s.ruleToggledToast(r.name, v));
                }}
                aria-label={s.enableRule(r.name)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", !r.enabled && "text-text-secondary")}>
                  {r.name}
                  {!r.enabled ? <span className="ml-2 text-xs font-normal">{s.disabled}</span> : null}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {r.severities.map((sev) => (
                    <SeverityChip key={sev} severity={sev} size="sm" />
                  ))}
                  <span className="text-xs text-text-secondary">· {r.siteIds.length ? r.siteIds.map((id) => sites.find((x) => x.id === id)?.name).join(", ") : m.common.allSites}</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {s.notify} <span className="font-medium text-foreground">{r.recipients || s.nobody}</span> {s.via} {r.channels.map((c) => m.channels[c]).join(", ")}
                  {r.escalateAfterMinutes ? (
                    <>
                      {" "}
                      · {s.escalateTo} <span className="font-medium text-foreground">{r.escalateTo}</span> {s.ifNotAck(r.escalateAfterMinutes)}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label={s.editRule(r.name)} onClick={() => setEditing(r)}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={s.deleteRule(r.name)} onClick={() => setDeleting(r)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" {...editFocus.contentProps}>
          {editing ? <RuleForm rule={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md" {...deleteFocus.contentProps}>
          <DialogHeader>
            <DialogTitle>{s.deleteTitle}</DialogTitle>
            <DialogDescription>{s.deleteDesc(deleting?.name ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setDeleting(null)}>
              {m.common.cancel}
            </Button>
            <Button
              size="lg"
              className="bg-critical text-on-critical hover:bg-critical-fg"
              onClick={async () => {
                if (!deleting) return;
                await api.deleteRule(deleting.id);
                toast.success(s.deletedToast(deleting.name));
                deleteFocus.returnFocusTo("add-rule");
                setDeleting(null);
              }}
            >
              <Trash2 aria-hidden />
              {s.deleteButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RuleForm({ rule, onDone }: { rule: NotificationRule; onDone: () => void }) {
  const { m } = useI18n();
  const s = m.settings;
  const uid = useId();
  const [draft, setDraft] = useState(rule);
  const [errors, setErrors] = useState<{ name?: string; severities?: string; channels?: string; recipients?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);
  const sites = api.sites();

  function toggle<T>(list: T[], v: T) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!draft.name.trim()) errs.name = s.errRuleName;
    if (!draft.severities.length) errs.severities = s.errSeverities;
    if (!draft.channels.length) errs.channels = s.errChannels;
    if (!draft.recipients.trim()) errs.recipients = s.errRecipients;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 0);
      return;
    }
    await api.saveRule(draft);
    toast.success(rule.id ? s.ruleUpdatedToast(draft.name) : s.ruleAddedToast(draft.name));
    onDone();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{rule.id ? s.editTitle : s.addTitle}</DialogTitle>
        <DialogDescription>{s.ruleFormDesc}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-name`}>{s.ruleName}</Label>
        <Input id={`${uid}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${uid}-name-err` : undefined} />
        {errors.name ? <FieldError id={`${uid}-name-err`} text={errors.name} /> : null}
      </div>
      <CheckGroup legend={s.severities} error={errors.severities} errorId={`${uid}-sev-err`}>
        {SEVERITIES.map((sev) => (
          <CheckItem key={sev} id={`${uid}-sev-${sev}`} label={m.status.severity[sev]} checked={draft.severities.includes(sev)} onChange={() => setDraft({ ...draft, severities: toggle(draft.severities, sev) })} invalid={!!errors.severities} />
        ))}
      </CheckGroup>
      <CheckGroup legend={s.sites}>
        {sites.map((site) => (
          <CheckItem key={site.id} id={`${uid}-site-${site.id}`} label={site.name} checked={draft.siteIds.includes(site.id)} onChange={() => setDraft({ ...draft, siteIds: toggle(draft.siteIds, site.id) })} />
        ))}
      </CheckGroup>
      <CheckGroup legend={s.channels} error={errors.channels} errorId={`${uid}-ch-err`}>
        {CHANNELS.map((c) => (
          <CheckItem key={c} id={`${uid}-ch-${c}`} label={m.channels[c]} checked={draft.channels.includes(c)} onChange={() => setDraft({ ...draft, channels: toggle(draft.channels, c) })} invalid={!!errors.channels} />
        ))}
      </CheckGroup>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-rcpt`}>{s.recipients}</Label>
        <Input
          id={`${uid}-rcpt`}
          value={draft.recipients}
          placeholder={s.recipientsPlaceholder}
          onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
          aria-invalid={!!errors.recipients}
          aria-describedby={errors.recipients ? `${uid}-rcpt-err` : undefined}
        />
        {errors.recipients ? <FieldError id={`${uid}-rcpt-err`} text={errors.recipients} /> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-esc`}>{s.escalate}</Label>
          <Select value={draft.escalateAfterMinutes ? String(draft.escalateAfterMinutes) : "none"} onValueChange={(v) => setDraft({ ...draft, escalateAfterMinutes: v === "none" ? null : Number(v) })}>
            <SelectTrigger id={`${uid}-esc`} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{s.escalateNone}</SelectItem>
              {ESCALATE_MINUTES.map((min) => (
                <SelectItem key={min} value={String(min)}>
                  {s.escalateAfter[min]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-escto`}>{s.escalateToField}</Label>
          <Input id={`${uid}-escto`} value={draft.escalateTo ?? ""} disabled={!draft.escalateAfterMinutes} onChange={(e) => setDraft({ ...draft, escalateTo: e.target.value || null })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          {m.common.cancel}
        </Button>
        <Button type="submit" size="lg">
          {rule.id ? s.saveRule : s.addRule}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CheckGroup({ legend, children, error, errorId }: { legend: string; children: React.ReactNode; error?: string; errorId?: string }) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
      {error && errorId ? <FieldError id={errorId} text={error} /> : null}
    </fieldset>
  );
}

function CheckItem({ id, label, checked, onChange, invalid }: { id: string; label: string; checked: boolean; onChange: () => void; invalid?: boolean }) {
  return (
    <div className="flex min-h-6 items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} aria-invalid={invalid} className="size-5" />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="flex items-center gap-1 text-xs text-critical-fg">
      <TriangleAlert aria-hidden className="size-3.5" />
      {text}
    </p>
  );
}

// ---- Users & roles --------------------------------------------------------------------

const ROLES: Role[] = ["Admin", "Plant Manager", "Reliability Engineer", "Maintenance Engineer", "Technician"];
const PERMISSIONS: { key: keyof Messages["settings"]["permissions"]; roles: Role[] }[] = [
  { key: "view", roles: ROLES },
  { key: "triage", roles: ["Admin", "Plant Manager", "Reliability Engineer", "Maintenance Engineer", "Technician"] },
  { key: "editWo", roles: ["Admin", "Plant Manager", "Reliability Engineer", "Maintenance Engineer"] },
  { key: "closeWo", roles: ["Admin", "Plant Manager", "Maintenance Engineer", "Technician"] },
  { key: "thresholds", roles: ["Admin", "Reliability Engineer"] },
  { key: "rules", roles: ["Admin", "Plant Manager", "Reliability Engineer"] },
  { key: "users", roles: ["Admin"] },
];

function UsersTab() {
  const { m } = useI18n();
  const s = m.settings;
  const { data, error, loading, retry } = useQuery("users", () => api.listUsers());
  const [inviting, setInviting] = useState(false);
  const inviteFocus = useDialogFocus();
  const sites = api.sites();

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="users-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading
          id="users-heading"
          title={s.usersHeading}
          description={s.usersDesc}
          actions={
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden />
              {s.invite}
            </Button>
          }
        />
        {error ? (
          <ErrorState compact title={s.usersError} error={error} onRetry={retry} />
        ) : loading || !data ? (
          <TabSkeleton label={s.usersLoading} />
        ) : data.length === 0 ? (
          <EmptyState compact icon={Users} title={s.usersEmptyTitle} description={s.usersEmptyDesc} action={<Button onClick={() => setInviting(true)}>{s.invite}</Button>} />
        ) : (
          <div tabIndex={0} role="region" aria-label={s.usersRegion} className="relative overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{s.usersCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colName}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colRole}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colSites}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.colStatus}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{s.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-text-secondary">
                          {u.initials}
                        </span>
                        <div>
                          <p className="font-medium">
                            {u.name}
                            {u.id === api.currentUserId ? <span className="ml-1 text-xs font-normal text-muted-foreground">{m.common.you}</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </th>
                    <td className="px-3 py-2">
                      <Select
                        value={u.role}
                        onValueChange={async (v) => {
                          await api.updateUser(u.id, { role: v as Role });
                          toast.success(s.roleToast(u.name, m.roles[v as Role]));
                        }}
                      >
                        <SelectTrigger className="h-9 w-52" aria-label={s.roleFor(u.name)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {m.roles[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{u.siteIds.length === sites.length ? m.common.allSites : u.siteIds.map((id) => sites.find((x) => x.id === id)?.name).join(", ")}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-medium", u.active ? "text-healthy-fg" : "text-text-secondary")}>
                        {u.active ? <Check aria-hidden className="size-3.5 text-healthy" /> : <Minus aria-hidden className="size-3.5" />}
                        {u.active ? s.active : s.deactivated}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={u.id === api.currentUserId}
                        onClick={async () => {
                          await api.updateUser(u.id, { active: !u.active });
                          toast.success(s.activeToast(u.name, !u.active));
                        }}
                      >
                        {u.active ? s.deactivate : s.reactivate}
                        <span className="sr-only"> {u.name}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="perm-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading id="perm-heading" title={s.permHeading} description={s.permDesc} />
        <div tabIndex={0} role="region" aria-label={s.permRegion} className="relative overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{s.permCaption}</caption>
            <thead className="bg-muted text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {s.permCol}
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-3 py-2 text-center font-medium">
                    {m.roles[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSIONS.map((p) => (
                <tr key={p.key}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {s.permissions[p.key]}
                  </th>
                  {ROLES.map((r) => {
                    const ok = p.roles.includes(r);
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        {ok ? <ShieldCheck aria-hidden className="mx-auto size-4 text-healthy" /> : <Minus aria-hidden className="mx-auto size-4 text-muted-foreground" />}
                        <span className="sr-only">{ok ? s.allowed : s.notAllowed}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent className="sm:max-w-md" {...inviteFocus.contentProps}>
          {inviting ? <InviteForm onDone={() => setInviting(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { m } = useI18n();
  const s = m.settings;
  const uid = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Technician");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: string; email?: string; sites?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = s.errFullName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = s.errEmail;
    if (!siteIds.length) errs.sites = s.errSites;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 0);
      return;
    }
    const u: User = await api.inviteUser({ name: name.trim(), email: email.trim(), role, siteIds });
    toast.success(s.inviteToast(u.email));
    onDone();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{s.inviteTitle}</DialogTitle>
        <DialogDescription>{s.inviteDesc}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-name`}>{s.fullName}</Label>
        <Input ref={firstRef} id={`${uid}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${uid}-name-err` : undefined} />
        {errors.name ? <FieldError id={`${uid}-name-err`} text={errors.name} /> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-email`}>{s.workEmail}</Label>
        <Input id={`${uid}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? `${uid}-email-err` : undefined} />
        {errors.email ? <FieldError id={`${uid}-email-err`} text={errors.email} /> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-role`}>{s.role}</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger id={`${uid}-role`} className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {m.roles[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CheckGroup legend={s.siteAccess} error={errors.sites} errorId={`${uid}-sites-err`}>
        {api.sites().map((site) => (
          <CheckItem
            key={site.id}
            id={`${uid}-site-${site.id}`}
            label={site.name}
            checked={siteIds.includes(site.id)}
            onChange={() => setSiteIds((ids) => (ids.includes(site.id) ? ids.filter((x) => x !== site.id) : [...ids, site.id]))}
            invalid={!!errors.sites}
          />
        ))}
      </CheckGroup>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          {m.common.cancel}
        </Button>
        <Button type="submit" size="lg">
          {s.sendInvite}
        </Button>
      </DialogFooter>
    </form>
  );
}
