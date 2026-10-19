// TimescaleDB reads and writes for device models (profiles, fault_bits) and per-device Modbus settings
// (devices.modbus), see register-map.ts. Shared by the admin API (lib/access/models.ts), the CLIs and the
// ingest schema seeding, so it takes any client with pg's query() and imports no driver or SDK.

import type { DeviceModbus, FaultBitRow, ModelDef, ModelSpec, ModelSummary } from "./register-map";

/** The database calls made here; a pg Pool or PoolClient fits. */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/** A pool that lends a connection for a transaction; a pg Pool fits. */
export interface SqlPool extends SqlClient {
  connect(): Promise<SqlClient & { release(): void }>;
}

/** Run `work` in one transaction on one connection of the pool. */
export async function inTransaction<T>(pool: SqlPool, work: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** A row version: its update time in whole milliseconds. */
export const versionSql = (column: string) => `floor(extract(epoch FROM ${column}) * 1000)::float8`;

/** Postgres error codes of a database the ingest schema has not been applied to yet. */
export const isMissingSchema = (e: unknown) => ["42P01", "42703"].includes((e as { code?: string }).code ?? "");

interface ModelRow {
  id: string;
  kind: string;
  vendor: string;
  model: string;
  spec: ModelSpec;
  version: number;
}

const MODEL_COLUMNS = `id, kind, vendor, model, spec, ${versionSql("updated_at")} AS version`;

/** Replace a model's fault bits. */
export async function writeFaultBits(client: SqlClient, id: string, bits: FaultBitRow[]): Promise<void> {
  await client.query("DELETE FROM fault_bits WHERE profile = $1", [id]);
  if (!bits.length) return;
  await client.query(
    "INSERT INTO fault_bits (profile, word, bit, code, severity, en, th) SELECT $1::text, * FROM unnest($2::text[], $3::smallint[], $4::text[], $5::text[], $6::text[], $7::text[])",
    [id, bits.map((b) => b.word), bits.map((b) => b.bit), bits.map((b) => b.code), bits.map((b) => b.severity), bits.map((b) => b.en.trim()), bits.map((b) => b.th.trim())],
  );
}

/** Write a checked model and its fault bits (one transaction is the caller's). */
export async function writeModel(client: SqlClient, m: ModelDef, by: string | null): Promise<void> {
  await client.query(
    `INSERT INTO profiles (id, kind, vendor, model, spec, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5::jsonb, now(), $6)
     ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, vendor = EXCLUDED.vendor, model = EXCLUDED.model, spec = EXCLUDED.spec,
       updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [m.id, m.kind, m.vendor.trim(), m.model.trim(), JSON.stringify(m.spec), by],
  );
  await writeFaultBits(client, m.id, m.faultBits);
}

/** Add a model written in code when the database does not have it yet; true when added. */
export async function addSeedModel(client: SqlClient, m: ModelDef): Promise<boolean> {
  const { rowCount } = await client.query(
    "INSERT INTO profiles (id, kind, vendor, model, spec, updated_by) VALUES ($1, $2, $3, $4, $5::jsonb, 'seed') ON CONFLICT (id) DO NOTHING",
    [m.id, m.kind, m.vendor, m.model, JSON.stringify(m.spec)],
  );
  if (!rowCount) return false;
  await writeFaultBits(client, m.id, m.faultBits);
  return true;
}

/** Every model, by vendor and model, with how many registers, fault bits and devices it has. */
export async function readModelSummaries(client: SqlClient): Promise<ModelSummary[]> {
  const { rows } = await client.query(
    `SELECT p.id, p.kind, p.vendor, p.model, jsonb_array_length(p.spec->'registers') AS registers,
            (SELECT count(*) FROM fault_bits b WHERE b.profile = p.id)::int AS fault_bits,
            (SELECT count(*) FROM devices d WHERE d.profile = p.id)::int AS devices,
            ${versionSql("p.updated_at")} AS version, p.updated_by
     FROM profiles p ORDER BY p.vendor, p.model, p.id`,
  );
  return (rows as (ModelRow & { registers: number; fault_bits: number; devices: number; updated_by: string | null })[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    vendor: r.vendor,
    model: r.model,
    registers: Number(r.registers),
    faultBits: Number(r.fault_bits),
    devices: Number(r.devices),
    updatedAt: r.version === null ? null : Number(r.version),
    updatedBy: r.updated_by,
  }));
}

/** Models with their fault bits (all, or those with these ids), and their versions. */
export async function readModels(client: SqlClient, ids?: string[]): Promise<{ def: ModelDef; version: number }[]> {
  const { rows } = ids
    ? await client.query(`SELECT ${MODEL_COLUMNS} FROM profiles WHERE id = ANY($1::text[])`, [ids])
    : await client.query(`SELECT ${MODEL_COLUMNS} FROM profiles`);
  const models = rows as ModelRow[];
  if (!models.length) return [];
  const { rows: bits } = await client.query("SELECT profile, word, bit, code, severity, en, th FROM fault_bits WHERE profile = ANY($1::text[]) ORDER BY profile, word, bit", [
    models.map((m) => m.id),
  ]);
  return models.map((m) => ({
    def: {
      id: m.id,
      kind: m.kind,
      vendor: m.vendor,
      model: m.model,
      spec: m.spec,
      faultBits: (bits as (FaultBitRow & { profile: string })[])
        .filter((b) => b.profile === m.id)
        .map((b) => ({ word: b.word, bit: Number(b.bit), code: b.code, severity: b.severity, en: b.en, th: b.th })),
    },
    version: Number(m.version),
  }));
}

/** A device's Modbus settings and the row's version; null when the device has no row yet. */
export interface DeviceModbusRow {
  device: string;
  gateway: string;
  profile: string | null;
  modbus: DeviceModbus | null;
  version: number | null;
}

export async function readDeviceModbus(client: SqlClient, project: string, forUpdate = false): Promise<DeviceModbusRow[]> {
  const { rows } = await client.query(
    `SELECT device, gateway, profile, modbus, ${versionSql("modbus_at")} AS version FROM devices WHERE project = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [project],
  );
  return (rows as DeviceModbusRow[]).map((r) => ({ ...r, version: r.version === null ? null : Number(r.version) }));
}
