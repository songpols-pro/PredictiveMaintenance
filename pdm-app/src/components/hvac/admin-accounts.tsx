"use client";

// Accounts tab of the admin page: create accounts, choose what they may open (customers, single
// plants, operator), let the person set a password, and disable or enable accounts.

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, CircleCheck, Copy, KeyRound, Link2, Mail, ShieldCheck, TriangleAlert, UserPlus, UserRound, UsersRound } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { Chip } from "@/components/pdm/status";
import { EmptyState } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLAIMS_MAX_BYTES, claimsBytes, claimsFor, looksLikeEmail, redundantProjects, type Access, type AccountRow, type Overview } from "@/lib/access/model";
import { resetPassword } from "@/lib/firebase/session";
import { AdminApiError, adminAction } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { type AdminData, CellLabel, DialogButtons, FormFailure, orgName, plantName, STACKED_TABLE, useErrorText, useFailureFocus } from "./admin-common";

type AccountDialog = { kind: "new" } | { kind: "access" | "password" | "disable"; account: AccountRow };

const NEW_BUTTON = "admin-new-account";

export function AccountsPanel({ data, reload }: AdminData) {
  const { m, f } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const [query, setQuery] = useState("");
  // The dialog's content stays while it closes (its title too), so only `open` goes false; `seq` gives
  // each opening a fresh form.
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);
  const show = (d: AccountDialog) => {
    setDialog(d);
    setSeq((n) => n + 1);
    setOpen(true);
  };
  const focus = useDialogFocus(NEW_BUTTON);
  const q = query.trim().toLowerCase();
  const shown = data.accounts.filter((acc) => !q || (acc.email ?? acc.uid).toLowerCase().includes(q));
  const close = () => setOpen(false);

  async function enable(acc: AccountRow) {
    try {
      await adminAction({ action: "setDisabled", uid: acc.uid, disabled: false });
      toast.success(a.enabled(acc.email ?? acc.uid));
      await reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <section aria-labelledby="admin-accounts-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading
        id="admin-accounts-heading"
        title={a.accountsHeading}
        description={a.accountsDesc}
        actions={
          <Button id={NEW_BUTTON} onClick={() => show({ kind: "new" })}>
            <UserPlus aria-hidden />
            {a.newAccount}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-72 max-w-full gap-1.5">
          <Label htmlFor={`${uid}-search`}>{a.search}</Label>
          <Input id={`${uid}-search`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full" autoComplete="off" spellCheck={false} />
        </div>
        <p role="status" className="pb-2 text-sm text-text-secondary">
          {a.shown(shown.length, data.accounts.length)}
        </p>
      </div>
      {data.accounts.length === 0 ? (
        <EmptyState compact icon={UsersRound} title={a.noAccess} />
      ) : shown.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-text-secondary">{a.noMatches}</p>
      ) : (
        <div tabIndex={0} role="region" aria-label={a.accountsCaption} className="relative overflow-x-auto rounded-md border">
          <table className={cn(STACKED_TABLE, "md:min-w-[720px]")}>
            <caption className="sr-only">{a.accountsCaption}</caption>
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colAccount}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colAccess}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colLastSignIn}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  <span className="sr-only">{a.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((acc) => {
                const me = acc.uid === data.me;
                const label = acc.email ?? acc.uid;
                return (
                  <tr key={acc.uid}>
                    <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                      <p className="font-medium break-all">{label}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {me ? <Chip tone="neutral" icon={UserRound} label={a.you} size="sm" /> : null}
                        {acc.disabled ? <Chip tone="critical" icon={Ban} label={a.disabledTag} size="sm" /> : null}
                      </div>
                    </th>
                    <td className="px-3 py-2 align-top">
                      <AccessSummary data={data} access={acc.access} />
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap tabular">
                      <CellLabel>{a.colLastSignIn}</CellLabel>
                      {acc.lastSignInAt ? f.dateTime(acc.lastSignInAt) : a.never}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => show({ kind: "access", account: acc })}>
                          <ShieldCheck aria-hidden />
                          {a.accessAction}
                          <span className="sr-only"> {label}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => show({ kind: "password", account: acc })}>
                          <KeyRound aria-hidden />
                          {a.passwordAction}
                          <span className="sr-only"> {label}</span>
                        </Button>
                        {acc.disabled ? (
                          <Button variant="ghost" size="sm" onClick={() => void enable(acc)}>
                            <CircleCheck aria-hidden />
                            {a.enableAction}
                            <span className="sr-only"> {label}</span>
                          </Button>
                        ) : me ? null : (
                          <Button variant="ghost" size="sm" className="text-critical-fg hover:text-critical-fg" onClick={() => show({ kind: "disable", account: acc })}>
                            <Ban aria-hidden />
                            {a.disableAction}
                            <span className="sr-only"> {label}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent key={seq} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" {...focus.contentProps}>
          {dialog?.kind === "new" || dialog?.kind === "access" ? (
            <AccessForm data={data} account={dialog.kind === "access" ? dialog.account : null} reload={reload} onDone={close} />
          ) : dialog?.kind === "password" ? (
            <InviteStep account={dialog.account} isNew={false} onDone={close} />
          ) : dialog?.kind === "disable" ? (
            <DisableAccount account={dialog.account} reload={reload} onDone={close} />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** What an account may open, in words: operator, customers, single plants, and plants given twice. */
function AccessSummary({ data, access }: { data: Overview; access: Access }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const twice = redundantProjects(access, data.projects);
  if (!access.admin && !access.orgs.length && !access.projects.length) return <span className="text-muted-foreground">{a.noAccess}</span>;
  return (
    <div className="flex flex-col gap-1">
      {access.admin ? <Chip tone="info" icon={ShieldCheck} label={a.operatorTag} size="sm" className="self-start" /> : null}
      {access.orgs.length ? (
        <p>
          <span className="text-text-secondary">{a.customersLabel}: </span>
          {access.orgs.map((o) => orgName(data, o)).join(", ")}
        </p>
      ) : null}
      {access.projects.length ? (
        <p>
          <span className="text-text-secondary">{a.plantsLabel}: </span>
          {access.projects.map((p) => plantName(data, p)).join(", ")}
        </p>
      ) : null}
      {twice.length ? (
        <p className="text-xs text-warning-fg">
          <TriangleAlert aria-hidden className="mr-1 inline size-3.5 align-text-bottom" />
          {a.twice(twice.map((p) => plantName(data, p)).join(", "))}
        </p>
      ) : null}
    </div>
  );
}

function AccessForm({ data, account, reload, onDone }: { data: Overview; account: AccountRow | null; reload: () => Promise<void>; onDone: () => void }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const creating = account === null;
  const self = account?.uid === data.me;
  const lockOperator = self && account?.access.admin === true;
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(account?.access.admin ?? false);
  const [orgs, setOrgs] = useState(() => new Set(account?.access.orgs ?? []));
  const [projects, setProjects] = useState(() => new Set(account?.access.projects ?? []));
  const [emailError, setEmailError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState<AccountRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  if (created) return <InviteStep account={created} isNew onDone={onDone} />;

  const access: Access = { admin, orgs: [...orgs], projects: [...projects] };
  const nothing = !admin && !orgs.size && !projects.size;
  const plants = [...data.projects].sort((x, y) => (x.name ?? x.id).localeCompare(y.name ?? y.id));
  const via = (project: string) => {
    const owner = data.projects.find((p) => p.id === project)?.org;
    return owner && orgs.has(owner) ? owner : null;
  };
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setFailure(null);
    const clean = email.trim().toLowerCase();
    const emailProblem = !creating ? null : !looksLikeEmail(clean) ? a.errEmail : data.accounts.some((x) => x.email === clean) ? a.errors["email-taken"](clean) : null;
    setEmailError(emailProblem);
    if (emailProblem) return setAttempt((n) => n + 1);
    if (claimsBytes(claimsFor({}, access)) > CLAIMS_MAX_BYTES) {
      setFailure(a.errors["claims-too-large"](""));
      return setAttempt((n) => n + 1);
    }
    setWorking(true);
    try {
      if (creating) {
        const { account: row } = await adminAction({ action: "createAccount", email: clean, access });
        toast.success(a.accountCreated(clean));
        await reload();
        setCreated(row);
      } else {
        const { changed } = await adminAction({ action: "setAccess", uid: account.uid, access });
        toast.success(changed ? a.accessSaved(account.email ?? account.uid) : a.noChanges);
        await reload();
        onDone();
      }
    } catch (err) {
      if (err instanceof AdminApiError && (err.code === "email-taken" || err.code === "bad-email")) setEmailError(errorText(err));
      else setFailure(errorText(err));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="break-all">{creating ? a.newAccountTitle : a.accessTitle(account.email ?? account.uid)}</DialogTitle>
        <DialogDescription>{creating ? a.accountsDesc : a.customersDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}

      {creating ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-email`}>{a.email}</Label>
          <Input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${uid}-email-err` : undefined}
          />
          {emailError ? (
            <p id={`${uid}-email-err`} className="text-sm text-critical-fg">
              {emailError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <Checkbox
          id={`${uid}-admin`}
          className="mt-0.5"
          checked={admin}
          disabled={lockOperator}
          aria-describedby={lockOperator ? `${uid}-admin-hint` : undefined}
          onCheckedChange={(on) => setAdmin(on === true)}
        />
        <div className="grid gap-0.5">
          <Label htmlFor={`${uid}-admin`} className="font-normal">
            {a.operator}
          </Label>
          {lockOperator ? (
            <p id={`${uid}-admin-hint`} className="text-xs text-text-secondary">
              {a.ownOperator}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">{a.orgsLegend}</legend>
        {data.orgs.length === 0 ? <p className="text-sm text-text-secondary">{a.noCustomersYet}</p> : null}
        {data.orgs.map((o) => (
          <div key={o.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
            <Checkbox id={`${uid}-org-${o.id}`} checked={orgs.has(o.id)} onCheckedChange={(on) => setOrgs((s) => toggle(s, o.id, on === true))} />
            <Label htmlFor={`${uid}-org-${o.id}`} className="font-normal">
              {o.name} <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">{a.singleLegend}</legend>
        {plants.length === 0 ? <p className="text-sm text-text-secondary">{a.plantsNone}</p> : null}
        {plants.map((p) => {
          const box = `${uid}-p-${p.id}`;
          const owner = via(p.id);
          return (
            <div key={p.id} className="flex items-start gap-3 rounded-md px-1 py-1.5">
              <Checkbox
                id={box}
                className="mt-0.5"
                checked={projects.has(p.id)}
                aria-describedby={owner ? `${box}-hint` : undefined}
                onCheckedChange={(on) => setProjects((s) => toggle(s, p.id, on === true))}
              />
              <div className="grid gap-0.5">
                <Label htmlFor={box} className="font-normal">
                  {p.name ?? p.id} <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                </Label>
                {owner ? (
                  <p id={`${box}-hint`} className="text-xs text-text-secondary">
                    {a.includedVia(orgName(data, owner))}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </fieldset>

      <p aria-live="polite" className="text-sm text-warning-fg">
        {nothing ? a.nothingSelected : ""}
      </p>
      <DialogButtons working={working} submit={creating ? a.create : a.save} onCancel={onDone} />
    </form>
  );
}

/** Let the person set a password: Firebase's own set-password email, or a link to send them yourself. */
function InviteStep({ account, isNew, onDone }: { account: AccountRow; isNew: boolean; onDone: () => void }) {
  const { m, locale } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const email = account.email ?? "";
  const [mail, setMail] = useState<"idle" | "sending" | "sent">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  // After "Create" the form is replaced by this step: its heading takes focus so the change is heard.
  useEffect(() => {
    if (isNew) headingRef.current?.focus();
  }, [isNew]);
  useEffect(() => {
    if (link) linkRef.current?.focus();
  }, [link]);

  async function send() {
    if (mail === "sending") return;
    setMail("sending");
    setFailure(null);
    try {
      await resetPassword(email, locale);
      setMail("sent");
    } catch {
      setMail("idle");
      setFailure(a.errors.failed(""));
    }
  }

  async function makeLink() {
    if (making) return;
    setMaking(true);
    setFailure(null);
    try {
      setLink((await adminAction({ action: "passwordLink", uid: account.uid })).link);
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setMaking(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(a.copied);
    } catch {
      linkRef.current?.select();
      toast.error(a.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle ref={headingRef} tabIndex={-1} className="break-all outline-none">
          {a.inviteTitle(email)}
        </DialogTitle>
        <DialogDescription>{isNew ? a.inviteNew : a.inviteExisting}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure title={a.errSummary} text={failure} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button className="h-10" onClick={() => void send()} aria-disabled={mail === "sending" || !email || undefined}>
          <Mail aria-hidden />
          {mail === "sending" ? a.sending : a.sendEmail}
        </Button>
        <Button variant="outline" className="h-10" onClick={() => void makeLink()} aria-disabled={making || undefined}>
          <Link2 aria-hidden />
          {making ? a.making : a.makeLink}
        </Button>
      </div>
      <p role="status" className="text-sm text-healthy-fg">
        {mail === "sent" ? a.emailSent(email) : ""}
      </p>
      {link ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-link`}>{a.linkLabel}</Label>
          <div className="flex gap-2">
            <Input ref={linkRef} id={`${uid}-link`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-10 font-mono text-xs" aria-describedby={`${uid}-link-hint`} />
            <Button variant="outline" className="h-10 shrink-0" onClick={() => void copy()}>
              <Copy aria-hidden />
              {a.copy}
            </Button>
          </div>
          <p id={`${uid}-link-hint`} className="text-xs text-text-secondary">
            {a.linkHint}
          </p>
        </div>
      ) : null}
      <DialogFooter>
        <Button variant={mail === "sent" || link ? "default" : "outline"} className="h-10" onClick={onDone}>
          {a.done}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DisableAccount({ account, reload, onDone }: { account: AccountRow; reload: () => Promise<void>; onDone: () => void }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const errorText = useErrorText();
  const label = account.email ?? account.uid;
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    setFailure(null);
    try {
      await adminAction({ action: "setDisabled", uid: account.uid, disabled: true });
      toast.success(a.disabled(label));
      await reload();
      onDone();
    } catch (err) {
      setFailure(errorText(err));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="break-all">{a.disableTitle(label)}</DialogTitle>
        <DialogDescription>{a.disableDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      <DialogButtons working={working} submit={a.disableConfirm} onCancel={onDone} danger />
    </form>
  );
}
