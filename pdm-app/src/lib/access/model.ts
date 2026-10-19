// Who may open which project of the live /hvac module, as data: the custom claims on Firebase Auth
// accounts, customers (orgs) and their projects, and the rows the admin page shows. Shared by the
// admin page (browser), its API (/api/hvac/admin) and the CLIs in services/ingest (npm run org,
// npm run access, npm run registry), so it imports no SDK and uses relative imports only. A plant's
// device registry is in registry.ts.
//
// Claims on an account:
//   admin: true        service operators: every project
//   orgs: ["acme"]     the customers the account belongs to: every project whose Firestore document
//                      has org == one of them, including projects added later
//   projects: ["p"]    single projects given one by one, as an exception (e.g. a contractor)
// firestore.rules and the /api/hvac routes read the same claims.

import { SLUG } from "../telemetry/contract";
import type { DeviceModbus, ModelDef } from "../telemetry/register-map";
import type { NotifyConfig } from "../notify/config";
import type { RegistryFile } from "./registry";

export interface Access {
  admin: boolean;
  orgs: string[];
  projects: string[];
}

export const NO_ACCESS: Access = { admin: false, orgs: [], projects: [] };

/** Customer and project ids: lowercase letters, digits and "-", up to 32 characters. */
export const ID = SLUG;
/** Longest customer name. */
export const NAME_MAX = 100;
/** Firebase Auth refuses custom claims larger than this (JSON, bytes). */
export const CLAIMS_MAX_BYTES = 1000;

export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const sorted = (v: string[]) => [...new Set(v)].sort();

export function accessOf(claims: Record<string, unknown> | null | undefined): Access {
  return { admin: claims?.admin === true, orgs: texts(claims?.orgs), projects: texts(claims?.projects) };
}

export function normalizeAccess(a: Access): Access {
  return { admin: a.admin, orgs: sorted(a.orgs), projects: sorted(a.projects) };
}

export const hasAccess = (a: Access) => a.admin || a.orgs.length > 0 || a.projects.length > 0;

export function sameAccess(a: Access, b: Access): boolean {
  const x = normalizeAccess(a);
  const y = normalizeAccess(b);
  return x.admin === y.admin && x.orgs.join() === y.orgs.join() && x.projects.join() === y.projects.join();
}

/** The account's claims with this access; other claims stay, empty ones are left out. */
export function claimsFor(existing: Record<string, unknown> | null | undefined, access: Access): Record<string, unknown> {
  const a = normalizeAccess(access);
  const claims: Record<string, unknown> = { ...(existing ?? {}) };
  delete claims.admin;
  delete claims.orgs;
  delete claims.projects;
  if (a.admin) claims.admin = true;
  if (a.orgs.length) claims.orgs = a.orgs;
  if (a.projects.length) claims.projects = a.projects;
  return claims;
}

export const claimsBytes = (claims: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify(claims)).length;

/** Single projects of the account that its customers already give it (kept in one place is clearer). */
export function redundantProjects(access: Access, projects: ProjectRow[]): string[] {
  const viaOrg = new Set(projects.filter((p) => p.org !== null && access.orgs.includes(p.org)).map((p) => p.id));
  return access.projects.filter((p) => viaOrg.has(p));
}

export interface OrgRow {
  id: string;
  name: string;
}

export interface ProjectRow {
  id: string;
  /** Plant name from the registry; null when unnamed. */
  name: string | null;
  /** The customer it belongs to; null when none. */
  org: string | null;
  /** Devices in its registry. */
  devices: number;
}

export interface AccountRow {
  uid: string;
  email: string | null;
  disabled: boolean;
  access: Access;
  /** ms since epoch, null when unknown or never. */
  createdAt: number | null;
  lastSignInAt: number | null;
}

export type AdminAction =
  | "org.create"
  | "org.rename"
  | "org.delete"
  | "org.projects"
  | "account.create"
  | "account.access"
  | "account.disable"
  | "account.enable"
  | "account.passwordLink"
  | "project.create"
  | "project.registry"
  | "model.create"
  | "model.update"
  | "model.delete"
  | "device.modbus"
  | "project.notify"
  | "project.notifyTest";

/** One entry of the audit log (Firestore adminLog, written by the server and the CLIs only). */
export interface LogEntry {
  id: string;
  /** ms since epoch; null until the server time is set. */
  at: number | null;
  /** Email of who did it. */
  actor: string;
  via: "web" | "cli";
  action: AdminAction;
  /** Customer id, account email or project id. */
  target: string;
  details: {
    name?: string;
    from?: string;
    added?: { project: string; from: string | null }[];
    removed?: string[];
    before?: Access;
    after?: Access;
    /** Registry saves: devices after the save, and what changed (device ids). */
    devices?: number;
    addedDevices?: string[];
    removedDevices?: string[];
    changedDevices?: string[];
    reordered?: boolean;
    logo?: boolean;
    /** Device models: how many registers and fault bits it has after the change. */
    registers?: number;
    faultBits?: number;
    /** Device Modbus settings after the change. */
    gateway?: string;
    port?: string;
    slaveId?: number;
    module?: number;
    /** Registers of the device that differ from its model (changed, left out or its own). */
    overrides?: number;
    /** Alarm email settings after the change (recipients: how many), or the test email (recipients). */
    enabled?: boolean;
    recipients?: number;
    minSeverity?: "critical" | "warning";
    cleared?: boolean;
    locale?: "th" | "en";
  };
}

/** Everything the admin page shows, in one answer. */
export interface Overview {
  orgs: OrgRow[];
  projects: ProjectRow[];
  accounts: AccountRow[];
  log: LogEntry[];
  /** Projects that send live data but have no registry yet (no projects/{project} document). */
  unregistered: string[];
  /** uid of the operator asking. */
  me: string;
}

export type AccessErrorCode =
  | "bad-id"
  | "bad-name"
  | "bad-email"
  | "bad-request"
  | "org-missing"
  | "org-exists"
  | "org-not-empty"
  | "org-has-accounts"
  | "project-unregistered"
  | "project-not-in-org"
  | "account-missing"
  | "email-taken"
  | "claims-too-large"
  | "own-admin"
  | "own-account"
  | "project-exists"
  | "project-missing"
  | "registry-changed"
  | "bad-registry"
  | "db-unavailable"
  | "db-not-ready"
  | "bad-model"
  | "bad-modbus"
  | "model-exists"
  | "model-missing"
  | "model-in-use"
  | "model-has-alarms"
  | "device-missing"
  | "bad-notify";

/** What the admin page can ask the API to do (POST /api/hvac/admin). */
export type AdminRequest =
  | { action: "saveOrg"; org: string; name: string; mode: "create" | "rename" }
  | { action: "deleteOrg"; org: string }
  | { action: "assignProjects"; org: string; add: string[]; remove: string[] }
  | { action: "createAccount"; email: string; access: Access }
  | { action: "setAccess"; uid: string; access: Access }
  | { action: "setDisabled"; uid: string; disabled: boolean }
  | { action: "passwordLink"; uid: string }
  | { action: "saveRegistry"; mode: "create" | "edit"; file: RegistryFile; version: number | null }
  | { action: "saveModel"; mode: "create" | "edit"; model: ModelDef; version: number | null }
  | { action: "deleteModel"; id: string }
  | { action: "saveModbus"; project: string; device: string; modbus: DeviceModbus; version: number | null }
  | { action: "saveNotify"; project: string; config: NotifyConfig }
  | { action: "testNotify"; project: string; config: NotifyConfig };
