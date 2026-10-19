import { readFileSync } from "node:fs";
import pg from "pg";
import { log } from "./log";

/**
 * Connection pool with TLS verified against `caFile` (the database's own CA) or the public CA store.
 * `sslmode` is taken out of the URL because pg lets it override the ssl options given here.
 */
export function createPool(databaseUrl: string, caFile?: string): pg.Pool {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const ssl = sslmode === "disable" ? false : caFile ? { ca: readFileSync(caFile, "utf8") } : true;
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    // Messages are written one at a time; a second connection serves migrations and health checks.
    max: 2,
    // Opening a connection to a far-away database takes over a second: keep them open.
    idleTimeoutMillis: 0,
    keepAlive: true,
    application_name: "pdm-ingest",
  });
  // A dropped idle connection must not crash the service; the pool opens a new one when needed.
  pool.on("error", (e) => log.warn("database connection dropped", { error: e.message }));
  return pool;
}

/** Errors worth retrying: lost connections, server restarts, overload. Anything else is a bad message. */
export function isTransient(e: unknown): boolean {
  const code = (e as { code?: string }).code ?? "";
  return /^(08|53|57P|40001|40P01)/.test(code) || /^E(CONNRESET|CONNREFUSED|TIMEDOUT|PIPE|NOTFOUND|AI_AGAIN)$/.test(code) || /terminat|timeout|Connection/i.test(String((e as Error).message));
}
