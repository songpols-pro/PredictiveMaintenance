"use client";

// Modbus dialog of a plant (Plants tab of the admin page): where each device is wired (gateway, port,
// slave id, module) and how its register map differs from its model's, kept in TimescaleDB
// (devices.modbus, lib/telemetry/register-map.ts). Exports the plant's register maps as CSV for the PLC
// programmer. Saving goes through /api/hvac/admin, which checks the settings again.

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Cpu, Download, EyeOff, PencilLine, Plus, RotateCcw, Settings2, Trash2, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/pdm/status";
import { ErrorState, LoadingBlock } from "@/components/pdm/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectRow } from "@/lib/access/model";
import type { ModbusDevice, PlantModbusView } from "@/lib/access/models";
import { adminAction, loadPlantModbus } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  ADDRESSINGS,
  BAUDS,
  catalogPoints,
  DATA_TYPES,
  DEFAULT_SERIAL,
  deviceMap,
  deviceModbusProblems,
  FUNCTION_CODES,
  PARITIES,
  pduAddress,
  registerCsv,
  REGISTERS_MAX,
  WORD_ORDERS,
  type DeviceModbus,
  type ModelDef,
  type ModelProblem,
  type RegisterOverride,
  type RegisterRow,
} from "@/lib/telemetry/register-map";
import { CellLabel, fieldError, fieldProps, FormFailure, STACKED_TABLE, useErrorText, useFailureFocus, useFocusAfter } from "./admin-common";

const SOURCE: Record<string, { icon: LucideIcon; tone: "neutral" | "warning" | "info" }> = {
  model: { icon: Cpu, tone: "neutral" },
  changed: { icon: PencilLine, tone: "warning" },
  device: { icon: Plus, tone: "info" },
  omitted: { icon: EyeOff, tone: "neutral" },
};

const modelLabel = (m: ModelDef | undefined) => (m ? `${m.vendor} ${m.model}` : null);

/** `onChanged` loads the admin page's overview again, so the activity log shows a saved change. */
export function PlantModbus({ plant, onCancel, onChanged, dirtyRef }: { plant: ProjectRow; onCancel: () => void; onChanged: () => Promise<void>; dirtyRef: React.RefObject<boolean> }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const t = a.modbus;
  const uid = useId();
  const errorText = useErrorText();
  const [state, setState] = useState<{ view?: PlantModbusView; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const focusLater = useFocusAfter();

  useEffect(() => {
    let cancelled = false;
    loadPlantModbus(plant.id).then(
      (view) => !cancelled && setState({ view }),
      (error: Error) => !cancelled && setState((s) => ({ view: s.view, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [plant.id, attempt]);

  const reload = async () => {
    void onChanged();
    try {
      setState({ view: await loadPlantModbus(plant.id) });
    } catch (error) {
      setState((s) => ({ view: s.view, error: error as Error }));
    }
  };

  const view = state.view;
  const models = new Map((view?.models ?? []).map((x) => [x.id, x]));
  const title = t.title(plant.name ?? plant.id);

  function open(d: ModbusDevice) {
    if (selected === d.id) return;
    if (dirtyRef.current && !window.confirm(t.switchConfirm)) return;
    dirtyRef.current = false;
    setSelected(d.id);
    focusLater(`${uid}-device-heading`);
  }

  function exportCsv() {
    if (!view) return;
    const csv = registerCsv(
      view.devices.map((d) => ({ device: d.id, name: d.name, kind: d.kind, gateway: d.seenGateway ?? "", model: d.profile ? (models.get(d.profile) ?? null) : null, modbus: d.modbus })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${plant.id}-registers.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const device = view?.devices.find((d) => d.id === selected) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t.desc}</DialogDescription>
      </DialogHeader>
      {!view ? (
        state.error ? (
          <ErrorState compact title={t.loadError} error={new Error(errorText(state.error))} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <LoadingBlock label={t.loading} lines={6} />
        )
      ) : view.devices.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-text-secondary">{t.devicesEmpty}</p>
      ) : (
        <>
          {state.error ? <FormFailure title={t.loadError} text={errorText(state.error)} /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal" aria-describedby={`${uid}-export-hint`} onClick={exportCsv}>
              <Download aria-hidden />
              {t.exportCsv}
            </Button>
            <p id={`${uid}-export-hint`} className="text-xs text-text-secondary">
              {t.exportHint}
            </p>
          </div>
          <div tabIndex={0} role="region" aria-label={t.caption} className="relative overflow-x-auto rounded-md border">
            <table className={cn(STACKED_TABLE, "md:min-w-[900px]")}>
              <caption className="sr-only">{t.caption}</caption>
              <thead className="bg-muted text-left text-xs text-text-secondary">
                <tr>
                  {[t.colDevice, t.colModel, t.colGateway, t.colPort, t.colSlave, t.colModule, t.colRegisters].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{a.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {view.devices.map((d) => {
                  const model = d.profile ? models.get(d.profile) : undefined;
                  const map = deviceMap(model ?? null, d.modbus);
                  const current = d.id === selected;
                  return (
                    <tr key={d.id} className={current ? "bg-accent/40" : undefined}>
                      <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                        <p className="font-medium">{d.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{d.id}</p>
                      </th>
                      <td className="px-3 py-2 align-top">
                        <CellLabel>{t.colModel}</CellLabel>
                        {modelLabel(model) ?? <span className="text-text-secondary">{t.noModel}</span>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className="font-mono">{d.modbus?.gateway ?? d.seenGateway ?? "—"}</p>
                        <p className="text-xs text-text-secondary">{d.seenGateway ? t.seenVia(d.seenGateway) : t.notSeen}</p>
                      </td>
                      <td className="px-3 py-2 align-top font-mono">
                        <CellLabel>{t.colPort}</CellLabel>
                        {d.modbus?.port ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top tabular">
                        <CellLabel>{t.colSlave}</CellLabel>
                        {map.serial.slaveId}
                      </td>
                      <td className="px-3 py-2 align-top tabular">
                        <CellLabel>{t.colModule}</CellLabel>
                        {model?.spec.modules ? map.module : "—"}
                      </td>
                      <td className="px-3 py-2 align-top tabular">
                        <CellLabel>{t.colRegisters}</CellLabel>
                        {map.rows.length}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <Button variant={current ? "secondary" : "outline"} size="sm" aria-pressed={current} onClick={() => open(d)}>
                          <Settings2 aria-hidden />
                          {t.settingsAction}
                          <span className="sr-only"> {d.name}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {device ? (
            <DeviceSettings
              key={`${device.id}:${device.version ?? 0}`}
              headingId={`${uid}-device-heading`}
              project={plant.id}
              device={device}
              model={device.profile ? (models.get(device.profile) ?? null) : null}
              gateways={[...new Set(view.devices.map((d) => d.seenGateway).filter((g): g is string => Boolean(g)))]}
              onSaved={reload}
              dirtyRef={dirtyRef}
            />
          ) : null}
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
          {a.close}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** A register of the device's map as typed: a model register (maybe changed or left out) or the device's own. */
interface MapRow {
  key: number;
  origin: "model" | "device";
  /** Model registers: the model's version. */
  base?: RegisterRow;
  read: boolean;
  pointKey: string;
  fc: string;
  register: string;
  type: string;
  scale: string;
  bits: string;
  wordOrder: string;
  scope: string;
}

type Field = "pointKey" | "fc" | "register" | "type" | "scale" | "bits" | "wordOrder" | "scope";

let rowKeys = 0;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const is32 = (t: string) => t === "int32" || t === "uint32" || t === "float32";
const req = (v: string) => (v.trim() === "" ? NaN : Number(v.trim()));
const opt = (v: string) => (v.trim() === "" ? undefined : Number(v.trim()));

const rowOf = (r: Partial<RegisterRow>, origin: MapRow["origin"], base?: RegisterRow, read = true): MapRow => ({
  key: ++rowKeys,
  origin,
  base,
  read,
  pointKey: s(r.key),
  fc: s(r.fc),
  register: s(r.register),
  type: s(r.type),
  scale: s(r.scale),
  bits: Array.isArray(r.bits) ? r.bits.join(", ") : s(r.bits),
  wordOrder: s(r.wordOrder),
  scope: s(r.scope),
});

function rowsOf(model: ModelDef | null, d: DeviceModbus | null): MapRow[] {
  const overrides = new Map((d?.registers ?? []).map((o) => [o.key, o]));
  const rows = (model?.spec.registers ?? []).map((base) => {
    const o = overrides.get(base.key);
    return o?.omit ? rowOf(base, "model", base, false) : rowOf({ ...base, ...(o ?? {}), key: base.key }, "model", base);
  });
  return [...rows, ...(d?.registers ?? []).filter((o) => !o.omit && !model?.spec.registers.some((r) => r.key === o.key)).map((o) => rowOf(o, "device"))];
}

/** The register a row describes, as it would be saved. */
function registerOf(r: MapRow, modular: boolean): RegisterRow {
  return {
    key: r.pointKey.trim(),
    fc: req(r.fc) as 1,
    register: req(r.register),
    type: r.type as "uint16",
    ...(is32(r.type) && r.wordOrder ? { wordOrder: r.wordOrder as "high-first" } : {}),
    ...(opt(r.scale) !== undefined ? { scale: opt(r.scale) } : {}),
    ...(r.bits.trim() ? { bits: r.bits.split(/[\s,]+/).filter(Boolean).map(Number) } : {}),
    ...(modular && r.scope ? { scope: r.scope as "module" } : {}),
  };
}

const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

/** How a model register differs from the model, as an override; null when it does not. */
function overrideOf(r: MapRow, modular: boolean): RegisterOverride | null {
  if (!r.base) return null;
  if (!r.read) return { key: r.base.key, omit: true };
  const now = registerOf(r, modular);
  const base = r.base;
  const diff: Partial<RegisterRow> = {};
  if (!same(now.fc, base.fc)) diff.fc = now.fc;
  if (!same(now.register, base.register)) diff.register = now.register;
  if (!same(now.type, base.type)) diff.type = now.type;
  // An emptied field cannot fall back to "none" in an override, so scale 1 stands for no scaling.
  if (!same(now.scale ?? 1, base.scale ?? 1)) diff.scale = now.scale ?? 1;
  if (now.bits !== undefined && !same(now.bits, base.bits)) diff.bits = now.bits;
  if (now.wordOrder !== undefined && !same(now.wordOrder, base.wordOrder ?? "high-first")) diff.wordOrder = now.wordOrder;
  if (modular && !same(now.scope ?? "module", base.scope ?? "module")) diff.scope = now.scope ?? "module";
  return Object.keys(diff).length ? { key: base.key, ...diff } : null;
}

interface SettingsProps {
  headingId: string;
  project: string;
  device: ModbusDevice;
  model: ModelDef | null;
  gateways: string[];
  onSaved: () => Promise<void>;
  dirtyRef: React.RefObject<boolean>;
}

const FIELD: Partial<Record<ModelProblem["code"], Field>> = {
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
};

function DeviceSettings({ headingId, project, device, model, gateways, onSaved, dirtyRef }: SettingsProps) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const t = a.modbus;
  const tm = a.models;
  const uid = useId();
  const errorText = useErrorText();
  const d = device.modbus;
  const modular = Boolean(model?.spec.modules);
  const [gateway, setGateway] = useState(d?.gateway ?? "");
  const [port, setPort] = useState(d?.port ?? "");
  const [slaveId, setSlaveId] = useState(s(d?.slaveId));
  const [module, setModule] = useState(s(d?.module ?? 0));
  const [serial, setSerial] = useState({ protocol: s(d?.serial?.protocol), baud: s(d?.serial?.baud), dataBits: s(d?.serial?.dataBits), parity: s(d?.serial?.parity), stopBits: s(d?.serial?.stopBits) });
  const [addressing, setAddressing] = useState(d?.addressing ?? "");
  const [notes, setNotes] = useState(d?.notes ?? "");
  const [rows, setRows] = useState<MapRow[]>(() => rowsOf(model, d));
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfter();
  useFailureFocus(attempt, failure, formRef, failureRef);

  // The settings of the form, with the row behind each register override (to place problems).
  const overrideRows: number[] = [];
  const overrides: RegisterOverride[] = [];
  for (const r of rows) {
    const o = r.origin === "model" ? overrideOf(r, modular) : registerOf(r, modular);
    if (!o) continue;
    overrides.push(o);
    overrideRows.push(r.key);
  }
  const numberOr = (v: string) => (v.trim() === "" ? undefined : Number(v.trim()));
  const settings: DeviceModbus = {
    ...(gateway.trim() ? { gateway: gateway.trim() } : {}),
    ...(port.trim() ? { port: port.trim() } : {}),
    ...(slaveId.trim() ? { slaveId: numberOr(slaveId) } : {}),
    ...(modular && Number(module) ? { module: Number(module) } : {}),
    ...(Object.values(serial).some(Boolean)
      ? {
          serial: {
            ...(serial.protocol ? { protocol: serial.protocol as "rtu" } : {}),
            ...(serial.baud ? { baud: Number(serial.baud) } : {}),
            ...(serial.dataBits ? { dataBits: Number(serial.dataBits) as 8 } : {}),
            ...(serial.parity ? { parity: serial.parity as "none" } : {}),
            ...(serial.stopBits ? { stopBits: Number(serial.stopBits) as 1 } : {}),
          },
        }
      : {}),
    ...(!model && addressing ? { addressing: addressing as "modicon" } : {}),
    ...(overrides.length ? { registers: overrides } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  };
  const [baseline] = useState(() => JSON.stringify(settings));
  const isDirty = JSON.stringify(settings) !== baseline;
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [dirtyRef, isDirty]);

  const problems = deviceModbusProblems(settings, model);
  const top: Partial<Record<string, string>> = {};
  const rowErrors = new Map<number, Partial<Record<Field, string>>>();
  for (const p of problems) {
    const text = tm.err[p.code];
    if (p.section === "registers" && p.index !== undefined) {
      const key = overrideRows[p.index];
      const field = FIELD[p.code];
      if (key !== undefined && field && !rowErrors.get(key)?.[field]) rowErrors.set(key, { ...rowErrors.get(key), [field]: text });
    } else top[p.code] = text;
  }
  const errorCount = Object.keys(top).length + [...rowErrors.values()].reduce((n, e) => n + Object.keys(e).length, 0);
  const show = attempt > 0;

  const mod = modular ? Number(module) || 0 : 0;
  const block = model?.spec.modules?.blockSize ?? 0;
  const addr = model?.spec.addressing ?? ((addressing || "modicon") as "modicon");
  const effective = deviceMap(model, settings);
  const shown = rows.filter((r) => !(mod > 0 && r.origin === "model" && (r.scope || r.base?.scope || "module") === "master"));
  const points = catalogPoints(device.kind);
  const serialDefault = { ...DEFAULT_SERIAL, ...(model?.spec.serial ?? {}) };

  const rid = (r: { key: number }, field: string) => `${uid}-r${r.key}-${field}`;
  const update = (key: number, change: Partial<MapRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setFailure(null);
    if (errorCount) return setAttempt((n) => n + 1);
    setWorking(true);
    try {
      const result = await adminAction({ action: "saveModbus", project, device: device.id, modbus: settings, version: device.version });
      toast.success(result.changed ? t.saved(device.name) : a.noChanges);
      dirtyRef.current = false;
      await onSaved();
    } catch (err) {
      setFailure(errorText(err));
      setAttempt((n) => n + 1);
    } finally {
      setWorking(false);
    }
  }

  const serialSelect = (field: keyof typeof serial, label: string, options: [string, string][], modelValue: string) => (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={`${uid}-${field}`}>{label}</Label>
      <Select value={serial[field] || "model"} onValueChange={(v) => setSerial((x) => ({ ...x, [field]: v === "model" ? "" : v }))}>
        <SelectTrigger id={`${uid}-${field}`} className="w-full min-w-0 data-[size=default]:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="model">{t.fromModel(modelValue)}</SelectItem>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const cellSelect = (id: string, label: string, value: string, options: [string, string][], onChange: (v: string) => void, error: string | undefined, width = "w-28") => (
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

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
      <h3 id={headingId} tabIndex={-1} className="text-base font-semibold outline-none">
        {t.deviceHeading(device.name)} <span className="font-mono text-sm font-normal text-text-secondary">{device.id}</span>
      </h3>
      {failure ? <FormFailure ref={failureRef} title={a.errSummary} text={failure} /> : null}
      {!model ? <p className="text-sm text-text-secondary">{t.noModelNote}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor={`${uid}-gateway`}>{t.gateway}</Label>
          <Input
            id={`${uid}-gateway`}
            value={gateway}
            list={`${uid}-gateways`}
            placeholder={device.seenGateway ?? ""}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setGateway(e.target.value.trim().toLowerCase())}
            className="h-10 font-mono"
            {...fieldProps(show, `${uid}-gateway`, top.gateway, true)}
          />
          <datalist id={`${uid}-gateways`}>
            {gateways.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          {fieldError(show, `${uid}-gateway`, top.gateway)}
          <p id={`${uid}-gateway-hint`} className="text-xs text-text-secondary">
            {t.gatewayHint(device.seenGateway)}
          </p>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor={`${uid}-port`}>{t.port}</Label>
          <Input id={`${uid}-port`} value={port} maxLength={110} autoComplete="off" spellCheck={false} onChange={(e) => setPort(e.target.value)} className="h-10 font-mono" {...fieldProps(show, `${uid}-port`, top.port, true)} />
          {fieldError(show, `${uid}-port`, top.port)}
          <p id={`${uid}-port-hint`} className="text-xs text-text-secondary">
            {t.portHint}
          </p>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor={`${uid}-slave`}>{t.slaveId}</Label>
          <Input
            id={`${uid}-slave`}
            value={slaveId}
            inputMode="numeric"
            placeholder={String(serialDefault.slaveId)}
            autoComplete="off"
            onChange={(e) => setSlaveId(e.target.value)}
            className="h-10 tabular"
            {...fieldProps(show, `${uid}-slave`, top["slave-id"], true)}
          />
          {fieldError(show, `${uid}-slave`, top["slave-id"])}
          <p id={`${uid}-slave-hint`} className="text-xs text-text-secondary">
            {t.fromModel(String(serialDefault.slaveId))}
          </p>
        </div>
        {modular ? (
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor={`${uid}-module`}>{t.module}</Label>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger id={`${uid}-module`} className="w-full min-w-0 data-[size=default]:h-10" {...fieldProps(show, `${uid}-module`, top.module)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: model!.spec.modules!.max }, (_, n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t.moduleName(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError(show, `${uid}-module`, top.module)}
          </div>
        ) : null}
        {!model ? (
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor={`${uid}-addressing`}>{t.addressing}</Label>
            <Select value={addressing || "modicon"} onValueChange={setAddressing}>
              <SelectTrigger id={`${uid}-addressing`} className="w-full min-w-0 data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDRESSINGS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {tm.addressings[x]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <fieldset className="grid min-w-0 gap-4 md:grid-cols-5">
        <legend className="mb-2 text-sm font-semibold">{t.serialLegend}</legend>
        {serialSelect("protocol", tm.protocol, [
          ["rtu", tm.protocols.rtu],
          ["tcp", tm.protocols.tcp],
        ], serialDefault.protocol.toUpperCase())}
        {serialSelect("baud", tm.baud, BAUDS.map((b) => [String(b), String(b)]), String(serialDefault.baud ?? ""))}
        {serialSelect("dataBits", tm.dataBits, [
          ["8", "8"],
          ["7", "7"],
        ], String(serialDefault.dataBits ?? ""))}
        {serialSelect("parity", tm.parity, PARITIES.map((p) => [p, tm.parities[p]]), tm.parities[serialDefault.parity ?? "none"])}
        {serialSelect("stopBits", tm.stopBits, [
          ["1", "1"],
          ["2", "2"],
        ], String(serialDefault.stopBits ?? ""))}
      </fieldset>

      <section aria-labelledby={`${uid}-map`} className="flex min-w-0 flex-col gap-3">
        <h4 id={`${uid}-map`} className="text-sm font-semibold">
          {t.mapHeading} <span className="font-normal text-text-secondary">({effective.rows.length})</span>
        </h4>
        {effective.masterOnly.length ? <p className="text-xs text-text-secondary">{t.masterOnly(effective.masterOnly.join(", "))}</p> : null}
        <div tabIndex={0} role="region" aria-label={t.mapCaption(device.name)} className="relative overflow-x-auto rounded-md border">
          <datalist id={`${uid}-points`}>
            {points.map((p) => (
              <option key={p.key} value={p.key} />
            ))}
          </datalist>
          <table className="w-full min-w-[1180px] text-sm">
            <caption className="sr-only">{t.mapCaption(device.name)}</caption>
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                {[t.colRead, tm.colKey, tm.colFc, tm.colRegister, t.colPdu, tm.colType, tm.colScale, tm.colBits, tm.colWordOrder, ...(modular ? [tm.colScope] : []), t.colSource].map((c) => (
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
              {shown.map((r) => {
                const err = rowErrors.get(r.key) ?? {};
                const label = r.pointKey.trim() || a.rowName(rows.indexOf(r) + 1, "");
                const changed = r.origin === "model" && r.read && overrideOf(r, modular) !== null;
                const source = r.origin === "device" ? "device" : !r.read ? "omitted" : changed ? "changed" : "model";
                const register = registerOf(r, modular);
                const pdu = Number.isNaN(register.register) || Number.isNaN(register.fc) ? null : pduAddress(register, addr, mod, block);
                const off = !r.read;
                return (
                  <tr key={r.key} className={off ? "align-top text-text-secondary" : "align-top"}>
                    <td className="px-2 py-2">
                      {r.origin === "model" ? (
                        <Checkbox id={rid(r, "read")} aria-label={t.readLabel(r.pointKey)} className="mt-2" checked={r.read} onCheckedChange={(on) => update(r.key, { read: on === true })} />
                      ) : (
                        <span aria-hidden className="inline-block py-2">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {r.origin === "model" ? (
                        <>
                          <p className="py-2 font-mono">{r.pointKey}</p>
                          {r.base?.verify ? <p className="max-w-56 text-xs text-text-secondary">{r.base.verify}</p> : null}
                        </>
                      ) : (
                        cellInput(rid(r, "key"), `${tm.colKey}, ${a.rowName(rows.indexOf(r) + 1, "")}`, r.pointKey, (v) => update(r.key, { pointKey: v }), err.pointKey, "w-36 font-mono", {
                          list: `${uid}-points`,
                          maxLength: 40,
                        })
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {cellSelect(rid(r, "fc"), `${tm.colFc}, ${label}`, r.fc, FUNCTION_CODES.map((x) => [String(x), tm.fcs[x]]), (v) => update(r.key, { fc: v }), err.fc, "w-40")}
                    </td>
                    <td className="px-2 py-2">
                      {cellInput(rid(r, "register"), `${tm.colRegister}, ${label}`, r.register, (v) => update(r.key, { register: v }), err.register, "w-24 tabular", { inputMode: "numeric" })}
                    </td>
                    <td className="px-2 py-2 tabular">
                      <span className="inline-block py-2">{off ? "—" : (pdu ?? "—")}</span>
                    </td>
                    <td className="px-2 py-2">
                      {cellSelect(rid(r, "type"), `${tm.colType}, ${label}`, r.type, DATA_TYPES.map((x) => [x, x]), (v) => update(r.key, { type: v }), err.type)}
                    </td>
                    <td className="px-2 py-2">
                      {cellInput(rid(r, "scale"), `${tm.colScale}, ${label}`, r.scale, (v) => update(r.key, { scale: v }), err.scale, "w-20 tabular", { inputMode: "decimal" })}
                    </td>
                    <td className="px-2 py-2">
                      {cellInput(rid(r, "bits"), `${tm.colBits}, ${label}`, r.bits, (v) => update(r.key, { bits: v }), err.bits, "w-24 tabular", { placeholder: tm.bitsPlaceholder })}
                    </td>
                    <td className="px-2 py-2">
                      {is32(r.type) ? (
                        cellSelect(rid(r, "wordOrder"), `${tm.colWordOrder}, ${label}`, r.wordOrder || "high-first", WORD_ORDERS.map((x) => [x, tm.wordOrders[x]]), (v) => update(r.key, { wordOrder: v }), err.wordOrder, "w-36")
                      ) : (
                        <span aria-hidden className="inline-block py-2">
                          —
                        </span>
                      )}
                    </td>
                    {modular ? (
                      <td className="px-2 py-2">
                        {cellSelect(rid(r, "scope"), `${tm.colScope}, ${label}`, r.scope || "module", [
                          ["module", tm.scopes.module],
                          ["master", tm.scopes.master],
                        ], (v) => update(r.key, { scope: v }), err.scope)}
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      <span className="inline-block py-1.5">
                        <Chip tone={SOURCE[source].tone} icon={SOURCE[source].icon} label={t.sources[source]} size="sm" />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {changed ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          id={rid(r, "reset")}
                          onClick={() => {
                            const base = rowOf(r.base!, "model", r.base);
                            update(r.key, { ...base, key: r.key });
                            setAnnouncement(t.reset(r.pointKey));
                          }}
                        >
                          <RotateCcw aria-hidden />
                          <span className="sr-only">{t.reset(r.pointKey)}</span>
                        </Button>
                      ) : null}
                      {r.origin === "device" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          id={rid(r, "remove")}
                          className="text-critical-fg hover:text-critical-fg"
                          onClick={() => {
                            const index = rows.indexOf(r);
                            const next = rows.filter((x) => x.key !== r.key);
                            setRows(next);
                            const neighbour = next.slice(index).find((x) => x.origin === "device") ?? next.slice(0, index).reverse().find((x) => x.origin === "device");
                            focusLater(neighbour ? rid(neighbour, "remove") : `${uid}-add`);
                            setAnnouncement(tm.removed(label));
                          }}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">{a.removeDevice(label)}</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            id={`${uid}-add`}
            aria-disabled={rows.length >= REGISTERS_MAX || undefined}
            onClick={() => {
              if (rows.length >= REGISTERS_MAX) return;
              const row = rowOf({ fc: 4, type: "uint16" }, "device");
              setRows((rs) => [...rs, row]);
              focusLater(rid(row, "key"));
              setAnnouncement(tm.addedRegister(rows.length + 1));
            }}
          >
            <Plus aria-hidden />
            {t.addRegister}
          </Button>
        </div>
      </section>

      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-notes`}>{t.notes}</Label>
        <Textarea id={`${uid}-notes`} value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} {...fieldProps(show, `${uid}-notes`, top.notes)} />
        {fieldError(show, `${uid}-notes`, top.notes)}
      </div>

      <p role="status" className="text-sm text-text-secondary">
        {show && errorCount ? t.errInList(errorCount) : ""}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex justify-end">
        <Button type="submit" className="h-10" aria-disabled={working || undefined}>
          {working ? a.saving : a.save}
        </Button>
      </div>
    </form>
  );
}
