"use client";

// Device models tab of the admin page: each model's register map (how a PLC reads it over Modbus) and the
// meaning of its fault bits, kept in TimescaleDB (lib/telemetry/register-map.ts). Add, edit, import and
// export (JSON) and delete models; saving goes through /api/hvac/admin, which checks the model again.

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Cpu, Download, PencilLine, Plus, Trash2, Upload } from "lucide-react";
import { SectionHeading } from "@/components/pdm/page-header";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/pdm/states";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ModelView } from "@/lib/access/models";
import { adminAction, loadModel, loadModels } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { DEVICE_KINDS } from "@/lib/telemetry/catalog";
import {
  ADDRESSINGS,
  BAUDS,
  catalogPoints,
  DATA_TYPES,
  FUNCTION_CODES,
  MODEL_TEXT_MAX,
  modelProblems,
  PARITIES,
  readModelFile,
  REGISTERS_MAX,
  FAULT_BITS_MAX,
  SEVERITIES,
  WORD_ORDERS,
  type ModelDef,
  type ModelProblem,
  type ModelSummary,
} from "@/lib/telemetry/register-map";
import { CellLabel, DialogButtons, fieldError, fieldProps, FormFailure, STACKED_TABLE, useErrorText, useFailureFocus, useFocusAfter } from "./admin-common";

const HEADING = "admin-models-heading";
const NEW_BUTTON = "admin-new-model";

type ModelDialog = { kind: "new" } | { kind: "edit" | "delete"; model: ModelSummary };

/** `onChanged` loads the page's overview again, so the activity log shows the change. */
export function ModelsPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const { m, f } = useI18n();
  const a = m.hvac.admin;
  const t = a.models;
  const errorText = useErrorText();
  const [state, setState] = useState<{ list?: ModelSummary[]; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<ModelDialog | null>(null);
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);
  const dirtyRef = useRef(false);
  const focus = useDialogFocus(NEW_BUTTON);

  useEffect(() => {
    let cancelled = false;
    loadModels().then(
      (list) => !cancelled && setState({ list }),
      (error: Error) => !cancelled && setState((s) => ({ list: s.list, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = async () => {
    void onChanged();
    try {
      setState({ list: await loadModels() });
    } catch (error) {
      setState((s) => ({ list: s.list, error: error as Error }));
    }
  };
  const show = (d: ModelDialog) => {
    dirtyRef.current = false;
    setDialog(d);
    setSeq((n) => n + 1);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const requestClose = () => {
    if (dirtyRef.current && !window.confirm(t.discardConfirm)) return;
    close();
  };
  const name = (x: ModelSummary) => `${x.vendor} ${x.model}`;

  return (
    <section aria-labelledby={HEADING} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading
        id={HEADING}
        title={t.heading}
        description={t.desc}
        actions={
          <Button id={NEW_BUTTON} onClick={() => show({ kind: "new" })}>
            <Plus aria-hidden />
            {t.newModel}
          </Button>
        }
      />
      {!state.list ? (
        state.error ? (
          <ErrorState compact title={t.loadError} error={new Error(errorText(state.error))} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <LoadingBlock label={t.loading} lines={4} />
        )
      ) : state.list.length === 0 ? (
        <EmptyState compact icon={Cpu} title={t.emptyTitle} description={t.emptyDesc} />
      ) : (
        <div tabIndex={0} role="region" aria-label={t.caption} className="relative overflow-x-auto rounded-md border">
          <table className={cn(STACKED_TABLE, "md:min-w-[760px]")}>
            <caption className="sr-only">{t.caption}</caption>
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.colModel}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.colKind}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.colRegisters}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.colFaultBits}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t.colDevices}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t.colUpdated}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  <span className="sr-only">{a.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {state.list.map((x) => (
                <tr key={x.id}>
                  <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                    <p className="font-medium">{name(x)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{x.id}</p>
                  </th>
                  <td className="px-3 py-2 align-top">
                    <CellLabel>{t.colKind}</CellLabel>
                    {a.kinds[x.kind] ?? x.kind}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular">
                    <CellLabel>{t.colRegisters}</CellLabel>
                    {x.registers}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular">
                    <CellLabel>{t.colFaultBits}</CellLabel>
                    {x.faultBits}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular">
                    <CellLabel>{t.colDevices}</CellLabel>
                    {x.devices}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <p className="tabular">
                      <CellLabel>{t.colUpdated}</CellLabel>
                      {x.updatedAt ? f.dateTime(x.updatedAt) : "—"}
                    </p>
                    <p className="text-xs break-all text-text-secondary">{x.updatedBy === "seed" ? t.fromCode : x.updatedBy}</p>
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => show({ kind: "edit", model: x })}>
                        <PencilLine aria-hidden />
                        {t.editAction}
                        <span className="sr-only"> {name(x)}</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="text-critical-fg hover:text-critical-fg" onClick={() => show({ kind: "delete", model: x })}>
                        <Trash2 aria-hidden />
                        {t.deleteAction}
                        <span className="sr-only"> {name(x)}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent
          key={seq}
          className={dialog?.kind === "delete" ? "max-h-[90dvh] overflow-y-auto sm:max-w-lg" : "max-h-[92dvh] overflow-y-auto sm:max-w-6xl"}
          {...focus.contentProps}
        >
          {dialog?.kind === "new" ? (
            <ModelForm view={null} known={state.list ?? []} reload={reload} onDone={close} onCancel={requestClose} dirtyRef={dirtyRef} />
          ) : dialog?.kind === "edit" ? (
            <ModelLoader summary={dialog.model} known={state.list ?? []} reload={reload} onDone={close} onCancel={requestClose} dirtyRef={dirtyRef} />
          ) : dialog?.kind === "delete" ? (
            <DeleteModel
              model={dialog.model}
              reload={reload}
              onDone={(deleted) => {
                if (deleted) focus.returnFocusTo(NEW_BUTTON);
                close();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface FormProps {
  /** Models already in the database, for refusing a taken id before saving. */
  known: ModelSummary[];
  reload: () => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
  dirtyRef: React.RefObject<boolean>;
}

function ModelLoader({ summary, ...props }: FormProps & { summary: ModelSummary }) {
  const { m } = useI18n();
  const t = m.hvac.admin.models;
  const errorText = useErrorText();
  const [state, setState] = useState<{ view?: ModelView; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadModel(summary.id).then(
      (view) => !cancelled && setState({ view }),
      (error: Error) => !cancelled && setState({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, [summary.id, attempt]);
  if (state.view) return <ModelForm {...props} view={state.view} />;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.editTitle(`${summary.vendor} ${summary.model}`)}</DialogTitle>
        <DialogDescription>{t.editorDesc}</DialogDescription>
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
        <LoadingBlock label={t.loadingModel} lines={6} />
      )}
    </>
  );
}

// ---- The editor -----------------------------------------------------------------------------

/** A register as typed (numbers stay text until saved). */
interface RegRow {
  key: number;
  pointKey: string;
  fc: string;
  register: string;
  type: string;
  scale: string;
  bits: string;
  wordOrder: string;
  scope: string;
  verify: string;
}

interface FaultRow {
  key: number;
  word: string;
  bit: string;
  code: string;
  severity: string;
  en: string;
  th: string;
}

interface Head {
  id: string;
  kind: string;
  vendor: string;
  model: string;
  document: string;
  addressing: string;
  protocol: string;
  baud: string;
  dataBits: string;
  parity: string;
  stopBits: string;
  slaveId: string;
  modular: boolean;
  maxModules: string;
  blockSize: string;
  notAvailable: string;
  notes: string;
}

let rowKeys = 0;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const is32 = (t: string) => t === "int32" || t === "uint32" || t === "float32";
const isIntType = (t: string) => t === "int16" || t === "uint16" || t === "int32" || t === "uint32";
/** A required number: NaN when empty, so the checks flag it. */
const req = (v: string) => (v.trim() === "" ? NaN : Number(v.trim()));
const opt = (v: string) => (v.trim() === "" ? undefined : Number(v.trim()));

function headOf(d: ModelDef | null): Head {
  const spec = d?.spec;
  return {
    id: d?.id ?? "",
    kind: d?.kind ?? "",
    vendor: d?.vendor ?? "",
    model: d?.model ?? "",
    document: spec?.document ?? "",
    addressing: spec?.addressing ?? "modicon",
    protocol: spec?.serial.protocol ?? "rtu",
    baud: s(spec?.serial.baud ?? 9600),
    dataBits: s(spec?.serial.dataBits ?? 8),
    parity: spec?.serial.parity ?? "none",
    stopBits: s(spec?.serial.stopBits ?? 1),
    slaveId: s(spec?.serial.slaveId ?? 1),
    modular: Boolean(spec?.modules),
    maxModules: s(spec?.modules?.max ?? ""),
    blockSize: s(spec?.modules?.blockSize ?? ""),
    notAvailable: (spec?.notAvailable ?? []).join(", "),
    notes: spec?.notes ?? "",
  };
}

const regRowsOf = (d: ModelDef | null): RegRow[] =>
  (d?.spec.registers ?? []).map((r) => ({
    key: ++rowKeys,
    pointKey: s(r.key),
    fc: s(r.fc),
    register: s(r.register),
    type: s(r.type),
    scale: s(r.scale),
    bits: Array.isArray(r.bits) ? r.bits.join(", ") : s(r.bits),
    wordOrder: s(r.wordOrder),
    scope: s(r.scope),
    verify: s(r.verify),
  }));

const faultRowsOf = (d: ModelDef | null): FaultRow[] =>
  (d?.faultBits ?? []).map((b) => ({ key: ++rowKeys, word: s(b.word), bit: s(b.bit), code: s(b.code), severity: s(b.severity), en: s(b.en), th: s(b.th) }));

/** The model of the form, as it would be saved. */
function defOf(h: Head, regs: RegRow[], faults: FaultRow[]): ModelDef {
  const rtu = h.protocol === "rtu";
  const list = h.notAvailable
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    id: h.id.trim(),
    kind: h.kind,
    vendor: h.vendor.trim(),
    model: h.model.trim(),
    spec: {
      ...(h.document.trim() ? { document: h.document.trim() } : {}),
      addressing: h.addressing as ModelDef["spec"]["addressing"],
      serial: {
        protocol: h.protocol as "rtu" | "tcp",
        ...(rtu ? { baud: req(h.baud), dataBits: req(h.dataBits) as 7 | 8, parity: h.parity as "none", stopBits: req(h.stopBits) as 1 | 2 } : {}),
        slaveId: req(h.slaveId),
      },
      ...(h.modular ? { modules: { max: req(h.maxModules), blockSize: req(h.blockSize) } } : {}),
      registers: regs.map((r) => ({
        key: r.pointKey.trim(),
        fc: req(r.fc) as 1,
        register: req(r.register),
        type: r.type as "uint16",
        ...(is32(r.type) && r.wordOrder ? { wordOrder: r.wordOrder as "high-first" } : {}),
        ...(opt(r.scale) !== undefined ? { scale: opt(r.scale) } : {}),
        ...(r.bits.trim() ? { bits: r.bits.split(/[\s,]+/).filter(Boolean).map(Number) } : {}),
        ...(h.modular && r.scope ? { scope: r.scope as "module" } : {}),
        ...(r.verify.trim() ? { verify: r.verify.trim() } : {}),
      })),
      ...(list.length ? { notAvailable: list } : {}),
      ...(h.notes.trim() ? { notes: h.notes.trim() } : {}),
    },
    faultBits: faults.map((b) => ({ word: b.word, bit: req(b.bit), code: b.code.trim(), severity: b.severity as "critical", en: b.en.trim(), th: b.th.trim() })),
  };
}

type HeadField = keyof Head;
type RegField = "pointKey" | "fc" | "register" | "type" | "scale" | "bits" | "wordOrder" | "scope" | "verify";
type FaultField = "word" | "bit" | "code" | "severity" | "en" | "th";

const HEAD_FIELD: Partial<Record<ModelProblem["code"], HeadField>> = {
  id: "id",
  kind: "kind",
  vendor: "vendor",
  model: "model",
  document: "document",
  addressing: "addressing",
  protocol: "protocol",
  baud: "baud",
  "data-bits": "dataBits",
  parity: "parity",
  "stop-bits": "stopBits",
  "slave-id": "slaveId",
  modules: "maxModules",
  "not-available": "notAvailable",
  notes: "notes",
};
const REG_FIELD: Partial<Record<ModelProblem["code"], RegField>> = {
  key: "pointKey",
  "key-repeated": "pointKey",
  fc: "fc",
  address: "register",
  type: "type",
  "type-fc": "type",
  "word-order": "wordOrder",
  scale: "scale",
  bits: "bits",
  scope: "scope",
  verify: "verify",
};
const FAULT_FIELD: Partial<Record<ModelProblem["code"], FaultField>> = {
  "fault-word": "word",
  "fault-bit": "bit",
  "fault-bit-repeated": "bit",
  "fault-code": "code",
  "fault-code-repeated": "code",
  severity: "severity",
  "fault-en": "en",
  "fault-th": "th",
};

function ModelForm({ view, known, reload, onDone, onCancel, dirtyRef }: FormProps & { view: ModelView | null }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const t = a.models;
  const uid = useId();
  const errorText = useErrorText();
  const creating = view === null;
  const [head, setHead] = useState<Head>(() => headOf(view?.def ?? null));
  const [regs, setRegs] = useState<RegRow[]>(() => regRowsOf(view?.def ?? null));
  const [faults, setFaults] = useState<FaultRow[]>(() => faultRowsOf(view?.def ?? null));
  const [baseline] = useState(() => JSON.stringify(defOf(headOf(view?.def ?? null), regRowsOf(view?.def ?? null), faultRowsOf(view?.def ?? null))));
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [fileNote, setFileNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const focusLater = useFocusAfter();
  useFailureFocus(attempt, failure, formRef, failureRef);

  const def = defOf(head, regs, faults);
  const isDirty = JSON.stringify(def) !== baseline;
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [dirtyRef, isDirty]);

  // Problems, worked out on every change and shown from the first save on.
  const problems = modelProblems(def);
  const headErrors: Partial<Record<HeadField, string>> = {};
  const regErrors = new Map<number, Partial<Record<RegField, string>>>();
  const faultErrors = new Map<number, Partial<Record<FaultField, string>>>();
  let listErrors = 0;
  for (const p of problems) {
    const text = t.err[p.code];
    if (p.section === "registers" && p.index !== undefined) {
      const field = REG_FIELD[p.code];
      const row = regs[p.index];
      if (field && row && !regErrors.get(row.key)?.[field]) regErrors.set(row.key, { ...regErrors.get(row.key), [field]: text });
    } else if (p.section === "faultBits" && p.index !== undefined) {
      const field = FAULT_FIELD[p.code];
      const row = faults[p.index];
      if (field && row && !faultErrors.get(row.key)?.[field]) faultErrors.set(row.key, { ...faultErrors.get(row.key), [field]: text });
    } else {
      const field = HEAD_FIELD[p.code];
      if (field) headErrors[field] = text;
      else listErrors++;
    }
  }
  if (creating && !headErrors.id && known.some((x) => x.id === def.id)) headErrors.id = a.errors["model-exists"](def.id);
  const errorCount =
    Object.keys(headErrors).length +
    [...regErrors.values(), ...faultErrors.values()].reduce((n, e) => n + Object.keys(e).length, 0) +
    listErrors;
  const show = attempt > 0;
  const usage = view?.usage.length ?? 0;
  const points = catalogPoints(head.kind);
  const words = regs.filter((r) => r.pointKey.trim() && isIntType(r.type) && !r.bits.trim()).map((r) => r.pointKey.trim());

  const setH = (change: Partial<Head>) => setHead((h) => ({ ...h, ...change }));
  const rid = (row: { key: number }, field: string) => `${uid}-r${row.key}-${field}`;
  const regName = (r: RegRow, i: number) => a.rowName(i + 1, r.pointKey.trim());
  const faultName = (b: FaultRow, i: number) => a.rowName(i + 1, b.word && b.bit !== "" ? `${b.word}.${b.bit}` : "");

  function moveRow<T extends { key: number }>(list: T[], set: (l: T[]) => void, index: number, by: -1 | 1, name: string) {
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [row] = next.splice(index, 1);
    next.splice(to, 0, row);
    set(next);
    focusLater(rid(row, by < 0 ? "up" : "down"));
    setAnnouncement(a.moved(name, to + 1, list.length));
  }
  function removeRow<T extends { key: number }>(list: T[], set: (l: T[]) => void, index: number, name: string, addId: string) {
    const next = list.filter((_, i) => i !== index);
    set(next);
    const neighbour = next[index] ?? next[index - 1];
    focusLater(neighbour ? rid(neighbour, "remove") : addId);
    setAnnouncement(t.removed(name));
  }
  const updateReg = (key: number, change: Partial<RegRow>) => setRegs((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const updateFault = (key: number, change: Partial<FaultRow>) => setFaults((fs) => fs.map((b) => (b.key === key ? { ...b, ...change } : b)));

  async function importFile(file: File) {
    let parsed: ModelDef | null = null;
    try {
      parsed = readModelFile(JSON.parse(await file.text()));
    } catch {
      parsed = null;
    }
    if (!parsed) return setFileNote({ text: t.importFailed, bad: true });
    const next = headOf(parsed);
    // An existing model keeps its id; its kind only changes while no device uses it.
    setHead({ ...next, id: creating ? next.id : head.id, kind: !creating && usage ? head.kind : next.kind });
    setRegs(regRowsOf(parsed));
    setFaults(faultRowsOf(parsed));
    setFileNote({ text: t.imported(parsed.spec.registers.length, parsed.faultBits.length) });
  }

  function exportFile() {
    const blob = new Blob([`${JSON.stringify(def, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${def.id || "device-model"}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setFailure(null);
    if (errorCount) return setAttempt((n) => n + 1);
    setWorking(true);
    try {
      const result = await adminAction({ action: "saveModel", mode: creating ? "create" : "edit", model: def, version: view?.version ?? null });
      toast.success(result.created ? t.created(`${def.vendor} ${def.model}`) : t.saved(`${def.vendor} ${def.model}`));
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

  const headInput = (field: HeadField, label: string, extra: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={`${uid}-${field}`}>{label}</Label>
      <Input
        id={`${uid}-${field}`}
        value={head[field] as string}
        autoComplete="off"
        onChange={(e) => setH({ [field]: e.target.value } as Partial<Head>)}
        className="h-10"
        {...extra}
        {...fieldProps(show, `${uid}-${field}`, headErrors[field], Boolean(hint))}
      />
      {fieldError(show, `${uid}-${field}`, headErrors[field])}
      {hint ? (
        <p id={`${uid}-${field}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
  const headSelect = (field: HeadField, label: string, options: [string, string][], disabled = false) => (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={`${uid}-${field}`}>{label}</Label>
      <Select value={head[field] as string} onValueChange={(v) => setH({ [field]: v } as Partial<Head>)} disabled={disabled}>
        <SelectTrigger id={`${uid}-${field}`} className="w-full min-w-0 data-[size=default]:h-10" {...fieldProps(show, `${uid}-${field}`, headErrors[field])}>
          <SelectValue placeholder={t.kind} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fieldError(show, `${uid}-${field}`, headErrors[field])}
    </div>
  );
  const cellSelect = (id: string, label: string, value: string, options: [string, string][], onChange: (v: string) => void, error: string | undefined, width = "w-32") => (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={`${width} data-[size=default]:h-9`} {...fieldProps(show, id, error)}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
          {value && !options.some(([v]) => v === value) ? <SelectItem value={value}>{value}</SelectItem> : null}
        </SelectContent>
      </Select>
      {fieldError(show, id, error)}
    </>
  );
  const cellInput = (id: string, label: string, value: string, onChange: (v: string) => void, error: string | undefined, className: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input id={id} value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} className={`h-9 ${className}`} {...extra} {...fieldProps(show, id, error)} />
      {fieldError(show, id, error)}
    </>
  );

  const kindOptions = DEVICE_KINDS.map((k) => [k, a.kinds[k] ?? k] as [string, string]);
  const rowButtons = (row: { key: number }, i: number, count: number, label: string, onMove: (by: -1 | 1) => void) => (
    <div className="flex items-center gap-0.5">
      <span className="w-7 pr-1 text-right tabular text-text-secondary">{i + 1}</span>
      <Button type="button" variant="ghost" size="icon" id={rid(row, "up")} aria-disabled={i === 0 || undefined} onClick={() => onMove(-1)}>
        <ArrowUp aria-hidden />
        <span className="sr-only">{a.moveUp(label)}</span>
      </Button>
      <Button type="button" variant="ghost" size="icon" id={rid(row, "down")} aria-disabled={i === count - 1 || undefined} onClick={() => onMove(1)}>
        <ArrowDown aria-hidden />
        <span className="sr-only">{a.moveDown(label)}</span>
      </Button>
    </div>
  );
  const removeButton = (row: { key: number }, label: string, onRemove: () => void) => (
    <Button type="button" variant="ghost" size="icon" id={rid(row, "remove")} className="text-critical-fg hover:text-critical-fg" onClick={onRemove}>
      <Trash2 aria-hidden />
      <span className="sr-only">{a.removeDevice(label)}</span>
    </Button>
  );

  // The editor is long (dozens of registers and fault bits): buttons jump to each part.
  const sections: [string, string][] = [
    ["model", t.sectionModel],
    ["conn", t.sectionConnection],
    ["regs", `${t.sectionRegisters} (${regs.length})`],
    ["faults", `${t.sectionFaults} (${faults.length})`],
  ];
  const jump = (section: string) => {
    const target = document.getElementById(`${uid}-${section}`);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{creating ? t.newTitle : t.editTitle(`${view.def.vendor} ${view.def.model}`)}</DialogTitle>
        <DialogDescription>
          {t.editorDesc} {!creating ? t.usedBy(usage) : null}
        </DialogDescription>
      </DialogHeader>
      <nav aria-label={t.jumpTo} className="flex flex-wrap items-center gap-1.5">
        <span aria-hidden className="mr-0.5 text-sm text-text-secondary">
          {t.jumpTo}:
        </span>
        {sections.map(([section, label]) => (
          <Button key={section} type="button" variant="outline" size="sm" onClick={() => jump(section)}>
            {label}
          </Button>
        ))}
      </nav>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
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
        <p id={`${uid}-file-hint`} className="basis-full text-xs text-text-secondary">
          {t.fileHint}
        </p>
        <p role="status" className={fileNote?.bad ? "basis-full text-sm text-critical-fg" : "basis-full text-sm"}>
          {fileNote?.text ?? ""}
        </p>
      </div>

      <fieldset id={`${uid}-model`} tabIndex={-1} className="grid min-w-0 scroll-mt-4 gap-4 outline-none md:grid-cols-3">
        <legend className="mb-2 text-base font-semibold">{t.sectionModel}</legend>
        {creating ? (
          headInput("id", t.id, { maxLength: 40, className: "h-10 font-mono", onChange: (e) => setH({ id: e.target.value.trim().toLowerCase() }) }, t.idHint)
        ) : (
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor={`${uid}-id`}>{t.id}</Label>
            <Input id={`${uid}-id`} value={head.id} readOnly className="h-10 bg-muted font-mono" />
          </div>
        )}
        {!creating && usage > 0 ? (
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor={`${uid}-kind`}>{t.kind}</Label>
            <Input id={`${uid}-kind`} value={a.kinds[head.kind] ?? head.kind} readOnly aria-describedby={`${uid}-kind-hint`} className="h-10 bg-muted" />
            <p id={`${uid}-kind-hint`} className="text-xs text-text-secondary">
              {t.kindLocked}
            </p>
          </div>
        ) : (
          headSelect("kind", t.kind, kindOptions)
        )}
        {headInput("vendor", t.vendor, { maxLength: MODEL_TEXT_MAX + 10 })}
        {headInput("model", t.model, { maxLength: MODEL_TEXT_MAX + 10 })}
        <div className="md:col-span-2">{headInput("document", t.document, { maxLength: 210 })}</div>
      </fieldset>

      <fieldset id={`${uid}-conn`} tabIndex={-1} className="grid min-w-0 scroll-mt-4 gap-4 outline-none md:grid-cols-3">
        <legend className="mb-2 text-base font-semibold">{t.sectionConnection}</legend>
        {headSelect("addressing", t.addressing, ADDRESSINGS.map((x) => [x, t.addressings[x]]))}
        {headSelect("protocol", t.protocol, [
          ["rtu", t.protocols.rtu],
          ["tcp", t.protocols.tcp],
        ])}
        {headInput("slaveId", t.slaveId, { inputMode: "numeric", className: "h-10 tabular" })}
        {head.protocol === "rtu" ? (
          <>
            {headSelect("baud", t.baud, BAUDS.map((b) => [String(b), String(b)]))}
            {headSelect("dataBits", t.dataBits, [
              ["8", "8"],
              ["7", "7"],
            ])}
            {headSelect("parity", t.parity, PARITIES.map((p) => [p, t.parities[p]]))}
            {headSelect("stopBits", t.stopBits, [
              ["1", "1"],
              ["2", "2"],
            ])}
          </>
        ) : null}
        <div className="flex items-start gap-3 md:col-span-3">
          <Checkbox id={`${uid}-modular`} className="mt-0.5" checked={head.modular} onCheckedChange={(on) => setH({ modular: on === true })} />
          <Label htmlFor={`${uid}-modular`} className="font-normal">
            {t.modular}
          </Label>
        </div>
        {head.modular ? (
          <>
            {headInput("maxModules", t.maxModules, { inputMode: "numeric", className: "h-10 tabular" })}
            {headInput("blockSize", t.blockSize, { inputMode: "numeric", className: "h-10 tabular" })}
          </>
        ) : null}
        <div className="md:col-span-3">{headInput("notAvailable", t.notAvailable, { spellCheck: false, className: "h-10 font-mono" }, t.notAvailableHint)}</div>
        <div className="grid gap-1.5 md:col-span-3">
          <Label htmlFor={`${uid}-notes`}>{t.notes}</Label>
          <Textarea id={`${uid}-notes`} value={head.notes} rows={4} onChange={(e) => setH({ notes: e.target.value })} {...fieldProps(show, `${uid}-notes`, headErrors.notes)} />
          {fieldError(show, `${uid}-notes`, headErrors.notes)}
        </div>
      </fieldset>

      <section aria-labelledby={`${uid}-regs`} className="flex min-w-0 flex-col gap-3">
        <h3 id={`${uid}-regs`} tabIndex={-1} className="scroll-mt-4 text-base font-semibold outline-none">
          {t.sectionRegisters} <span className="font-normal text-text-secondary">({regs.length})</span>
        </h3>
        {regs.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-text-secondary">{t.registersEmpty}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={t.registersCaption} className="relative overflow-x-auto rounded-md border">
            <datalist id={`${uid}-points`}>
              {points.map((p) => (
                <option key={p.key} value={p.key} />
              ))}
            </datalist>
            <table className="w-full min-w-[1240px] text-sm">
              <caption className="sr-only">{t.registersCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  {[a.colOrder, t.colKey, t.colFc, t.colRegister, t.colType, t.colScale, t.colBits, t.colWordOrder, ...(head.modular ? [t.colScope] : []), t.colVerify].map((c) => (
                    <th key={c} scope="col" className="px-2 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {regs.map((r, i) => {
                  const err = regErrors.get(r.key) ?? {};
                  const label = regName(r, i);
                  const point = points.find((p) => p.key === r.pointKey.trim());
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="px-2 py-2">{rowButtons(r, i, regs.length, label, (by) => moveRow(regs, setRegs, i, by, label))}</td>
                      <td className="px-2 py-2">
                        {cellInput(rid(r, "key"), `${t.colKey}, ${a.rowName(i + 1, "")}`, r.pointKey, (v) => updateReg(r.key, { pointKey: v }), err.pointKey, "w-36 font-mono", {
                          list: `${uid}-points`,
                          maxLength: 40,
                        })}
                        {r.pointKey.trim() ? <p className="mt-1 text-xs text-text-secondary">{point ? (point.unit ? t.unit(point.unit) : point.type) : t.ownPoint}</p> : null}
                      </td>
                      <td className="px-2 py-2">
                        {cellSelect(rid(r, "fc"), `${t.colFc}, ${label}`, r.fc, FUNCTION_CODES.map((x) => [String(x), t.fcs[x]]), (v) => updateReg(r.key, { fc: v }), err.fc, "w-40")}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(r, "register"), `${t.colRegister}, ${label}`, r.register, (v) => updateReg(r.key, { register: v }), err.register, "w-28 tabular", { inputMode: "numeric" })}
                      </td>
                      <td className="px-2 py-2">
                        {cellSelect(rid(r, "type"), `${t.colType}, ${label}`, r.type, DATA_TYPES.map((x) => [x, x]), (v) => updateReg(r.key, { type: v }), err.type, "w-28")}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(r, "scale"), `${t.colScale}, ${label}`, r.scale, (v) => updateReg(r.key, { scale: v }), err.scale, "w-20 tabular", { inputMode: "decimal" })}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(r, "bits"), `${t.colBits}, ${label}`, r.bits, (v) => updateReg(r.key, { bits: v }), err.bits, "w-24 tabular", { placeholder: t.bitsPlaceholder })}
                      </td>
                      <td className="px-2 py-2">
                        {is32(r.type) ? (
                          cellSelect(rid(r, "wordOrder"), `${t.colWordOrder}, ${label}`, r.wordOrder || "high-first", WORD_ORDERS.map((x) => [x, t.wordOrders[x]]), (v) => updateReg(r.key, { wordOrder: v }), err.wordOrder, "w-36")
                        ) : (
                          <span className="inline-block py-2 text-text-secondary">
                            <span aria-hidden>—</span>
                          </span>
                        )}
                      </td>
                      {head.modular ? (
                        <td className="px-2 py-2">
                          {cellSelect(rid(r, "scope"), `${t.colScope}, ${label}`, r.scope || "module", [
                            ["module", t.scopes.module],
                            ["master", t.scopes.master],
                          ], (v) => updateReg(r.key, { scope: v }), err.scope)}
                        </td>
                      ) : null}
                      <td className="px-2 py-2">
                        {cellInput(rid(r, "verify"), `${t.colVerify}, ${label}`, r.verify, (v) => updateReg(r.key, { verify: v }), err.verify, "w-56", { maxLength: 210 })}
                      </td>
                      <td className="px-2 py-2 text-right">{removeButton(r, label, () => removeRow(regs, setRegs, i, label, `${uid}-add-reg`))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            id={`${uid}-add-reg`}
            aria-disabled={regs.length >= REGISTERS_MAX || undefined}
            onClick={() => {
              if (regs.length >= REGISTERS_MAX) return;
              const row: RegRow = { key: ++rowKeys, pointKey: "", fc: "4", register: "", type: "uint16", scale: "", bits: "", wordOrder: "", scope: "", verify: "" };
              setRegs((rs) => [...rs, row]);
              focusLater(rid(row, "key"));
              setAnnouncement(t.addedRegister(regs.length + 1));
            }}
          >
            <Plus aria-hidden />
            {t.addRegister}
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${uid}-faults`} className="flex min-w-0 flex-col gap-3">
        <h3 id={`${uid}-faults`} tabIndex={-1} className="scroll-mt-4 text-base font-semibold outline-none">
          {t.sectionFaults} <span className="font-normal text-text-secondary">({faults.length})</span>
        </h3>
        {faults.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-text-secondary">{t.faultsEmpty}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={t.faultsCaption} className="relative overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1040px] text-sm">
              <caption className="sr-only">{t.faultsCaption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  {[a.colOrder, t.colWord, t.colBit, t.colCode, t.colSeverity, t.colEn, t.colTh].map((c) => (
                    <th key={c} scope="col" className="px-2 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {faults.map((b, i) => {
                  const err = faultErrors.get(b.key) ?? {};
                  const label = faultName(b, i);
                  return (
                    <tr key={b.key} className="align-top">
                      <td className="px-2 py-2">{rowButtons(b, i, faults.length, label, (by) => moveRow(faults, setFaults, i, by, label))}</td>
                      <td className="px-2 py-2">
                        {words.length || b.word ? (
                          cellSelect(rid(b, "word"), `${t.colWord}, ${a.rowName(i + 1, "")}`, b.word, words.map((w) => [w, w]), (v) => updateFault(b.key, { word: v }), err.word)
                        ) : (
                          <p className="py-2 text-xs text-text-secondary">{t.noWords}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(b, "bit"), `${t.colBit}, ${label}`, b.bit, (v) => updateFault(b.key, { bit: v }), err.bit, "w-16 tabular", { inputMode: "numeric" })}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(b, "code"), `${t.colCode}, ${label}`, b.code, (v) => updateFault(b.key, { code: v }), err.code, "w-44 font-mono", { maxLength: 60 })}
                      </td>
                      <td className="px-2 py-2">
                        {cellSelect(rid(b, "severity"), `${t.colSeverity}, ${label}`, b.severity, SEVERITIES.map((x) => [x, t.severities[x]]), (v) => updateFault(b.key, { severity: v }), err.severity, "w-32")}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(b, "en"), `${t.colEn}, ${label}`, b.en, (v) => updateFault(b.key, { en: v }), err.en, "w-64", { maxLength: 210 })}
                      </td>
                      <td className="px-2 py-2">
                        {cellInput(rid(b, "th"), `${t.colTh}, ${label}`, b.th, (v) => updateFault(b.key, { th: v }), err.th, "w-64", { maxLength: 210 })}
                      </td>
                      <td className="px-2 py-2 text-right">{removeButton(b, label, () => removeRow(faults, setFaults, i, label, `${uid}-add-fault`))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            id={`${uid}-add-fault`}
            aria-disabled={faults.length >= FAULT_BITS_MAX || undefined}
            onClick={() => {
              if (faults.length >= FAULT_BITS_MAX) return;
              const last = faults[faults.length - 1];
              const row: FaultRow = { key: ++rowKeys, word: last?.word ?? words[0] ?? "", bit: last && last.bit !== "" ? String(Number(last.bit) + 1) : "0", code: "", severity: "warning", en: "", th: "" };
              setFaults((fs) => [...fs, row]);
              focusLater(rid(row, "code"));
              setAnnouncement(t.addedFault(faults.length + 1));
            }}
          >
            <Plus aria-hidden />
            {t.addFault}
          </Button>
        </div>
      </section>

      <p role="status" className="text-sm text-text-secondary">
        {show && errorCount ? t.errInList(errorCount) : ""}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <DialogButtons working={working} submit={creating ? t.newModel : a.save} onCancel={onCancel} />
    </form>
  );
}

function DeleteModel({ model, reload, onDone }: { model: ModelSummary; reload: () => Promise<void>; onDone: (deleted: boolean) => void }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const t = a.models;
  const errorText = useErrorText();
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  useFailureFocus(attempt, failure, formRef, failureRef);
  const name = `${model.vendor} ${model.model}`;

  if (model.devices) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t.cannotDeleteTitle(name)}</DialogTitle>
          <DialogDescription>{t.cannotDeleteDesc(model.devices)}</DialogDescription>
        </DialogHeader>
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
      await adminAction({ action: "deleteModel", id: model.id });
      toast.success(t.deleted(name));
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
        <DialogTitle>{t.deleteTitle(name)}</DialogTitle>
        <DialogDescription>{t.deleteDesc}</DialogDescription>
      </DialogHeader>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      <DialogButtons working={working} submit={t.deleteConfirm} onCancel={() => onDone(false)} danger />
    </form>
  );
}
