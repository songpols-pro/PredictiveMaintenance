"use client";

// Plants tab of the admin page: register plants and edit their device registry, the same project file
// as `npm run registry` (lib/access/registry.ts), with JSON import and export of that file, and choose
// the customer that owns each plant. Saving goes through /api/hvac/admin, which checks the file again
// and writes Firestore, the register profiles in TimescaleDB and the audit log.

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BellRing, Cable, Download, Factory, PencilLine, Plus, RadioTower, Trash2, TriangleAlert, Upload } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ID, NAME_MAX, type Overview, type ProjectRow } from "@/lib/access/model";
import {
  DEVICE_LABEL_MAX,
  DEVICE_NAME_MAX,
  DEVICES_MAX,
  KIND_FIELDS,
  LOGO_MAX,
  plantNameOf,
  readRegistryFile,
  registryProblems,
  type RegistryDevice,
  type RegistryFile,
  type RegistryProblemCode,
  type RegistryView,
} from "@/lib/access/registry";
import { adminAction, loadModels, loadRegistry } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { DEVICE_KINDS, type DeviceKind } from "@/lib/telemetry/catalog";
import { DEVICE_ID } from "@/lib/telemetry/contract";
import type { ModelSummary } from "@/lib/telemetry/register-map";
import { PlantModbus } from "./admin-modbus";
import { PlantNotify } from "./admin-notify";
import { type AdminData, CellLabel, DialogButtons, FormFailure, orgName, STACKED_TABLE, suggestId, useErrorText, useFailureFocus } from "./admin-common";

type PlantDialog = { kind: "new"; id: string | null } | { kind: "devices" | "modbus" | "notify"; plant: ProjectRow };

const HEADING = "admin-plants-heading";
const NEW_BUTTON = "admin-new-plant";

export function PlantsPanel({ data, reload }: AdminData) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  // As on the other tabs: the content stays while the dialog closes, `seq` gives each opening a fresh form.
  const [dialog, setDialog] = useState<PlantDialog | null>(null);
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);
  const dirtyRef = useRef(false);
  const show = (d: PlantDialog) => {
    dirtyRef.current = false;
    setDialog(d);
    setSeq((n) => n + 1);
    setOpen(true);
  };
  const focus = useDialogFocus(NEW_BUTTON);
  const close = () => setOpen(false);
  /** Escape, the close button and Cancel ask before unsaved changes are lost. */
  const requestClose = () => {
    if (dirtyRef.current && !window.confirm(dialog?.kind === "modbus" ? a.modbus.discardConfirm : a.discardConfirm)) return;
    close();
  };
  const plants = [...data.projects].sort((x, y) => (x.name ?? x.id).localeCompare(y.name ?? y.id));

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={HEADING} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <SectionHeading
          id={HEADING}
          title={a.plantsHeading}
          description={a.plantsHeadingDesc}
          actions={
            <Button id={NEW_BUTTON} onClick={() => show({ kind: "new", id: null })}>
              <Plus aria-hidden />
              {a.newPlant}
            </Button>
          }
        />
        {plants.length === 0 ? (
          <EmptyState compact icon={Factory} title={a.plantsEmptyTitle} description={a.plantsEmptyDesc} />
        ) : (
          <div tabIndex={0} role="region" aria-label={a.plantsCaption} className="relative overflow-x-auto rounded-md border">
            <table className={cn(STACKED_TABLE, "md:min-w-[640px]")}>
              <caption className="sr-only">{a.plantsCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colPlant}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colCustomer}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {a.colDevices}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {plants.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                      <p className="font-medium">{p.name ?? p.id}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
                    </th>
                    <td className="px-3 py-2 align-top">
                      <CellLabel>{a.colCustomer}</CellLabel>
                      {p.org ? orgName(data, p.org) : <span className="text-text-secondary">{a.noCustomer}</span>}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <CellLabel>{a.colDevices}</CellLabel>
                      {a.deviceCount(p.devices)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => show({ kind: "devices", plant: p })}>
                          <PencilLine aria-hidden />
                          {a.devicesAction}
                          <span className="sr-only"> {p.name ?? p.id}</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => show({ kind: "modbus", plant: p })}>
                          <Cable aria-hidden />
                          {a.modbus.action}
                          <span className="sr-only"> {p.name ?? p.id}</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => show({ kind: "notify", plant: p })}>
                          <BellRing aria-hidden />
                          {a.notify.action}
                          <span className="sr-only"> {p.name ?? p.id}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.unregistered.length ? (
        <section aria-labelledby="admin-unregistered-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <SectionHeading id="admin-unregistered-heading" as="h3" title={a.unregisteredHeading} description={a.unregisteredDesc} />
          <ul className="flex flex-wrap gap-2">
            {data.unregistered.map((id) => (
              <li key={id} className="flex items-center gap-2 rounded-md border bg-muted py-1 pr-1 pl-2 text-sm">
                <RadioTower aria-hidden className="size-4 text-text-secondary" />
                <span className="font-mono">{id}</span>
                <Button variant="outline" size="sm" onClick={() => show({ kind: "new", id })}>
                  {a.registerAction}
                  <span className="sr-only"> {id}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent key={seq} className={cn("max-h-[92dvh] overflow-y-auto", dialog?.kind === "notify" ? "sm:max-w-2xl" : "sm:max-w-6xl")} {...focus.contentProps}>
          {dialog?.kind === "new" ? (
            dialog.id === null ? (
              <RegistryForm data={data} view={null} presetId={null} reload={reload} onDone={close} onCancel={requestClose} dirtyRef={dirtyRef} />
            ) : (
              <RegistryLoader
                data={data}
                project={dialog.id}
                unregistered
                title={a.registerTitle(dialog.id)}
                reload={reload}
                onDone={close}
                onCancel={requestClose}
                dirtyRef={dirtyRef}
              />
            )
          ) : dialog?.kind === "devices" ? (
            <RegistryLoader
              data={data}
              project={dialog.plant.id}
              unregistered={false}
              title={a.devicesTitle(dialog.plant.name ?? dialog.plant.id)}
              reload={reload}
              onDone={close}
              onCancel={requestClose}
              dirtyRef={dirtyRef}
            />
          ) : dialog?.kind === "modbus" ? (
            <PlantModbus plant={dialog.plant} onCancel={requestClose} onChanged={reload} dirtyRef={dirtyRef} />
          ) : dialog?.kind === "notify" ? (
            <PlantNotify plant={dialog.plant} onCancel={requestClose} onDone={close} onChanged={reload} dirtyRef={dirtyRef} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface EditorProps {
  data: Overview;
  reload: () => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
  /** Whether the form has changes that are not saved, for closing the dialog. */
  dirtyRef: React.RefObject<boolean>;
}

/**
 * Loads a plant's registry (with register profiles from TimescaleDB), then shows the editor. For a
 * project that sends data but is not registered yet (`unregistered`) it loads the devices that report,
 * so registering the plant can start from them.
 */
function RegistryLoader({ project, unregistered, title, ...props }: EditorProps & { project: string; unregistered: boolean; title: string }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const errorText = useErrorText();
  const [state, setState] = useState<{ view?: RegistryView; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadRegistry(project, unregistered).then(
      (view) => !cancelled && setState({ view }),
      (error: Error) => !cancelled && setState({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, [project, unregistered, attempt]);

  const again = () => {
    setState({});
    setAttempt((n) => n + 1);
  };

  if (state.view) return <RegistryForm key={attempt} {...props} view={state.view} presetId={unregistered ? project : null} onReload={again} />;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{unregistered ? a.newPlantDesc : a.editorDesc}</DialogDescription>
      </DialogHeader>
      {state.error ? (
        <ErrorState compact title={a.registryLoadError} error={new Error(errorText(state.error))} onRetry={again} />
      ) : (
        <LoadingBlock label={a.loadingRegistry} lines={6} />
      )}
    </>
  );
}

/** One row of the device table, as typed (numbers stay text until saved). */
interface Row {
  key: number;
  id: string;
  kind: string;
  name: string;
  label: string;
  profile: string;
  capacity: string;
  meterFor: string;
  role: string;
}

type Field = "id" | "kind" | "name" | "label" | "profile" | "capacity" | "meterFor" | "role";

let rowKeys = 0;
const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const blankRow = (id = ""): Row => ({ key: ++rowKeys, id, kind: "", name: "", label: "", profile: "", capacity: "", meterFor: "", role: "" });

const rowsOf = (devices: RegistryDevice[]): Row[] =>
  devices.map((d) => ({
    key: ++rowKeys,
    id: text(d.id),
    kind: text(d.kind),
    name: text(d.name),
    label: text(d.label),
    profile: text(d.profile),
    capacity: text(d.capacityTon),
    meterFor: text(d.meterFor),
    role: text(d.role),
  }));

/** The project file of the form: each device with the fields its kind uses. */
function fileOf(project: string, name: string, logo: string, rows: Row[]): RegistryFile {
  return {
    project,
    ...(name.trim() ? { name: name.trim().replace(/\s+/g, " ") } : {}),
    ...(logo.trim() ? { ownerLogo: logo.trim() } : {}),
    devices: rows.map((r) => {
      const fields: string[] = KIND_FIELDS[r.kind as DeviceKind] ?? [];
      return {
        id: r.id.trim(),
        kind: r.kind,
        ...(r.name.trim() ? { name: r.name.trim() } : {}),
        ...(r.label.trim() ? { label: r.label.trim() } : {}),
        ...(r.profile ? { profile: r.profile } : {}),
        ...(fields.includes("capacityTon") && r.capacity.trim() ? { capacityTon: Number(r.capacity.trim()) } : {}),
        ...(fields.includes("meterFor") && r.meterFor ? { meterFor: r.meterFor } : {}),
        ...(fields.includes("role") && r.role ? { role: r.role } : {}),
      };
    }),
  };
}

const FIELD_OF: Partial<Record<RegistryProblemCode, Field>> = {
  "device-id": "id",
  kind: "kind",
  "device-name": "name",
  label: "label",
  profile: "profile",
  "profile-kind": "profile",
  capacity: "capacity",
  role: "role",
  "meter-for": "meterFor",
};

/** The owner select's value for "no customer" (not a valid customer id). */
const NO_OWNER = "-";

const modelName = (m: ModelSummary | undefined, id: string) => (m ? `${m.vendor} ${m.model}` : id);
/** Vendor and first word of the model, short enough for the closed select ("Carrier 30RAM"). */
const modelShort = (m: ModelSummary | undefined, id: string) => (m ? `${m.vendor} ${m.model.split(" ")[0]}` : id);

function RegistryForm({
  data,
  view,
  presetId,
  reload,
  onDone,
  onCancel,
  dirtyRef,
  onReload,
}: EditorProps & { view: RegistryView | null; presetId: string | null; onReload?: () => void }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const uid = useId();
  const errorText = useErrorText();
  // A view of a plant that is not registered yet only brings the devices that send data.
  const creating = view === null || !view.registered;
  const [initial] = useState<RegistryFile>(() => view?.file ?? { project: presetId ?? "", devices: [] });
  const [id, setId] = useState(initial.project);
  const [idEdited, setIdEdited] = useState(!creating || presetId !== null);
  const [name, setName] = useState(initial.name ?? "");
  const [logo, setLogo] = useState(initial.ownerLogo ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial.devices));
  // The customer that owns the plant: saved with assignProjects after the registry.
  const [initialOwner] = useState(() => (creating ? "" : (data.projects.find((p) => p.id === initial.project)?.org ?? "")));
  const [owner, setOwner] = useState(initialOwner);
  const orgs = [...data.orgs].sort((x, y) => x.name.localeCompare(y.name));
  const [baseline] = useState(() => JSON.stringify(fileOf(initial.project, initial.name ?? "", initial.ownerLogo ?? "", rowsOf(initial.devices))));
  // Device models a device can use (from the database): with the registry, or loaded for a new plant.
  const [models, setModels] = useState<ModelSummary[]>(view?.models ?? []);
  useEffect(() => {
    if (view) return;
    let cancelled = false;
    loadModels().then(
      (list) => !cancelled && setModels(list),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [view]);
  const modelKinds = Object.fromEntries(models.map((x) => [x.id, { kind: x.kind }]));
  const modelOf = (id: string) => models.find((x) => x.id === id);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [fileNote, setFileNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const focusAfter = useRef<string | null>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);

  // Focus moves to a control of a row once it is on the page (after adding, moving or removing rows).
  useEffect(() => {
    if (!focusAfter.current) return;
    document.getElementById(focusAfter.current)?.focus();
    focusAfter.current = null;
  });

  const project = id.trim();
  const file = fileOf(project, name, logo, rows);
  const registryDirty = JSON.stringify(file) !== baseline;
  const ownerChanged = owner !== initialOwner;
  const isDirty = registryDirty || ownerChanged;
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [dirtyRef, isDirty]);

  // Problems are worked out on every change; they show from the first save on.
  const cleanName = name.trim().replace(/\s+/g, " ");
  const problems = registryProblems(file, modelKinds);
  const plantErrors = {
    name: !cleanName || cleanName.length > NAME_MAX ? a.errPlantName : undefined,
    id: creating ? (!ID.test(project) ? a.errId : data.projects.some((p) => p.id === project) ? a.errPlantIdTaken : undefined) : undefined,
    logo: problems.some((p) => p.code === "owner-logo") ? a.errLogo : undefined,
  };
  const rowErrors = new Map<number, Partial<Record<Field, string>>>();
  for (const p of problems) {
    const field = p.index !== undefined ? FIELD_OF[p.code] : undefined;
    if (field === undefined || p.index === undefined) continue;
    const row = rows[p.index];
    const message: Record<Field, string> = {
      id: DEVICE_ID.test(row.id.trim()) ? a.errDeviceIdTaken : a.errDeviceId,
      kind: a.errKind,
      name: a.errDeviceName,
      label: a.errLabel,
      profile: a.errProfile,
      capacity: a.errCapacity,
      meterFor: a.errMeterFor,
      role: a.errRole,
    };
    rowErrors.set(row.key, { ...rowErrors.get(row.key), [field]: message[field] });
  }
  const tooMany = problems.some((p) => p.code === "devices");
  const errorCount =
    Object.values(plantErrors).filter(Boolean).length + [...rowErrors.values()].reduce((n, e) => n + Object.keys(e).length, 0) + (tooMany ? 1 : 0);
  const showErrors = attempt > 0;
  const blocked = view !== null && view.registered && !view.profiles;

  const label = (r: Row, i: number) => a.rowName(i + 1, r.id.trim());
  const rid = (r: Row, field: string) => `${uid}-r${r.key}-${field}`;
  const update = (key: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  function setDeviceId(r: Row, value: string) {
    const before = r.id.trim();
    const after = value.trim();
    // Meters keep measuring a chiller whose id is being retyped.
    setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, id: value } : r.kind === "chiller" && before && x.meterFor === before ? { ...x, meterFor: after } : x)));
  }

  function setKind(r: Row, kind: string) {
    const keepProfile = !r.profile || modelOf(r.profile)?.kind === kind;
    update(r.key, { kind, ...(keepProfile ? {} : { profile: "" }) });
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const r = rows[index];
    const next = [...rows];
    next.splice(index, 1);
    next.splice(to, 0, r);
    setRows(next);
    focusAfter.current = rid(r, by < 0 ? "up" : "down");
    setAnnouncement(a.moved(label(r, index), to + 1, rows.length));
  }

  function remove(index: number) {
    const r = rows[index];
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    const neighbour = next[index] ?? next[index - 1];
    focusAfter.current = neighbour ? rid(neighbour, "remove") : `${uid}-add`;
    setAnnouncement(a.removedDevice(label(r, index)));
  }

  function add(id = "") {
    const r = blankRow(id);
    setRows((rs) => [...rs, r]);
    focusAfter.current = id ? rid(r, "kind") : rid(r, "id");
    setAnnouncement(a.addedDevice(rows.length + 1));
  }

  /** Every device that sends data and is not in the list yet, as far as the list has room. */
  function addEverySeen() {
    const added = seen.slice(0, Math.max(0, DEVICES_MAX - rows.length)).map((s) => blankRow(s.device));
    if (!added.length) return;
    setRows((rs) => [...rs, ...added]);
    focusAfter.current = rid(added[0], "kind");
    setAnnouncement(a.addedSeen(added.length));
  }

  async function importFile(f: File) {
    let parsed: RegistryFile | null = null;
    try {
      parsed = readRegistryFile(JSON.parse(await f.text()));
    } catch {
      parsed = null;
    }
    if (!parsed) return setFileNote({ text: a.importFailed, bad: true });
    // A new plant takes the file's project id, unless it came with one (a project that sends data) or the id is taken.
    const fileId = typeof parsed.project === "string" ? parsed.project : "";
    const takeId = creating && presetId === null && ID.test(fileId) && !data.projects.some((p) => p.id === fileId);
    if (takeId) {
      setId(fileId);
      setIdEdited(true);
    }
    if (typeof parsed.name === "string") setName(parsed.name);
    setLogo(typeof parsed.ownerLogo === "string" ? parsed.ownerLogo : "");
    setRows(rowsOf(parsed.devices));
    const note = a.imported(parsed.devices.length);
    setFileNote({ text: fileId && !takeId && fileId !== project ? `${note} ${a.importedOther(fileId)}` : note });
  }

  function exportFile() {
    const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${ID.test(project) ? project : "plant"}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setFailure(null);
    // Only the customer changed: the device list is not saved again (nor refused when profiles are unknown).
    const saveList = creating || registryDirty || !ownerChanged;
    if (blocked && saveList) {
      setFailure(a.profilesUnavailableDesc);
      return setAttempt((n) => n + 1);
    }
    if (errorCount) return setAttempt((n) => n + 1);
    setWorking(true);
    try {
      const result = saveList ? await adminAction({ action: "saveRegistry", mode: creating ? "create" : "edit", file, version: view?.version ?? null }) : null;
      const plant = plantNameOf(file);
      let ownerError: unknown = null;
      if (ownerChanged) {
        try {
          await adminAction(
            owner ? { action: "assignProjects", org: owner, add: [project], remove: [] } : { action: "assignProjects", org: initialOwner, add: [], remove: [project] },
          );
        } catch (err) {
          // Without a saved list the form stays open with the refusal; a saved (maybe new) plant closes.
          if (!result) throw err;
          ownerError = err;
        }
      }
      if (ownerError) toast.error(a.ownerSaveFailed(plant, errorText(ownerError)));
      else toast.success(result?.created ? a.plantCreated(plant) : result?.changed || ownerChanged ? a.registrySaved(plant) : a.noChanges);
      dirtyRef.current = false;
      await reload();
      onDone();
    } catch (err) {
      setFailure(errorText(err));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(false);
    }
  }

  const described = (base: string, error: string | undefined, hint?: boolean) => ({
    "aria-invalid": showErrors && error ? true : undefined,
    "aria-describedby": [showErrors && error ? `${base}-err` : null, hint ? `${base}-hint` : null].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (base: string, error: string | undefined) =>
    showErrors && error ? (
      <p id={`${base}-err`} className="mt-1 text-xs text-critical-fg">
        {error}
      </p>
    ) : null;

  const chillers = [...new Set(rows.filter((r) => r.kind === "chiller" && r.id.trim()).map((r) => r.id.trim()))];
  const seen = (view?.seen ?? []).filter((s) => !rows.some((r) => r.id.trim() === s.device));
  const title = !creating ? a.devicesTitle(initial.name ?? initial.project) : presetId ? a.registerTitle(presetId) : a.newPlantTitle;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{creating ? a.newPlantDesc : a.editorDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      {blocked ? (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-fg" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{a.profilesUnavailableTitle}</p>
            <p>{a.profilesUnavailableDesc}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            {a.retry}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-name`}>{a.plantName}</Label>
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
            {...described(`${uid}-name`, plantErrors.name, true)}
          />
          {fieldError(`${uid}-name`, plantErrors.name)}
          <p id={`${uid}-name-hint`} className="text-xs text-text-secondary">
            {a.plantNameHint}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-id`}>{a.plantId}</Label>
          {creating ? (
            <>
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
                {...described(`${uid}-id`, plantErrors.id, true)}
              />
              {fieldError(`${uid}-id`, plantErrors.id)}
              <p id={`${uid}-id-hint`} className="text-xs text-text-secondary">
                {a.plantIdHint}
              </p>
            </>
          ) : (
            <Input id={`${uid}-id`} value={id} readOnly className="h-10 bg-muted font-mono" />
          )}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-owner`}>{a.plantOwner}</Label>
          <Select value={owner || NO_OWNER} onValueChange={(v) => setOwner(v === NO_OWNER ? "" : v)}>
            <SelectTrigger id={`${uid}-owner`} className="w-full data-[size=default]:h-10" aria-describedby={`${uid}-owner-hint`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_OWNER}>{a.plantOwnerNone}</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
              {owner && !orgs.some((o) => o.id === owner) ? <SelectItem value={owner}>{owner}</SelectItem> : null}
            </SelectContent>
          </Select>
          <p id={`${uid}-owner-hint`} className="text-xs text-text-secondary">
            {orgs.length ? a.plantOwnerHint : a.plantOwnerNoOrgs}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${uid}-logo`}>{a.ownerLogo}</Label>
          <Input
            id={`${uid}-logo`}
            value={logo}
            maxLength={LOGO_MAX}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            onChange={(e) => setLogo(e.target.value)}
            className="h-10 font-mono"
            {...described(`${uid}-logo`, plantErrors.logo, true)}
          />
          {fieldError(`${uid}-logo`, plantErrors.logo)}
          <p id={`${uid}-logo-hint`} className="text-xs text-text-secondary">
            {a.ownerLogoHint}
          </p>
        </div>
      </div>

      <section aria-labelledby={`${uid}-devices`} className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 id={`${uid}-devices`} className="text-base font-semibold">
            {a.devicesHeading} <span className="font-normal text-text-secondary">({rows.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
            <Button type="button" variant="ghost" size="sm" aria-describedby={`${uid}-file-hint`} onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden />
              {a.importJson}
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-describedby={`${uid}-file-hint`} onClick={exportFile}>
              <Download aria-hidden />
              {a.exportJson}
            </Button>
          </div>
        </div>
        <p id={`${uid}-file-hint`} className="text-xs text-text-secondary">
          {a.fileHint}
        </p>
        <p role="status" className={fileNote?.bad ? "text-sm text-critical-fg" : "text-sm"}>
          {fileNote?.text ?? ""}
        </p>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-text-secondary">{a.devicesEmpty}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={a.devicesCaption} className="relative overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1080px] text-sm">
              <caption className="sr-only">{a.devicesCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colOrder}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colDeviceId}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colKind}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colName}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colLabel}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colDetails}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {a.colProfile}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => {
                  const err = rowErrors.get(r.key) ?? {};
                  const name = label(r, i);
                  const fields: string[] = KIND_FIELDS[r.kind as DeviceKind] ?? [];
                  const profiles = models.filter((x) => x.kind === r.kind);
                  const known = (DEVICE_KINDS as string[]).includes(r.kind);
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-0.5">
                          <span className="w-7 pr-1 text-right tabular text-text-secondary">{i + 1}</span>
                          <Button type="button" variant="ghost" size="icon" id={rid(r, "up")} aria-disabled={i === 0 || undefined} onClick={() => move(i, -1)}>
                            <ArrowUp aria-hidden />
                            <span className="sr-only">{a.moveUp(name)}</span>
                          </Button>
                          <Button type="button" variant="ghost" size="icon" id={rid(r, "down")} aria-disabled={i === rows.length - 1 || undefined} onClick={() => move(i, 1)}>
                            <ArrowDown aria-hidden />
                            <span className="sr-only">{a.moveDown(name)}</span>
                          </Button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <label htmlFor={rid(r, "id")} className="sr-only">
                          {a.colDeviceId}, {a.rowName(i + 1, "")}
                        </label>
                        <Input
                          id={rid(r, "id")}
                          value={r.id}
                          maxLength={40}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => setDeviceId(r, e.target.value)}
                          className="h-9 w-32 font-mono"
                          {...described(rid(r, "id"), err.id)}
                        />
                        {fieldError(rid(r, "id"), err.id)}
                      </td>
                      <td className="px-2 py-2">
                        <label htmlFor={rid(r, "kind")} className="sr-only">
                          {a.colKind}, {name}
                        </label>
                        <Select value={r.kind} onValueChange={(v) => setKind(r, v)}>
                          <SelectTrigger id={rid(r, "kind")} className="w-36 data-[size=default]:h-9" {...described(rid(r, "kind"), err.kind)}>
                            <SelectValue placeholder={a.chooseKind} />
                          </SelectTrigger>
                          <SelectContent>
                            {DEVICE_KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {a.kinds[k] ?? k}
                              </SelectItem>
                            ))}
                            {r.kind && !known ? <SelectItem value={r.kind}>{r.kind}</SelectItem> : null}
                          </SelectContent>
                        </Select>
                        {fieldError(rid(r, "kind"), err.kind)}
                      </td>
                      <td className="px-2 py-2">
                        <label htmlFor={rid(r, "name")} className="sr-only">
                          {a.colName}, {name}
                        </label>
                        <Input
                          id={rid(r, "name")}
                          value={r.name}
                          placeholder={r.id.trim()}
                          maxLength={DEVICE_NAME_MAX + 10}
                          autoComplete="off"
                          onChange={(e) => update(r.key, { name: e.target.value })}
                          className="h-9 w-40"
                          {...described(rid(r, "name"), err.name)}
                        />
                        {fieldError(rid(r, "name"), err.name)}
                      </td>
                      <td className="px-2 py-2">
                        <label htmlFor={rid(r, "label")} className="sr-only">
                          {a.colLabel}, {name}
                        </label>
                        <Input
                          id={rid(r, "label")}
                          value={r.label}
                          maxLength={DEVICE_LABEL_MAX + 10}
                          autoComplete="off"
                          onChange={(e) => update(r.key, { label: e.target.value })}
                          className="h-9 w-28"
                          {...described(rid(r, "label"), err.label)}
                        />
                        {fieldError(rid(r, "label"), err.label)}
                      </td>
                      <td className="px-2 py-2">
                        {fields.includes("capacityTon") ? (
                          <>
                            <label htmlFor={rid(r, "capacity")} className="block text-xs text-text-secondary">
                              {a.capacity}
                              <span className="sr-only">, {name}</span>
                            </label>
                            <Input
                              id={rid(r, "capacity")}
                              value={r.capacity}
                              inputMode="decimal"
                              autoComplete="off"
                              onChange={(e) => update(r.key, { capacity: e.target.value })}
                              className="h-9 w-28 tabular"
                              {...described(rid(r, "capacity"), err.capacity)}
                            />
                            {fieldError(rid(r, "capacity"), err.capacity)}
                          </>
                        ) : fields.includes("meterFor") ? (
                          <>
                            <label htmlFor={rid(r, "meterFor")} className="block text-xs text-text-secondary">
                              {a.meterFor}
                              <span className="sr-only">, {name}</span>
                            </label>
                            {chillers.length || r.meterFor ? (
                              <Select value={r.meterFor} onValueChange={(v) => update(r.key, { meterFor: v })}>
                                <SelectTrigger id={rid(r, "meterFor")} className="w-36 data-[size=default]:h-9" {...described(rid(r, "meterFor"), err.meterFor)}>
                                  <SelectValue placeholder={a.chooseChiller} />
                                </SelectTrigger>
                                <SelectContent>
                                  {chillers.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                  {r.meterFor && !chillers.includes(r.meterFor) ? <SelectItem value={r.meterFor}>{r.meterFor}</SelectItem> : null}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p id={rid(r, "meterFor")} className="py-2 text-xs text-text-secondary">
                                {a.noChillers}
                              </p>
                            )}
                            {fieldError(rid(r, "meterFor"), err.meterFor)}
                          </>
                        ) : fields.includes("role") ? (
                          <>
                            <label htmlFor={rid(r, "role")} className="block text-xs text-text-secondary">
                              {a.role}
                              <span className="sr-only">, {name}</span>
                            </label>
                            <Select value={r.role || "auto"} onValueChange={(v) => update(r.key, { role: v === "auto" ? "" : v })}>
                              <SelectTrigger id={rid(r, "role")} className="w-36 data-[size=default]:h-9" {...described(rid(r, "role"), err.role)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">{a.roleAuto}</SelectItem>
                                <SelectItem value="duty">{a.roles.duty}</SelectItem>
                                <SelectItem value="standby">{a.roles.standby}</SelectItem>
                                {r.role && r.role !== "duty" && r.role !== "standby" ? <SelectItem value={r.role}>{r.role}</SelectItem> : null}
                              </SelectContent>
                            </Select>
                            {fieldError(rid(r, "role"), err.role)}
                          </>
                        ) : (
                          <span className="inline-block py-2 text-text-secondary">
                            <span aria-hidden>—</span>
                            <span className="sr-only">{a.noDetails}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {profiles.length || r.profile ? (
                          <>
                            <label htmlFor={rid(r, "profile")} className="sr-only">
                              {a.colProfile}, {name}
                            </label>
                            <Select value={r.profile || "none"} onValueChange={(v) => update(r.key, { profile: v === "none" ? "" : v })}>
                              <SelectTrigger id={rid(r, "profile")} className="w-48 data-[size=default]:h-9" {...described(rid(r, "profile"), err.profile)}>
                                <SelectValue>{r.profile ? modelShort(modelOf(r.profile), r.profile) : a.noProfile}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{a.noProfile}</SelectItem>
                                {profiles.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {modelName(p, p.id)}
                                  </SelectItem>
                                ))}
                                {r.profile && !profiles.some((p) => p.id === r.profile) ? <SelectItem value={r.profile}>{modelName(modelOf(r.profile), r.profile)}</SelectItem> : null}
                              </SelectContent>
                            </Select>
                            {fieldError(rid(r, "profile"), err.profile)}
                          </>
                        ) : (
                          <span className="inline-block py-2 text-text-secondary">{a.noProfile}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button type="button" variant="ghost" size="icon" id={rid(r, "remove")} className="text-critical-fg hover:text-critical-fg" onClick={() => remove(i)}>
                          <Trash2 aria-hidden />
                          <span className="sr-only">{a.removeDevice(name)}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {showErrors && tooMany ? <p className="text-sm text-critical-fg">{a.errTooMany(DEVICES_MAX)}</p> : null}
        <div>
          <Button type="button" variant="outline" id={`${uid}-add`} aria-disabled={rows.length >= DEVICES_MAX || undefined} onClick={() => rows.length < DEVICES_MAX && add()}>
            <Plus aria-hidden />
            {a.addDevice}
          </Button>
        </div>

        {seen.length ? (
          <section aria-labelledby={`${uid}-seen`} className="flex flex-col gap-2 rounded-md border bg-muted/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id={`${uid}-seen`} className="text-sm font-semibold">
                {a.seenHeading} <span className="font-normal text-text-secondary">({seen.length})</span>
              </h4>
              {seen.length > 1 ? (
                <Button type="button" variant="outline" size="sm" aria-disabled={rows.length >= DEVICES_MAX || undefined} onClick={addEverySeen}>
                  <Plus aria-hidden />
                  {a.addAllSeen(seen.length)}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-text-secondary">{a.seenDesc}</p>
            <ul className="flex flex-wrap gap-2">
              {seen.map((s) => (
                <li key={s.device} className="flex items-center gap-2 rounded-md border bg-card py-1 pr-1 pl-2 text-sm">
                  <span className="font-mono">{s.device}</span>
                  <span className="text-xs text-text-secondary">{a.seenVia(s.gateway)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => add(s.device)}>
                    <Plus aria-hidden />
                    {a.addSeen}
                    <span className="sr-only"> {s.device}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>

      <p role="status" className="text-sm text-text-secondary">
        {showErrors && errorCount ? a.errInList(errorCount) : ""}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <DialogButtons working={working} submit={creating ? a.createPlant : a.save} onCancel={onCancel} />
    </form>
  );
}
