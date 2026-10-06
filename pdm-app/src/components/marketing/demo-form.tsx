"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invalidFields, MACHINE_RANGES, MAX_LENGTH, type DemoField } from "@/lib/demo-request";
import { useI18n } from "@/lib/i18n/provider";
import { submitDemoRequest } from "@/lib/leads";
import { cn } from "@/lib/utils";

type Field = DemoField;
const EMPTY = { name: "", company: "", jobTitle: "", email: "", phone: "", machines: "", message: "", website: "" };

export function DemoForm() {
  const { m, locale } = useI18n();
  const c = m.marketing.contact;
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [values, setValues] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failures, setFailures] = useState(0);
  const [failed, setFailed] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);

  // Move focus after React has rendered the summary, the send error or the success message.
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);
  useEffect(() => {
    if (failures > 0) failedRef.current?.focus();
  }, [failures]);
  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const errorText: Record<Field, string> = { name: c.errName, company: c.errCompany, email: c.errEmail, phone: c.errPhone, machines: c.errMachines, consent: c.errConsent };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const request = { ...values, consent, locale };
    const e = Object.fromEntries(invalidFields(request).map((f) => [f, errorText[f]])) as Partial<Record<Field, string>>;
    setErrors(e);
    setFailed(false);
    if (Object.keys(e).length) {
      setAttempt((n) => n + 1);
      return;
    }
    setSending(true);
    // Network errors and a stale page after a new deployment ("Failed to find Server Action")
    // throw instead of returning, so both paths end in the same retry message.
    const result = await submitDemoRequest(request).catch(() => ({ ok: false as const }));
    setSending(false);
    if (result.ok) {
      setSent(true);
    } else {
      setFailed(true);
      setFailures((n) => n + 1);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-healthy-border bg-healthy-bg p-6">
        <CircleCheck aria-hidden className="size-7 text-healthy" />
        <h3 ref={successRef} tabIndex={-1} className="text-lg font-semibold text-healthy-fg outline-none">
          {c.successTitle}
        </h3>
        <p className="text-sm text-foreground">{c.successDesc}</p>
        <Button
          variant="outline"
          className="mt-2 h-10 bg-card"
          onClick={() => {
            setSent(false);
            setValues(EMPTY);
            setConsent(false);
          }}
        >
          {c.again}
        </Button>
      </div>
    );
  }

  const errorList = (Object.entries(errors) as [Field, string][]).filter(([, msg]) => msg);
  const fieldProps = (f: Field) => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? id(`${f}-err`) : undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="relative flex flex-col gap-5" aria-labelledby={id("title")}>
      <div>
        <h3 id={id("title")} className="text-lg font-semibold">
          {c.formTitle}
        </h3>
        <p className="text-sm text-text-secondary">{c.required}</p>
      </div>

      {errorList.length > 0 ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm outline-none">
          <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
            <TriangleAlert aria-hidden className="size-4" />
            {c.errorSummary(errorList.length)}
          </p>
          <ul className="mt-1 list-disc pl-6">
            {errorList.map(([f, msg]) => (
              <li key={f}>
                <a href={`#${id(f)}`} className="inline-flex min-h-6 items-center underline">
                  {msg}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("name")} label={c.name} required error={errors.name}>
          <Input id={id("name")} autoComplete="name" maxLength={MAX_LENGTH.name} value={values.name} onChange={set("name")} className="h-10" {...fieldProps("name")} />
        </FormField>
        <FormField id={id("company")} label={c.company} required error={errors.company}>
          <Input id={id("company")} autoComplete="organization" maxLength={MAX_LENGTH.company} value={values.company} onChange={set("company")} className="h-10" {...fieldProps("company")} />
        </FormField>
        <FormField id={id("jobTitle")} label={c.jobTitle}>
          <Input id={id("jobTitle")} autoComplete="organization-title" maxLength={MAX_LENGTH.jobTitle} value={values.jobTitle} onChange={set("jobTitle")} className="h-10" />
        </FormField>
        <FormField id={id("email")} label={c.email} required error={errors.email}>
          <Input id={id("email")} type="email" autoComplete="email" maxLength={MAX_LENGTH.email} value={values.email} onChange={set("email")} className="h-10" {...fieldProps("email")} />
        </FormField>
        <FormField id={id("phone")} label={c.phone} required error={errors.phone}>
          <Input id={id("phone")} type="tel" autoComplete="tel" inputMode="tel" maxLength={MAX_LENGTH.phone} value={values.phone} onChange={set("phone")} className="h-10" {...fieldProps("phone")} />
        </FormField>
        <FormField id={id("machines")} label={c.machines} required error={errors.machines}>
          <Select value={values.machines} onValueChange={(v) => setValues((s) => ({ ...s, machines: v }))}>
            <SelectTrigger id={id("machines")} className="data-[size=default]:h-10 w-full" {...fieldProps("machines")}>
              <SelectValue placeholder={c.machinesPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {MACHINE_RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {c.machinesOptions[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("message")} label={c.message} className="sm:col-span-2">
          <Textarea id={id("message")} rows={4} maxLength={MAX_LENGTH.message} value={values.message} onChange={set("message")} />
        </FormField>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-start gap-3">
          <Checkbox id={id("consent")} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 size-5" {...fieldProps("consent")} />
          <Label htmlFor={id("consent")} className="block leading-relaxed font-normal">
            {c.consent}
            <span aria-hidden className="text-critical-fg">
              {" "}
              *
            </span>
            <span className="sr-only">{m.common.required}</span>
          </Label>
        </div>
        {errors.consent ? <FieldError id={id("consent-err")} text={errors.consent} /> : null}
      </div>

      {/* Honeypot for spam bots: off screen, out of the tab order and hidden from assistive tech. */}
      <div aria-hidden className="absolute -left-[10000px] size-px overflow-hidden">
        <label htmlFor={id("website")}>{c.honeypot}</label>
        <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={MAX_LENGTH.website} value={values.website} onChange={set("website")} />
      </div>

      {failed ? (
        <div ref={failedRef} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm outline-none">
          <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {c.errSendTitle}
          </p>
          <p className="mt-1 text-foreground">{c.errSendDesc}</p>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={sending} className="h-11 px-6 text-base">
          {sending ? c.submitting : c.submit}
        </Button>
      </div>
    </form>
  );
}

function FormField({ id, label, required, error, className, children }: { id: string; label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  const { m } = useI18n();
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
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
      {error ? <FieldError id={`${id}-err`} text={error} /> : null}
    </div>
  );
}

function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="flex items-center gap-1 text-xs text-critical-fg">
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      {text}
    </p>
  );
}
