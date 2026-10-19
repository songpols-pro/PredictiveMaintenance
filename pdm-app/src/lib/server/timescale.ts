import "server-only";
import pg from "pg";
import { TIGER_CA_PEM } from "./tiger-ca";

// TimescaleDB (history written by services/ingest). DATABASE_URL is a server secret:
// .env.local in development, Secret Manager (apphosting.yaml) on App Hosting.

let pool: pg.Pool | null = null;

export function historyConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function timescale(): pg.Pool {
  if (pool) return pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  // pg lets sslmode in the URL override the ssl object below, so it is taken out.
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const caSetting = process.env.DATABASE_CA_PEM;
  const ssl = sslmode === "disable" ? false : caSetting === "system" ? true : { ca: caSetting || TIGER_CA_PEM };
  // A database that cannot be reached fails the request after 15 s rather than leaving it hanging.
  pool = new pg.Pool({ connectionString: url.toString(), ssl, max: 4, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 60_000, keepAlive: true, application_name: "pdm-web" });
  pool.on("error", () => {}); // a dropped idle connection is replaced on the next query
  return pool;
}
