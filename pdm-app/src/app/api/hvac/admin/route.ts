// Admin page of the live /hvac module (operators only, see authorizeOperator):
//   GET  /api/hvac/admin                      → Overview: customers, registered projects, accounts and the latest audit entries
//   GET  /api/hvac/admin?registry=<project>   → RegistryView: a plant's device registry, for the editor
//   GET  /api/hvac/admin?registry=<project>&new=1 → RegistryView of a project that sends data, before it is registered
//   GET  /api/hvac/admin?models               → ModelSummary[]: every device model (register map)
//   GET  /api/hvac/admin?model=<id>           → ModelView: one device model, for its editor
//   GET  /api/hvac/admin?modbus=<project>     → PlantModbusView: a plant's devices with their Modbus settings
//   GET  /api/hvac/admin?notify=<project>     → NotifyView: a plant's alarm email settings
//   POST /api/hvac/admin   { action, ... } (AdminRequest in lib/access/model.ts)
//                          → { ok: true, ... } or { error: <AccessErrorCode>, ids, message } (400 / 404 / 409 / 503)
// Browsers never write to Firestore, Firebase Auth or TimescaleDB themselves; every change goes through
// here and lib/access/admin.ts or models.ts, which check it and write the audit log.

import { AccessAdmin, AccessError, accountRow } from "@/lib/access/admin";
import type { Access, AccessErrorCode, AdminRequest } from "@/lib/access/model";
import type { NotifyConfig } from "@/lib/notify/config";
import { ModelAdmin } from "@/lib/access/models";
import { DEVICES_MAX, LOGO_MAX, type RegistryDevice, type RegistryFile } from "@/lib/access/registry";
import { cleanDeviceModbus, cleanModel, readModelFile, type DeviceModbus } from "@/lib/telemetry/register-map";
import { authorizeOperator } from "@/lib/server/admin-auth";
import { adminApp } from "@/lib/server/admin";
import { forgetProjects } from "@/lib/server/registry";
import { historyConfigured, timescale } from "@/lib/server/timescale";

const NO_STORE = { "cache-control": "no-store" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });

let admin: AccessAdmin | null = null;
const accessAdmin = () => (admin ??= new AccessAdmin(adminApp()));
let models: ModelAdmin | null = null;
const modelAdmin = () => (models ??= new ModelAdmin(accessAdmin()));
/** TimescaleDB for device register profiles; null when DATABASE_URL is not set. */
const sql = () => (historyConfigured() ? timescale() : null);

export async function GET(request: Request) {
  const actor = await authorizeOperator(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const project = params.get("registry");
  try {
    if (project !== null) return json(await accessAdmin().registry(project, sql(), { unregistered: params.get("new") === "1" }));
    if (params.has("models")) return json(await modelAdmin().summaries(sql()));
    const model = params.get("model");
    if (model !== null) return json(await modelAdmin().model(model, sql()));
    const modbus = params.get("modbus");
    if (modbus !== null) return json(await modelAdmin().plantModbus(modbus, sql()));
    const notify = params.get("notify");
    if (notify !== null) return json(await accessAdmin().notifySettings(notify));
    return json(await accessAdmin().overview(actor.uid!));
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: Request) {
  const actor = await authorizeOperator(request);
  if (actor instanceof Response) return actor;
  const body = parse(await request.json().catch(() => null));
  if (!body) return json({ error: "bad-request", ids: [], message: "unknown or malformed request" }, 400);
  const a = accessAdmin();
  try {
    switch (body.action) {
      case "saveOrg":
        return json({ ok: true, ...(await a.saveOrg(actor, body.org, body.name, body.mode)) });
      case "deleteOrg":
        await a.deleteOrg(actor, body.org);
        return json({ ok: true });
      case "assignProjects": {
        const result = await a.assignProjects(actor, body.org, body.add, body.remove);
        forgetProjects([...body.add, ...body.remove]);
        return json({ ok: true, ...result });
      }
      case "createAccount":
        return json({ ok: true, account: accountRow(await a.createAccount(actor, body.email, body.access)) });
      case "setAccess": {
        const { after, changed } = await a.setAccess(actor, body.uid, body.access);
        return json({ ok: true, access: after, changed });
      }
      case "setDisabled":
        return json({ ok: true, account: accountRow(await a.setDisabled(actor, body.uid, body.disabled)) });
      case "passwordLink":
        return json({ ok: true, link: await a.passwordLink(actor, body.uid) });
      case "saveModel":
        return json({ ok: true, ...(await modelAdmin().saveModel(actor, body.model, sql(), { mode: body.mode, version: body.version })) });
      case "deleteModel":
        await modelAdmin().deleteModel(actor, body.id, sql());
        return json({ ok: true });
      case "saveModbus":
        return json({ ok: true, ...(await modelAdmin().saveModbus(actor, body.project, body.device, body.modbus, sql(), body.version)) });
      case "saveNotify":
        return json({ ok: true, ...(await a.saveNotify(actor, body.project, body.config)) });
      case "testNotify":
        // The link in the email points at this site unless NOTIFY_SITE_URL names another address.
        return json({ ok: true, ...(await a.testNotify(actor, body.project, body.config, process.env.NOTIFY_SITE_URL || new URL(request.url).origin)) });
      case "saveRegistry": {
        const result = await a.saveRegistry(actor, body.file, sql(), { mode: body.mode, version: body.version });
        forgetProjects([body.file.project]);
        return json({ ok: true, ...result });
      }
    }
  } catch (e) {
    return failure(e);
  }
}

function failure(e: unknown) {
  if (e instanceof AccessError) {
    // The database's own message (host, driver) stays in the server log.
    if (e.code === "db-unavailable" || e.code === "db-not-ready") {
      console.error("[admin]", e.message);
      return json({ error: e.code, ids: e.ids, message: e.code === "db-not-ready" ? "the history database has no device models yet (npm run migrate)" : "the history database (TimescaleDB) is not available" }, 503);
    }
    return json({ error: e.code, ids: e.ids, message: e.message }, STATUS[e.code] ?? 409);
  }
  console.error("[admin] request failed", e);
  return json({ error: "failed", ids: [], message: "the change could not be made" }, 500);
}

const STATUS: Partial<Record<AccessErrorCode, number>> = {
  "bad-id": 400,
  "bad-name": 400,
  "bad-email": 400,
  "bad-request": 400,
  "bad-registry": 400,
  "bad-model": 400,
  "bad-modbus": 400,
  "model-missing": 404,
  "device-missing": 404,
  "org-missing": 404,
  "account-missing": 404,
  "project-missing": 404,
  "bad-notify": 400,
};

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= 320;
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && v.every(isText);
const isAccess = (v: unknown): v is Access => {
  const x = v as Partial<Access> | null;
  return typeof x === "object" && x !== null && typeof x.admin === "boolean" && isTexts(x.orgs) && isTexts(x.projects);
};

/** A project file with only its known fields, if it is shaped like one; values are checked in lib/access/registry.ts. */
function registryFile(v: unknown): RegistryFile | null {
  const f = v as Record<string, unknown> | null;
  if (typeof f !== "object" || f === null || !isText(f.project) || !Array.isArray(f.devices) || f.devices.length > DEVICES_MAX) return null;
  const optional = (x: unknown, max = 320) => x === undefined || (typeof x === "string" && x.length <= max);
  if (!optional(f.name) || !optional(f.ownerLogo, LOGO_MAX)) return null;
  const devices: RegistryDevice[] = [];
  for (const raw of f.devices as unknown[]) {
    const d = raw as Record<string, unknown> | null;
    if (typeof d !== "object" || d === null || !isText(d.id) || !isText(d.kind)) return null;
    if (![d.name, d.label, d.profile, d.meterFor, d.role].every((x) => optional(x)) || !(d.capacityTon === undefined || typeof d.capacityTon === "number")) return null;
    devices.push({
      id: d.id,
      kind: d.kind,
      ...(d.name !== undefined ? { name: d.name as string } : {}),
      ...(d.label !== undefined ? { label: d.label as string } : {}),
      ...(d.profile !== undefined ? { profile: d.profile as string } : {}),
      ...(d.capacityTon !== undefined ? { capacityTon: d.capacityTon as number } : {}),
      ...(d.meterFor !== undefined ? { meterFor: d.meterFor as string } : {}),
      ...(d.role !== undefined ? { role: d.role as string } : {}),
    });
  }
  return { project: f.project, ...(f.name !== undefined ? { name: f.name as string } : {}), ...(f.ownerLogo !== undefined ? { ownerLogo: f.ownerLogo as string } : {}), devices };
}

/** Alarm email settings if shaped like them; addresses and limits are checked in lib/access/admin.ts. */
function notifyConfig(v: unknown): NotifyConfig | null {
  const c = v as Record<string, unknown> | null;
  if (typeof c !== "object" || c === null || typeof c.enabled !== "boolean" || typeof c.cleared !== "boolean" || !isTexts(c.recipients)) return null;
  if (c.minSeverity !== "critical" && c.minSeverity !== "warning") return null;
  if (c.locale !== "th" && c.locale !== "en") return null;
  return { enabled: c.enabled, recipients: c.recipients, minSeverity: c.minSeverity, cleared: c.cleared, locale: c.locale };
}

/** A version sent back with a save: a number, or null for something never saved; undefined when neither. */
const version = (v: unknown): number | null | undefined => (v === null || (typeof v === "number" && Number.isFinite(v)) ? v : undefined);

/** The request if it has the shape of one of the actions; checked again in lib/access/admin.ts and models.ts. */
function parse(v: unknown): AdminRequest | null {
  const b = v as Record<string, unknown> | null;
  if (typeof b !== "object" || b === null) return null;
  switch (b.action) {
    case "saveOrg":
      return isText(b.org) && isText(b.name) && (b.mode === "create" || b.mode === "rename") ? { action: b.action, org: b.org, name: b.name, mode: b.mode } : null;
    case "deleteOrg":
      return isText(b.org) ? { action: b.action, org: b.org } : null;
    case "assignProjects":
      return isText(b.org) && isTexts(b.add) && isTexts(b.remove) ? { action: b.action, org: b.org, add: b.add, remove: b.remove } : null;
    case "createAccount":
      return isText(b.email) && isAccess(b.access) ? { action: b.action, email: b.email, access: b.access } : null;
    case "setAccess":
      return isText(b.uid) && isAccess(b.access) ? { action: b.action, uid: b.uid, access: b.access } : null;
    case "setDisabled":
      return isText(b.uid) && typeof b.disabled === "boolean" ? { action: b.action, uid: b.uid, disabled: b.disabled } : null;
    case "passwordLink":
      return isText(b.uid) ? { action: b.action, uid: b.uid } : null;
    case "saveModel": {
      const model = readModelFile(b.model);
      return model && version(b.version) !== undefined && (b.mode === "create" || b.mode === "edit")
        ? { action: b.action, mode: b.mode, model: cleanModel(model), version: version(b.version)! }
        : null;
    }
    case "deleteModel":
      return isText(b.id) ? { action: b.action, id: b.id } : null;
    case "saveModbus":
      return isText(b.project) && isText(b.device) && typeof b.modbus === "object" && b.modbus !== null && !Array.isArray(b.modbus) && version(b.version) !== undefined
        ? { action: b.action, project: b.project, device: b.device, modbus: cleanDeviceModbus(b.modbus as DeviceModbus), version: version(b.version)! }
        : null;
    case "saveNotify":
    case "testNotify": {
      const config = notifyConfig(b.config);
      return isText(b.project) && config ? { action: b.action, project: b.project, config } : null;
    }
    case "saveRegistry": {
      const file = registryFile(b.file);
      const v = version(b.version);
      return file && v !== undefined && (b.mode === "create" || b.mode === "edit") ? { action: b.action, mode: b.mode, file, version: v } : null;
    }
    default:
      return null;
  }
}
