// TimescaleDB schema for the history store, applied idempotently at every start (and by `npm run migrate`).
//
//   telemetry      one row per point per cycle (narrow), hypertable, compressed after COMPRESS_AFTER
//   telemetry_1h   hourly avg/min/max/last per point (continuous aggregate) for long trend ranges and reports
//   events         state changes from the event channel (ordered by ts, then received_at), plus system points:
//                    device "_gateway", point "_online"  gateway connectivity (status channel)
//                    point "_comm"                       a device stopped or started answering Modbus
//   devices        every device seen or registered per project: gateway, device model (profile), how it is wired
//                  and read (modbus), last reading, communication state
//   gateways       every gateway: online state, firmware, interval, last cycle, last seq
//   profiles       device models: register map (spec) of each model; edited on the admin page (/hvac/admin)
//   fault_bits     meaning of each fault-word bit per device model (edited with it)
//   fault_words    latest value of each fault word per device, with its time
//   alarms         one row per fault occurrence: opened when its bit sets, closed when it clears
//
// Writes go through the ingest_* functions so one MQTT message is one round trip and one transaction:
// the database may be far away (Tiger Cloud free tier is US East only) and messages are handled in order.

import type pg from "pg";
import { SEED_MODELS } from "../../../pdm-app/src/lib/telemetry/profiles";
import { modelProblemText, modelProblems } from "../../../pdm-app/src/lib/telemetry/register-map";
import { addSeedModel } from "../../../pdm-app/src/lib/telemetry/register-store";

export interface SchemaOptions {
  /** Compress raw chunks older than this ("1 day" in development, "7 days" in production). */
  compressAfter: string;
  /** Drop raw telemetry and events older than this; empty keeps everything. */
  retention: string;
}

const TABLES = `
CREATE TABLE IF NOT EXISTS telemetry (
  ts      timestamptz      NOT NULL,
  project text             NOT NULL,
  device  text             NOT NULL,
  point   text             NOT NULL,
  value   double precision,
  UNIQUE (project, device, point, ts)
);
SELECT create_hypertable('telemetry', by_range('ts', INTERVAL '1 day'), if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS events (
  ts      timestamptz      NOT NULL,
  project text             NOT NULL,
  gateway text             NOT NULL,
  device  text             NOT NULL,
  point   text             NOT NULL,
  value   double precision,
  -- Arrival order: ts has whole seconds, and a quick reconnect logs offline and online in the same second.
  received_at timestamptz NOT NULL DEFAULT now(),
  -- A redelivered message repeats every column but received_at. Distinct changes may share a second (offline then online
  -- on a quick reconnect) and system points repeat across gateways ("_gateway"), so all columns are the key.
  UNIQUE NULLS NOT DISTINCT (project, gateway, device, point, ts, value)
);
SELECT create_hypertable('events', by_range('ts', INTERVAL '30 days'), if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS devices (
  project       text        NOT NULL,
  device        text        NOT NULL,
  gateway       text        NOT NULL,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz,
  comm_ok       boolean,
  comm_at       timestamptz,
  last_error    text,
  last_error_at timestamptz,
  PRIMARY KEY (project, device)
);

-- Device model (profiles.id): set with the device list (admin page, npm run registry) or npm run set-profile.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS profile text;
-- How the device is wired and read, and how its register map differs from its model's (DeviceModbus in
-- pdm-app/src/lib/telemetry/register-map.ts), set on the admin page; modbus_at is when it was saved.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS modbus jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS modbus_at timestamptz;

-- Device models: the register map of each model (spec: addressing, serial defaults, modules, registers;
-- ModelSpec in pdm-app/src/lib/telemetry/register-map.ts), with the meaning of its fault bits in fault_bits.
-- Edited on the admin page; the models in pdm-app/src/lib/telemetry/profiles are added when missing.
CREATE TABLE IF NOT EXISTS profiles (
  id         text        PRIMARY KEY,
  kind       text        NOT NULL,
  vendor     text        NOT NULL,
  model      text        NOT NULL,
  spec       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS fault_bits (
  profile  text     NOT NULL,
  word     text     NOT NULL,
  bit      smallint NOT NULL,
  code     text     NOT NULL,
  severity text     NOT NULL,
  en       text     NOT NULL,
  th       text     NOT NULL,
  PRIMARY KEY (profile, word, bit)
);

CREATE TABLE IF NOT EXISTS fault_words (
  project text        NOT NULL,
  device  text        NOT NULL,
  word    text        NOT NULL,
  value   bigint      NOT NULL,
  ts      timestamptz NOT NULL,
  PRIMARY KEY (project, device, word)
);

CREATE TABLE IF NOT EXISTS alarms (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project    text        NOT NULL,
  gateway    text        NOT NULL,
  device     text        NOT NULL,
  profile    text        NOT NULL,
  word       text        NOT NULL,
  bit        smallint    NOT NULL,
  -- From fault_bits; a set bit the profile does not list becomes "<word>_bit<n>" so it is not missed.
  code       text        NOT NULL,
  severity   text        NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz,
  acked_at   timestamptz,
  acked_by   text
);
-- At most one open alarm per fault and device.
CREATE UNIQUE INDEX IF NOT EXISTS alarms_open ON alarms (project, device, code) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS alarms_by_time ON alarms (project, started_at DESC);

CREATE TABLE IF NOT EXISTS gateways (
  project    text        NOT NULL,
  gateway    text        NOT NULL,
  state      text,
  state_at   timestamptz,
  fw         text,
  interval_s integer,
  last_ts    timestamptz,
  last_seen  timestamptz,
  last_seq   bigint,
  PRIMARY KEY (project, gateway)
);
`;

const FUNCTIONS = `
-- Replace every ingest function, whatever its previous signature. migrate() runs this whole block in one
-- transaction: other sessions keep using the old versions until it commits, then see the new ones.
DO $drop$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = current_schema() AND p.proname IN ('apply_fault_words', 'ingest_telemetry', 'ingest_event', 'ingest_status')
  LOOP
    EXECUTE 'DROP FUNCTION ' || f;
  END LOOP;
END
$drop$;

-- Fault words in one message → alarms. Only devices with a register profile, only words that profile
-- defines, and only values newer than the stored word: a buffered (older) cycle or a redelivered message
-- cannot reopen or close anything. A device that did not answer (no value) leaves its alarms as they are.
CREATE OR REPLACE FUNCTION apply_fault_words(
  p_project text, p_gateway text, p_ts timestamptz,
  p_devices text[], p_points text[], p_values double precision[],
  OUT changes jsonb
) LANGUAGE plpgsql AS $fn$
DECLARE
  f_device text[];
  f_word text[];
  f_value bigint[];
  f_profile text[];
  v_closed jsonb;
  v_opened jsonb;
BEGIN
  changes := '[]'::jsonb;
  SELECT array_agg(x.device), array_agg(x.point), array_agg(x.value::bigint), array_agg(d.profile)
  INTO f_device, f_word, f_value, f_profile
  FROM unnest(p_devices, p_points, p_values) AS x(device, point, value)
  JOIN devices d ON d.project = p_project AND d.device = x.device AND d.profile IS NOT NULL
  LEFT JOIN fault_words w ON w.project = p_project AND w.device = x.device AND w.word = x.point
  WHERE x.value IS NOT NULL
    AND (w.ts IS NULL OR p_ts > w.ts)
    AND EXISTS (SELECT 1 FROM fault_bits b WHERE b.profile = d.profile AND b.word = x.point);
  IF f_device IS NULL THEN
    RETURN;
  END IF;

  WITH done AS (
    UPDATE alarms a SET ended_at = p_ts
    FROM unnest(f_device, f_word, f_value) AS f(device, word, value)
    WHERE a.project = p_project AND a.device = f.device AND a.word = f.word AND a.ended_at IS NULL
      AND (f.value & (1::bigint << a.bit)) = 0
      AND a.started_at <= p_ts
    RETURNING a.*
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(d) || jsonb_build_object('change', 'closed')), '[]'::jsonb) INTO v_closed FROM done d;

  WITH done AS (
  INSERT INTO alarms (project, gateway, device, profile, word, bit, code, severity, started_at)
  SELECT p_project, p_gateway, f.device, f.profile, f.word, s.bit,
         COALESCE(b.code, f.word || '_bit' || s.bit), COALESCE(b.severity, 'warning'), p_ts
  FROM unnest(f_device, f_word, f_value, f_profile) AS f(device, word, value, profile)
  CROSS JOIN generate_series(0, 15) AS s(bit)
  LEFT JOIN fault_bits b ON b.profile = f.profile AND b.word = f.word AND b.bit = s.bit
  WHERE (f.value & (1::bigint << s.bit)) <> 0
  ON CONFLICT (project, device, code) WHERE ended_at IS NULL DO NOTHING
  RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(d) || jsonb_build_object('change', 'opened', 'en', b.en, 'th', b.th)), '[]'::jsonb) INTO v_opened
  FROM done d LEFT JOIN fault_bits b ON b.profile = d.profile AND b.word = d.word AND b.bit = d.bit;

  INSERT INTO fault_words AS w (project, device, word, value, ts)
  SELECT p_project, f.device, f.word, f.value, p_ts FROM unnest(f_device, f_word, f_value) AS f(device, word, value)
  ON CONFLICT (project, device, word) DO UPDATE SET value = EXCLUDED.value, ts = EXCLUDED.ts
  WHERE EXCLUDED.ts > w.ts;

  changes := v_closed || v_opened;
END
$fn$;

-- One telemetry message. "stored" is the number of new rows (0 when the broker redelivered it).
-- "latest" is false for a cycle older than one already stored (sent from the gateway's buffer): the
-- live view (Firestore) must not go back in time.
CREATE OR REPLACE FUNCTION ingest_telemetry(
  p_project text, p_gateway text, p_ts timestamptz, p_seq bigint, p_interval integer,
  p_devices text[], p_points text[], p_values double precision[],
  p_failed text[], p_reasons text[],
  OUT stored integer, OUT latest boolean, OUT alarm_changes jsonb
) LANGUAGE plpgsql AS $fn$
DECLARE
  previous timestamptz;
BEGIN
  SELECT last_ts INTO previous FROM gateways WHERE project = p_project AND gateway = p_gateway FOR UPDATE;
  latest := previous IS NULL OR p_ts >= previous;

  INSERT INTO telemetry (ts, project, device, point, value)
  SELECT p_ts, p_project, x.device, x.point, x.value
  FROM unnest(p_devices, p_points, p_values) AS x(device, point, value)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS stored = ROW_COUNT;

  -- Communication state: an event when a device stops or starts answering. A buffered cycle that is
  -- older than the last known state does not flip it. A device seen for the first time only logs a failure.
  WITH polled AS (
    SELECT DISTINCT device, true AS ok, NULL::text AS reason FROM unnest(p_devices) AS device
    UNION ALL
    SELECT f.device, false, f.reason FROM unnest(p_failed, p_reasons) AS f(device, reason)
  ), changed AS (
    SELECT s.device, s.ok FROM polled s
    LEFT JOIN devices d ON d.project = p_project AND d.device = s.device
    WHERE (d.comm_at IS NULL OR p_ts > d.comm_at)
      AND CASE WHEN d.device IS NULL THEN NOT s.ok ELSE d.comm_ok IS DISTINCT FROM s.ok END
  )
  INSERT INTO events (ts, project, gateway, device, point, value)
  SELECT p_ts, p_project, p_gateway, c.device, '_comm', c.ok::int FROM changed c
  ON CONFLICT DO NOTHING;

  WITH polled AS (
    SELECT DISTINCT device, true AS ok, NULL::text AS reason FROM unnest(p_devices) AS device
    UNION ALL
    SELECT f.device, false, f.reason FROM unnest(p_failed, p_reasons) AS f(device, reason)
  )
  INSERT INTO devices AS d (project, device, gateway, last_seen, comm_ok, comm_at, last_error, last_error_at)
  SELECT p_project, s.device, p_gateway, CASE WHEN s.ok THEN p_ts END, s.ok, p_ts, s.reason, CASE WHEN NOT s.ok THEN p_ts END
  FROM polled s
  ON CONFLICT (project, device) DO UPDATE SET
    gateway       = EXCLUDED.gateway,
    last_seen     = GREATEST(d.last_seen, EXCLUDED.last_seen),
    comm_ok       = CASE WHEN d.comm_at IS NULL OR EXCLUDED.comm_at > d.comm_at THEN EXCLUDED.comm_ok ELSE d.comm_ok END,
    comm_at       = GREATEST(d.comm_at, EXCLUDED.comm_at),
    last_error    = COALESCE(EXCLUDED.last_error, d.last_error),
    last_error_at = GREATEST(d.last_error_at, EXCLUDED.last_error_at);

  INSERT INTO gateways AS g (project, gateway, interval_s, last_ts, last_seen, last_seq)
  VALUES (p_project, p_gateway, p_interval, p_ts, now(), p_seq)
  ON CONFLICT (project, gateway) DO UPDATE SET
    interval_s = EXCLUDED.interval_s,
    last_ts    = GREATEST(g.last_ts, EXCLUDED.last_ts),
    last_seen  = now(),
    last_seq   = EXCLUDED.last_seq;

  alarm_changes := (SELECT a.changes FROM apply_fault_words(p_project, p_gateway, p_ts, p_devices, p_points, p_values) AS a);
END
$fn$;

-- One event message. "stored" is the number of new rows.
CREATE OR REPLACE FUNCTION ingest_event(
  p_project text, p_gateway text, p_ts timestamptz, p_seq bigint,
  p_devices text[], p_points text[], p_values double precision[],
  OUT stored integer, OUT latest boolean, OUT alarm_changes jsonb
) LANGUAGE plpgsql AS $fn$
DECLARE
  previous timestamptz;
BEGIN
  SELECT last_ts INTO previous FROM gateways WHERE project = p_project AND gateway = p_gateway FOR UPDATE;
  latest := previous IS NULL OR p_ts >= previous;

  INSERT INTO events (ts, project, gateway, device, point, value)
  SELECT p_ts, p_project, p_gateway, x.device, x.point, x.value
  FROM unnest(p_devices, p_points, p_values) AS x(device, point, value)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS stored = ROW_COUNT;

  INSERT INTO gateways AS g (project, gateway, last_seen, last_seq)
  VALUES (p_project, p_gateway, now(), p_seq)
  ON CONFLICT (project, gateway) DO UPDATE SET last_seen = now(), last_seq = EXCLUDED.last_seq;

  -- A fault word that changes between cycles arrives here first: alarms open within seconds.
  alarm_changes := (SELECT a.changes FROM apply_fault_words(p_project, p_gateway, p_ts, p_devices, p_points, p_values) AS a);
END
$fn$;

-- One status message (online on connect, offline from the gateway or its Last Will).
-- Returns true when the state changed; only a change is logged as an event.
CREATE OR REPLACE FUNCTION ingest_status(
  p_project text, p_gateway text, p_state text, p_ts timestamptz, p_fw text
) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE
  previous text;
BEGIN
  SELECT state INTO previous FROM gateways WHERE project = p_project AND gateway = p_gateway FOR UPDATE;
  IF previous IS DISTINCT FROM p_state THEN
    INSERT INTO events (ts, project, gateway, device, point, value)
    VALUES (p_ts, p_project, p_gateway, '_gateway', '_online', (p_state = 'online')::int)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO gateways AS g (project, gateway, state, state_at, fw)
  VALUES (p_project, p_gateway, p_state, p_ts, p_fw)
  ON CONFLICT (project, gateway) DO UPDATE SET
    state    = EXCLUDED.state,
    state_at = CASE WHEN g.state IS DISTINCT FROM EXCLUDED.state THEN EXCLUDED.state_at ELSE g.state_at END,
    fw       = COALESCE(EXCLUDED.fw, g.fw);

  RETURN previous IS DISTINCT FROM p_state;
END
$fn$;
`;

const MODEL_KEYS = `
DO $keys$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_bits_profile_fk' AND conrelid = 'fault_bits'::regclass) THEN
    ALTER TABLE fault_bits ADD CONSTRAINT fault_bits_profile_fk FOREIGN KEY (profile) REFERENCES profiles (id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_profile_fk' AND conrelid = 'devices'::regclass) THEN
    ALTER TABLE devices ADD CONSTRAINT devices_profile_fk FOREIGN KEY (profile) REFERENCES profiles (id) NOT VALID;
  END IF;
END
$keys$;
`;

const HOURLY = `
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1h
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 hour', ts) AS bucket, project, device, point,
       avg(value) AS avg, min(value) AS min, max(value) AS max, last(value, ts) AS last, count(value) AS n
FROM telemetry
GROUP BY bucket, project, device, point
WITH NO DATA;
`;

/**
 * Device models live in the database (edited on the admin page). The ones written in code are added when
 * missing, with their fault bits, and never overwritten; then devices and fault bits may only name models
 * that exist (NOT VALID: rows from before the models table are left as they are rather than stopping the
 * start). Needs the tables above. Returns the models added.
 */
export async function migrateModels(client: Pick<pg.PoolClient, "query">): Promise<string[]> {
  const added: string[] = [];
  for (const model of SEED_MODELS) {
    const problems = modelProblems(model);
    if (problems.length) throw new Error(`device model ${model.id} in code: ${problems.map((p) => modelProblemText(model, p)).join("; ")}`);
    await client.query("BEGIN");
    try {
      if (await addSeedModel(client, model)) added.push(model.id);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  await client.query(MODEL_KEYS);
  return added;
}

/** Serialises concurrent starts (two instances during a deploy) so they do not race on DDL. */
const LOCK_KEY = 7_141_001;

export async function migrate(pool: pg.Pool, opts: SchemaOptions): Promise<string[]> {
  const done: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(TABLES);
    done.push("tables");
    await client.query("BEGIN");
    try {
      await client.query(FUNCTIONS);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    done.push("functions");

    const added = await migrateModels(client);
    done.push(added.length ? `device models added: ${added.join(", ")}` : "device models");

    const { rows } = await client.query<{ compression_enabled: boolean }>(
      "SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry'",
    );
    if (!rows[0]?.compression_enabled) {
      await client.query(
        "ALTER TABLE telemetry SET (timescaledb.compress, timescaledb.compress_segmentby = 'project, device, point', timescaledb.compress_orderby = 'ts DESC')",
      );
    }
    await client.query("SELECT remove_compression_policy('telemetry', if_exists => TRUE)");
    await client.query("SELECT add_compression_policy('telemetry', compress_after => $1::interval)", [opts.compressAfter]);
    done.push(`compression after ${opts.compressAfter}`);

    for (const table of ["telemetry", "events"]) {
      await client.query("SELECT remove_retention_policy($1::regclass, if_exists => TRUE)", [table]);
      if (opts.retention) await client.query("SELECT add_retention_policy($1::regclass, drop_after => $2::interval)", [table, opts.retention]);
    }
    done.push(opts.retention ? `retention ${opts.retention}` : "no retention (keep everything)");

    await client.query(HOURLY);
    await client.query(
      "SELECT add_continuous_aggregate_policy('telemetry_1h', start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE)",
    );
    done.push("hourly aggregate");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return done;
}
