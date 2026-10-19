"use client";

// Alarm emails of one plant (Plants tab → Notifications): on or off, the recipients, which alarms, the
// language, and a test email. Saved in Firestore notifyConfig/{project} through /api/hvac/admin; the
// notifier in services/ingest (notify.ts) sends by these settings.

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, Send } from "lucide-react";
import { ErrorState, LoadingBlock } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectRow } from "@/lib/access/model";
import { adminAction, loadNotify } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { NOTIFY_RULES, parseRecipients, RECIPIENTS_MAX, type NotifyConfig, type NotifyView } from "@/lib/notify/config";
import { FormFailure, fieldError, fieldProps, useErrorText, useFailureFocus } from "./admin-common";

interface Props {
  plant: ProjectRow;
  onCancel: () => void;
  onDone: () => void;
  onChanged: () => Promise<void>;
  /** Whether the form has changes that are not saved, for closing the dialog. */
  dirtyRef: React.RefObject<boolean>;
}

export function PlantNotify(props: Props) {
  const { m } = useI18n();
  const t = m.hvac.admin.notify;
  const errorText = useErrorText();
  const [state, setState] = useState<{ view?: NotifyView; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);
  const name = props.plant.name ?? props.plant.id;

  useEffect(() => {
    let cancelled = false;
    loadNotify(props.plant.id).then(
      (view) => !cancelled && setState({ view }),
      (error: Error) => !cancelled && setState({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, [props.plant.id, attempt]);

  if (state.view) return <NotifyForm {...props} view={state.view} />;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.title(name)}</DialogTitle>
        <DialogDescription>{t.desc}</DialogDescription>
      </DialogHeader>
      {state.error ? (
        <ErrorState
          compact
          title={t.loadError}
          error={new Error(errorText(state.error))}
          onRetry={() => {
            setState({});
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <LoadingBlock label={t.loading} lines={5} />
      )}
    </>
  );
}

type Problem = "invalid" | "tooMany" | "none";

function NotifyForm({ plant, view, onCancel, onDone, onChanged, dirtyRef }: Props & { view: NotifyView }) {
  const { m, f } = useI18n();
  const t = m.hvac.admin.notify;
  const a = m.hvac.admin;
  const errorText = useErrorText();
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const initial = view.config;
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));
  const [minSeverity, setMinSeverity] = useState(initial.minSeverity);
  const [cleared, setCleared] = useState(initial.cleared);
  const [locale, setLocale] = useState(initial.locale);
  const [working, setWorking] = useState<"save" | "test" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, form, box);

  const parsed = parseRecipients(recipients);
  const config: NotifyConfig = { enabled, recipients: parsed.recipients, minSeverity, cleared, locale };
  const isDirty = JSON.stringify(config) !== JSON.stringify(initial);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [dirtyRef, isDirty]);

  /** What stops a save (test: whether there is anyone to send to). */
  const problem = (forTest: boolean): Problem | null =>
    parsed.invalid.length ? "invalid" : parsed.recipients.length > RECIPIENTS_MAX ? "tooMany" : parsed.recipients.length === 0 && (enabled || forTest) ? "none" : null;
  const problemText = (p: Problem | null, forTest: boolean) =>
    p === "invalid" ? t.errInvalid(parsed.invalid.join(", ")) : p === "tooMany" ? t.errTooMany(RECIPIENTS_MAX) : p === "none" ? (forTest ? t.errNoneTest : t.errNone) : undefined;
  const [checkedFor, setCheckedFor] = useState<"save" | "test">("save");
  const recipientsError = problemText(problem(checkedFor === "test"), checkedFor === "test");

  async function run(kind: "save" | "test") {
    if (working) return;
    setCheckedFor(kind);
    setShow(true);
    setAttempt((n) => n + 1);
    if (problem(kind === "test")) return;
    setFailure(null);
    setWorking(kind);
    try {
      if (kind === "save") {
        const r = await adminAction({ action: "saveNotify", project: plant.id, config });
        toast.success(r.changed ? t.saved : t.unchanged);
        dirtyRef.current = false;
        await onChanged();
        onDone();
      } else {
        const r = await adminAction({ action: "testNotify", project: plant.id, config });
        toast.success(t.tested(r.sent));
        await onChanged();
      }
    } catch (e) {
      setFailure(errorText(e));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(null);
    }
  }

  const rules = t.rules(Math.round(NOTIFY_RULES.tickMs / 1000), Math.round(NOTIFY_RULES.commDelayMs / 60_000), Math.round(NOTIFY_RULES.remindAfterMs / 60_000));
  return (
    <form
      ref={form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run("save");
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{t.title(plant.name ?? plant.id)}</DialogTitle>
        <DialogDescription>{t.desc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={box} title={a.errSummary} text={failure} /> : null}

      <div className="flex items-center gap-2">
        <Checkbox id={id("enabled")} checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
        <Label htmlFor={id("enabled")} className="font-medium">
          {t.enabled}
        </Label>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("recipients")}>{t.recipients}</Label>
        <Textarea
          id={id("recipients")}
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          rows={5}
          spellCheck={false}
          autoComplete="off"
          placeholder="name@company.co.th"
          className="font-mono text-sm"
          {...fieldProps(show, id("recipients"), recipientsError, true)}
        />
        <p id={`${id("recipients")}-hint`} className="text-xs text-text-secondary">
          {t.recipientsHint(RECIPIENTS_MAX)}
        </p>
        {fieldError(show, id("recipients"), recipientsError)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("severity")}>{t.minSeverity}</Label>
          <Select value={minSeverity} onValueChange={(v) => setMinSeverity(v as NotifyConfig["minSeverity"])}>
            <SelectTrigger id={id("severity")} className="data-[size=default]:h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warning">{t.severityAll}</SelectItem>
              <SelectItem value="critical">{t.severityCritical}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("locale")}>{t.locale}</Label>
          <Select value={locale} onValueChange={(v) => setLocale(v as NotifyConfig["locale"])}>
            <SelectTrigger id={id("locale")} className="data-[size=default]:h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="th">ไทย</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id={id("cleared")} checked={cleared} onCheckedChange={(v) => setCleared(v === true)} />
        <Label htmlFor={id("cleared")} className="font-normal">
          {t.cleared}
        </Label>
      </div>

      <section aria-labelledby={id("rules")} className="rounded-lg border bg-muted/40 p-3 text-sm">
        <h3 id={id("rules")} className="mb-1 font-semibold">
          {t.rulesTitle}
        </h3>
        <ul className="list-disc space-y-0.5 pl-5 text-text-secondary">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <p className="flex items-start gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t.setupNote}
      </p>
      <p className="text-xs text-text-secondary">{view.updatedAt ? t.lastSaved(f.dateTime(view.updatedAt), view.updatedBy ?? "—") : t.neverSaved}</p>

      <DialogFooter className="sticky bottom-0 z-10 gap-2 bg-popover sm:justify-between">
        <Button type="button" variant="outline" className="h-10" aria-disabled={working !== null || undefined} onClick={() => void run("test")}>
          <Send aria-hidden />
          {working === "test" ? t.testing : t.test}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            {a.cancel}
          </Button>
          <Button type="submit" className="h-10" aria-disabled={working !== null || undefined}>
            {working === "save" ? a.saving : t.save}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
