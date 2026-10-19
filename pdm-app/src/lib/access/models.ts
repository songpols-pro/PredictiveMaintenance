// Device models (register maps and fault bits) and each device's Modbus settings: the operations behind
// the admin page's Models tab and Modbus dialog (/hvac/admin, through /api/hvac/admin). They live in
// TimescaleDB (lib/telemetry/register-store.ts); every change is checked here (lib/telemetry/register-map.ts)
// and written to the audit log (Firestore adminLog). Server side only, without "server-only" or "@/"
// imports, like admin.ts.

import { DEVICE_KINDS } from "../telemetry/catalog";
import { DEVICE_ID } from "../telemetry/contract";
import {
  deviceModbusProblems,
  modelProblemText,
  modelProblems,
  type DeviceModbus,
  type ModelDef,
  type ModelSummary,
  type RegisterOverride,
} from "../telemetry/register-map";
import { inTransaction, readDeviceModbus, readModels, readModelSummaries, versionSql, writeModel, type SqlPool } from "../telemetry/register-store";
import { AccessAdmin, AccessError, dbFailure, type Actor } from "./admin";
import { ID } from "./model";
import { fileFromStored } from "./registry";

/** A model as the editor opens it: the model, its version, and the devices that use it. */
export interface ModelView {
  def: ModelDef;
  version: number;
  usage: { project: string; device: string }[];
}

/** One device of a plant in the Modbus dialog. */
export interface ModbusDevice {
  id: string;
  kind: string;
  name: string;
  profile: string | null;
  /** Gateway the device's data last came through; null before its first message. */
  seenGateway: string | null;
  modbus: DeviceModbus | null;
  /** When its settings were last saved (ms); sent back with a save so it cannot overwrite a newer one. */
  version: number | null;
}

/** A plant's devices with their Modbus settings, and the models they use (for the maps and the export). */
export interface PlantModbusView {
  project: string;
  name: string;
  devices: ModbusDevice[];
  models: ModelDef[];
}

const need = (sql: SqlPool | null, ids: string[]): SqlPool => {
  if (!sql) throw new AccessError("db-unavailable", "the history database (TimescaleDB) is not configured: DATABASE_URL is not set", ids);
  return sql;
};

/** JSON with object keys sorted (jsonb does not keep their order), for comparing settings. */
const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null);

/** Settings without empty values; null when nothing is left. */
function cleanModbus(d: DeviceModbus): DeviceModbus | null {
  const serial = Object.fromEntries(Object.entries(d.serial ?? {}).filter(([, v]) => v !== undefined && (v as unknown) !== ""));
  const registers = (d.registers ?? []).map((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as RegisterOverride);
  const out: DeviceModbus = {
    ...(d.gateway ? { gateway: d.gateway } : {}),
    ...(d.port?.trim() ? { port: d.port.trim() } : {}),
    ...(d.slaveId !== undefined ? { slaveId: d.slaveId } : {}),
    ...(d.module ? { module: d.module } : {}),
    ...(Object.keys(serial).length ? { serial } : {}),
    ...(d.addressing ? { addressing: d.addressing } : {}),
    ...(registers.length ? { registers } : {}),
    ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
  };
  return Object.keys(out).length ? out : null;
}

export class ModelAdmin {
  constructor(private readonly access: AccessAdmin) {}

  /** Every device model, with its counts. */
  async summaries(sql: SqlPool | null): Promise<ModelSummary[]> {
    try {
      return await readModelSummaries(need(sql, []));
    } catch (e) {
      throw dbFailure(e);
    }
  }

  async model(id: string, sql: SqlPool | null): Promise<ModelView> {
    if (!ID.test(id)) throw new AccessError("bad-id", `not a model id: ${id}`, [id]);
    try {
      const db = need(sql, [id]);
      const [found] = await readModels(db, [id]);
      if (!found) throw new AccessError("model-missing", `no device model ${id}`, [id]);
      const { rows } = await db.query("SELECT project, device FROM devices WHERE profile = $1 ORDER BY project, device", [id]);
      return { ...found, usage: rows as { project: string; device: string }[] };
    } catch (e) {
      throw dbFailure(e, [id]);
    }
  }

  /**
   * Create a model ("create" refuses an id in use) or replace one ("edit", refused when it was saved since
   * `version`). Its kind of device can only change while no device uses it, because devices only take
   * models of their own kind.
   */
  async saveModel(actor: Actor, def: ModelDef, sql: SqlPool | null, { mode, version = null }: { mode: "create" | "edit"; version?: number | null }): Promise<{ created: boolean }> {
    const problems = modelProblems(def);
    if (problems.length) {
      const where = [...new Set(problems.map((p) => (p.section && p.index !== undefined ? `${p.section} #${p.index + 1}` : p.code)))];
      throw new AccessError("bad-model", problems.map((p) => modelProblemText(def, p)).join("; "), where);
    }
    const id = def.id;
    try {
      const created = await inTransaction(need(sql, [id]), async (db) => {
        const { rows } = await db.query(`SELECT kind, ${versionSql("updated_at")} AS version FROM profiles WHERE id = $1 FOR UPDATE`, [id]);
        const before = rows[0] as { kind: string; version: number } | undefined;
        if (mode === "create" && before) throw new AccessError("model-exists", `device model id ${id} is already in use`, [id]);
        if (mode === "edit" && !before) throw new AccessError("model-missing", `no device model ${id}`, [id]);
        if (mode === "edit" && Number(before!.version) !== version) throw new AccessError("registry-changed", `device model ${id} was saved by someone else meanwhile`, [id]);
        if (before && before.kind !== def.kind) {
          const { rows: users } = await db.query("SELECT project || '/' || device AS id FROM devices WHERE profile = $1 LIMIT 20", [id]);
          if (users.length) throw new AccessError("model-in-use", `devices use ${id}, so its kind of device cannot change`, (users as { id: string }[]).map((u) => u.id));
        }
        await writeModel(db, def, actor.email);
        return !before;
      });
      await this.access.record(actor, created ? "model.create" : "model.update", id, {
        name: `${def.vendor.trim()} ${def.model.trim()}`,
        registers: def.spec.registers.length,
        faultBits: def.faultBits.length,
      });
      return { created };
    } catch (e) {
      throw dbFailure(e, [id]);
    }
  }

  /**
   * Delete a model no device uses and no alarm was raised under: alarm history keeps the model's id and
   * takes its fault names from it.
   */
  async deleteModel(actor: Actor, id: string, sql: SqlPool | null): Promise<void> {
    if (!ID.test(id)) throw new AccessError("bad-id", `not a model id: ${id}`, [id]);
    try {
      const name = await inTransaction(need(sql, [id]), async (db) => {
        const { rows } = await db.query("SELECT vendor || ' ' || model AS name FROM profiles WHERE id = $1 FOR UPDATE", [id]);
        if (!rows.length) throw new AccessError("model-missing", `no device model ${id}`, [id]);
        const { rows: users } = await db.query("SELECT project || '/' || device AS id FROM devices WHERE profile = $1 LIMIT 20", [id]);
        if (users.length) throw new AccessError("model-in-use", `devices still use ${id}`, (users as { id: string }[]).map((u) => u.id));
        const { rows: alarms } = await db.query("SELECT 1 FROM alarms WHERE profile = $1 LIMIT 1", [id]);
        if (alarms.length) throw new AccessError("model-has-alarms", `alarms were raised under ${id}; their names come from it`, [id]);
        await db.query("DELETE FROM fault_bits WHERE profile = $1", [id]);
        await db.query("DELETE FROM profiles WHERE id = $1", [id]);
        return (rows[0] as { name: string }).name;
      });
      await this.access.record(actor, "model.delete", id, { name });
    } catch (e) {
      throw dbFailure(e, [id]);
    }
  }

  /** A plant's devices, in screen order, with their Modbus settings and the models they use. */
  async plantModbus(project: string, sql: SqlPool | null): Promise<PlantModbusView> {
    if (!ID.test(project)) throw new AccessError("bad-id", `not a project id: ${project}`, [project]);
    const snap = await this.access.db.doc(`projects/${project}`).get();
    if (!snap.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
    const file = fileFromStored(project, snap.data());
    try {
      const db = need(sql, [project]);
      const rows = new Map((await readDeviceModbus(db, project)).map((r) => [r.device, r]));
      const profiles = [...new Set([...rows.values()].map((r) => r.profile).filter((p): p is string => Boolean(p)))];
      const models = profiles.length ? (await readModels(db, profiles)).map((m) => m.def) : [];
      return {
        project,
        name: file.name ?? project,
        devices: file.devices.map((d) => {
          const r = rows.get(d.id);
          return {
            id: d.id,
            kind: d.kind,
            name: d.name ?? d.id,
            profile: r?.profile ?? null,
            seenGateway: r?.gateway || null,
            modbus: r?.modbus ?? null,
            version: r?.version ?? null,
          };
        }),
        models,
      };
    } catch (e) {
      throw dbFailure(e, [project]);
    }
  }

  /** Save one device's Modbus settings, unless they were saved since `version`. */
  async saveModbus(actor: Actor, project: string, device: string, modbus: DeviceModbus, sql: SqlPool | null, version: number | null): Promise<{ changed: boolean }> {
    if (!ID.test(project) || !DEVICE_ID.test(device)) throw new AccessError("bad-id", `not a device: ${project}/${device}`, [`${project}/${device}`]);
    const target = `${project}/${device}`;
    const snap = await this.access.db.doc(`projects/${project}`).get();
    if (!snap.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
    const entry = (snap.get("devices") as Record<string, { kind?: string }> | undefined)?.[device];
    if (!entry || !(DEVICE_KINDS as string[]).includes(entry.kind ?? "")) throw new AccessError("device-missing", `${device} is not in the device list of ${project}`, [target]);
    const settings = cleanModbus(modbus);
    try {
      const changed = await inTransaction(need(sql, [target]), async (db) => {
        const { rows } = await db.query(`SELECT profile, modbus, ${versionSql("modbus_at")} AS version FROM devices WHERE project = $1 AND device = $2 FOR UPDATE`, [project, device]);
        const row = rows[0] as { profile: string | null; modbus: DeviceModbus | null; version: number | null } | undefined;
        if ((row?.version === null || row?.version === undefined ? null : Number(row.version)) !== version) {
          throw new AccessError("registry-changed", `the Modbus settings of ${target} were saved by someone else meanwhile`, [target]);
        }
        const model = row?.profile ? ((await readModels(db, [row.profile]))[0]?.def ?? null) : null;
        const problems = settings ? deviceModbusProblems(settings, model) : [];
        if (problems.length) {
          throw new AccessError("bad-modbus", problems.map((p) => modelProblemText({ id: target }, p)).join("; "), [
            ...new Set(problems.map((p) => (p.index !== undefined ? `#${p.index + 1}` : p.code))),
          ]);
        }
        if (stable(row?.modbus ?? null) === stable(settings)) return false;
        await db.query(
          `INSERT INTO devices AS d (project, device, gateway, modbus, modbus_at) VALUES ($1, $2, '', $3::jsonb, now())
           ON CONFLICT (project, device) DO UPDATE SET modbus = EXCLUDED.modbus, modbus_at = now()`,
          [project, device, settings === null ? null : JSON.stringify(settings)],
        );
        return true;
      });
      if (changed) {
        await this.access.record(actor, "device.modbus", target, {
          ...(settings?.gateway ? { gateway: settings.gateway } : {}),
          ...(settings?.port ? { port: settings.port } : {}),
          ...(settings?.slaveId !== undefined ? { slaveId: settings.slaveId } : {}),
          ...(settings?.module ? { module: settings.module } : {}),
          overrides: settings?.registers?.length ?? 0,
        });
      }
      return { changed };
    } catch (e) {
      throw dbFailure(e, [target]);
    }
  }
}
