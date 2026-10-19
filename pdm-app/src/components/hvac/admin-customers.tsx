"use client";

// Customers tab of the admin page: create, rename and delete customers, and choose their plants.

import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, CircleCheck, Factory, PencilLine, Plus, Trash2, TriangleAlert } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { EmptyState } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ID, NAME_MAX, type AccountRow, type OrgRow, type Overview, type ProjectRow } from "@/lib/access/model";
import { adminAction } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { type AdminData, CellLabel, DialogButtons, FormFailure, orgName, STACKED_TABLE, suggestId, useErrorText, useFailureFocus } from "./admin-common";

/** `fresh`: the plants dialog right after creating the customer, as its next step. */
type CustomerDialog = { kind: "new" } | { kind: "rename" | "delete"; org: OrgRow } | { kind: "plants"; org: OrgRow; fresh?: boolean };

const HEADING = "admin-customers-heading";
/** Where focus goes when the row a dialog came from is gone (a deleted customer). */
const NEW_BUTTON = "admin-new-customer";

export function CustomersPanel({ data, reload }: AdminData) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  // The dialog's content stays while it closes (its title too), so only `open` goes false; `seq` gives
  // each opening a fresh form.
  const [dialog, setDialog] = useState<CustomerDialog | null>(null);
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);
  const show = (d: CustomerDialog) => {
    setDialog(d);
    setSeq((n) => n + 1);
    setOpen(true);
  };
  const focus = useDialogFocus(NEW_BUTTON);
  const known = new Set(data.orgs.map((o) => o.id));
  const unassigned = data.projects.filter((p) => p.org === null || !known.has(p.org));
  const plantsOf = (org: string) => data.projects.filter((p) => p.org === org);
  const accountsOf = (org: string) => data.accounts.filter((acc) => acc.access.orgs.includes(org));
  const close = () => setOpen(false);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={HEADING} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading
          id={HEADING}
          title={a.customersHeading}
          description={a.customersDesc}
          actions={
            <Button id={NEW_BUTTON} onClick={() => show({ kind: "new" })}>
              <Plus aria-hidden />
              {a.newCustomer}
            </Button>
          }
        />
        {data.orgs.length === 0 ? (
          <EmptyState compact icon={Building2} title={a.customersEmptyTitle} description={a.customersEmptyDesc} />
        ) : (
          <div tabIndex={0} role="region" aria-label={a.customersCaption} className="relative overflow-x-auto rounded-md border">
            <table className={cn(STACKED_TABLE, "md:min-w-[720px]")}>
              <caption className="sr-only">{a.customersCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colCustomer}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colPlants}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colAccounts}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.orgs.map((o) => {
                  const plants = plantsOf(o.id);
                  return (
                    <tr key={o.id}>
                      <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                        <p className="font-medium">{o.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{o.id}</p>
                      </th>
                      <td className="px-3 py-2 align-top">
                        <CellLabel>{a.colPlants}</CellLabel>
                        {plants.length ? (
                          <ul className="flex flex-col gap-0.5 max-md:inline">
                            {plants.map((p) => (
                              <li key={p.id}>{p.name ?? p.id}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">{a.noPlants}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">{a.accountCount(accountsOf(o.id).length)}</td>
                      <td className="px-3 py-2 text-right align-top">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => show({ kind: "plants", org: o })}>
                            <Factory aria-hidden />
                            {a.plantsAction}
                            <span className="sr-only"> {o.name}</span>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => show({ kind: "rename", org: o })}>
                            <PencilLine aria-hidden />
                            {a.renameAction}
                            <span className="sr-only"> {o.name}</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="text-critical-fg hover:text-critical-fg" onClick={() => show({ kind: "delete", org: o })}>
                            <Trash2 aria-hidden />
                            {a.deleteAction}
                            <span className="sr-only"> {o.name}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="admin-unassigned-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading id="admin-unassigned-heading" as="h3" title={a.unassignedHeading} description={unassigned.length ? a.unassignedDesc : undefined} />
        {unassigned.length ? (
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <li key={p.id} className="rounded-md border bg-muted px-2 py-1 text-sm">
                {p.name ?? p.id} <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">{a.allAssigned}</p>
        )}
      </section>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent key={seq} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" {...focus.contentProps}>
          {dialog?.kind === "new" || dialog?.kind === "rename" ? (
            <OrgForm
              data={data}
              org={dialog.kind === "rename" ? dialog.org : null}
              reload={reload}
              onDone={close}
              // A new customer goes on to choosing its plants (which can be skipped).
              onCreated={(org) => show({ kind: "plants", org, fresh: true })}
            />
          ) : dialog?.kind === "plants" ? (
            <PlantsForm data={data} org={dialog.org} fresh={dialog.fresh} reload={reload} onDone={close} />
          ) : dialog?.kind === "delete" ? (
            <DeleteOrg
              org={dialog.org}
              plants={plantsOf(dialog.org.id)}
              accounts={accountsOf(dialog.org.id)}
              onMovePlants={() => show({ kind: "plants", org: dialog.org })}
              reload={reload}
              onDone={(deleted) => {
                // The row is gone: focus goes to "New customer" instead.
                if (deleted) focus.returnFocusTo(NEW_BUTTON);
                close();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrgForm({
  data,
  org,
  reload,
  onDone,
  onCreated,
}: {
  data: Overview;
  org: OrgRow | null;
  reload: () => Promise<void>;
  onDone: () => void;
  onCreated: (org: OrgRow) => void;
}) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const creating = org === null;
  const [name, setName] = useState(org?.name ?? "");
  const [id, setId] = useState(org?.id ?? "");
  const [idEdited, setIdEdited] = useState(!creating);
  const [errors, setErrors] = useState<{ name?: string; id?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  const clean = name.trim().replace(/\s+/g, " ");
  const twin = data.orgs.find((o) => o.id !== org?.id && clean && o.name.toLowerCase() === clean.toLowerCase());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    const found: typeof errors = {};
    if (!clean || clean.length > NAME_MAX) found.name = a.errName;
    if (creating && !ID.test(id)) found.id = a.errId;
    else if (creating && data.orgs.some((o) => o.id === id)) found.id = a.errIdTaken;
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return setAttempt((n) => n + 1);
    setWorking(true);
    try {
      const result = await adminAction({ action: "saveOrg", org: id, name: clean, mode: creating ? "create" : "rename" });
      if (result.changed) toast.success(creating ? a.created(clean) : a.renamed(clean));
      await reload();
      if (creating) onCreated({ id, name: clean });
      else onDone();
    } catch (err) {
      setFailure(errorText(err));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(false);
    }
  }

  const field = (f: "name" | "id", hint?: boolean) => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": [errors[f] ? `${uid}-${f}-err` : null, hint ? `${uid}-${f}-hint` : null].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{creating ? a.newCustomerTitle : a.renameTitle(org.name)}</DialogTitle>
        <DialogDescription>{a.customersDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-name`}>{a.customerName}</Label>
        <Input
          id={`${uid}-name`}
          value={name}
          maxLength={NAME_MAX + 20}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            if (!idEdited) setId(suggestId(e.target.value));
          }}
          className="h-10"
          {...field("name", Boolean(twin))}
        />
        {errors.name ? (
          <p id={`${uid}-name-err`} className="text-sm text-critical-fg">
            {errors.name}
          </p>
        ) : null}
        <p id={`${uid}-name-hint`} aria-live="polite" className="text-sm text-warning-fg">
          {twin ? (
            <>
              <TriangleAlert aria-hidden className="mr-1 inline size-4 align-text-bottom" />
              {a.sameName(twin.id)}
            </>
          ) : null}
        </p>
      </div>
      {creating ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-id`}>{a.customerId}</Label>
          <Input
            id={`${uid}-id`}
            value={id}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setIdEdited(true);
              setId(e.target.value.trim().toLowerCase());
            }}
            className="h-10 font-mono"
            {...field("id", true)}
          />
          {errors.id ? (
            <p id={`${uid}-id-err`} className="text-sm text-critical-fg">
              {errors.id}
            </p>
          ) : null}
          <p id={`${uid}-id-hint`} className="text-sm text-text-secondary">
            {a.customerIdHint}
          </p>
        </div>
      ) : null}
      <DialogButtons working={working} submit={creating ? a.create : a.save} onCancel={onDone} />
    </form>
  );
}

function PlantsForm({ data, org, fresh, reload, onDone }: { data: Overview; org: OrgRow; fresh?: boolean; reload: () => Promise<void>; onDone: () => void }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const current = data.projects.filter((p) => p.org === org.id).map((p) => p.id);
  const [checked, setChecked] = useState(() => new Set(current));
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  const plants = [...data.projects].sort((x, y) => (x.name ?? x.id).localeCompare(y.name ?? y.id));
  const owner = (id: string) => data.projects.find((p) => p.id === id)?.org ?? null;
  const moving = [...checked].filter((p) => owner(p) !== null && owner(p) !== org.id).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    const add = [...checked].filter((p) => !current.includes(p));
    const remove = current.filter((p) => !checked.has(p));
    setFailure(null);
    if (!add.length && !remove.length) return setNote(a.noChanges);
    setWorking(true);
    try {
      await adminAction({ action: "assignProjects", org: org.id, add, remove });
      toast.success(a.plantsSaved(org.name));
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
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{a.plantsTitle(org.name)}</DialogTitle>
        <DialogDescription>{a.plantsDesc}</DialogDescription>
      </DialogHeader>
      {fresh ? (
        <div className="flex items-start gap-3 rounded-lg border border-healthy-border bg-healthy-bg p-3 text-sm">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-healthy-fg" />
          <div>
            <p className="font-semibold">{a.created(org.name)}</p>
            <p>{a.createdNext}</p>
          </div>
        </div>
      ) : null}
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      {plants.length === 0 ? (
        <p className="text-sm text-text-secondary">{a.plantsNone}</p>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{a.plantsLegend}</legend>
          {plants.map((p) => {
            const other = p.org !== null && p.org !== org.id ? p.org : null;
            const box = `${uid}-${p.id}`;
            return (
              <div key={p.id} className="flex items-start gap-3 rounded-md px-1 py-1.5">
                <Checkbox
                  id={box}
                  className="mt-0.5"
                  checked={checked.has(p.id)}
                  aria-describedby={other ? `${box}-hint` : undefined}
                  onCheckedChange={(on) => {
                    setNote(null);
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (on === true) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    });
                  }}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={box} className="font-normal">
                    {p.name ?? p.id} <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  </Label>
                  {other ? (
                    <p id={`${box}-hint`} className="text-xs text-warning-fg">
                      {a.withOther(orgName(data, other))}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </fieldset>
      )}
      <p role="status" className="text-sm text-text-secondary">
        {note ?? (moving ? a.moveNote(moving) : "")}
      </p>
      <DialogButtons working={working} submit={a.save} cancel={fresh ? a.skip : undefined} onCancel={onDone} />
    </form>
  );
}

/** Deletes a customer that has nothing left; otherwise names the plants and accounts in the way. */
function DeleteOrg({
  org,
  plants,
  accounts,
  onMovePlants,
  reload,
  onDone,
}: {
  org: OrgRow;
  plants: ProjectRow[];
  accounts: AccountRow[];
  onMovePlants: () => void;
  reload: () => Promise<void>;
  onDone: (deleted: boolean) => void;
}) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  if (plants.length || accounts.length) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{a.cannotDeleteTitle(org.name)}</DialogTitle>
          <DialogDescription>{a.cannotDeleteDesc}</DialogDescription>
        </DialogHeader>
        {plants.length ? (
          <section aria-labelledby={`${uid}-plants`} className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${uid}-plants`} className="font-semibold">
                {a.blockingPlants(plants.length)}
              </h3>
              <Button variant="outline" size="sm" onClick={onMovePlants}>
                <Factory aria-hidden />
                {a.movePlants}
              </Button>
            </div>
            <ul className="list-disc pl-5">
              {plants.map((p) => (
                <li key={p.id}>
                  {p.name ?? p.id} <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {accounts.length ? (
          <section aria-labelledby={`${uid}-accounts`} className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
            <h3 id={`${uid}-accounts`} className="font-semibold">
              {a.blockingAccounts(accounts.length)}
            </h3>
            <ul className="list-disc pl-5 break-all">
              {accounts.map((acc) => (
                <li key={acc.uid}>{acc.email ?? acc.uid}</li>
              ))}
            </ul>
            <p className="text-text-secondary">{a.blockingAccountsHint}</p>
          </section>
        ) : null}
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onDone(false)}>
            {a.close}
          </Button>
        </DialogFooter>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    setFailure(null);
    try {
      await adminAction({ action: "deleteOrg", org: org.id });
      toast.success(a.deleted(org.name));
      await reload();
      onDone(true);
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
        <DialogTitle>{a.deleteTitle(org.name)}</DialogTitle>
        <DialogDescription>{a.deleteDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      <DialogButtons working={working} submit={a.deleteConfirm} onCancel={() => onDone(false)} danger />
    </form>
  );
}

