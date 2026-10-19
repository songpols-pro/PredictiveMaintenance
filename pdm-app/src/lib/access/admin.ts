// Customers, their plants (projects and their device registries) and the accounts that may open them:
// the operations behind the admin page (/hvac/admin, through /api/hvac/admin) and the CLIs in
// services/ingest (npm run org, npm run access, npm run registry). Server side only, but without
// "server-only" or "@/" imports so the CLIs can load it too.
//
// Every change is checked here, whoever asks: ids, customers that exist, projects that are registered,
// the 1000-byte claim limit, device registries (registry.ts), and an operator cannot take away their
// own operator access or disable their own account. Each change is written to the audit log
// (Firestore adminLog; no browser access).

import os from "node:os";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore, WriteBatch, type DocumentSnapshot, type Firestore, type Timestamp, type Transaction } from "firebase-admin/firestore";
import {
  accessOf,
  claimsBytes,
  claimsFor,
  CLAIMS_MAX_BYTES,
  hasAccess,
  ID,
  looksLikeEmail,
  NAME_MAX,
  NO_ACCESS,
  normalizeAccess,
  sameAccess,
  type Access,
  type AccessErrorCode,
  type AccountRow,
  type AdminAction,
  type LogEntry,
  type OrgRow,
  type Overview,
  type ProjectRow,
} from "./model";
import {
  changesAnything,
  fileFromStored,
  plantNameOf,
  problemText,
  registryChange,
  registryProblems,
  storedDevices,
  type RegistryFile,
  type RegistryView,
} from "./registry";

import { NOTIFY_CONFIG, NOTIFY_STATE, notifyProblems, parseRecipients, readNotifyConfig, type NotifyConfig, type NotifyView } from "../notify/config";
import { KEEP_MAIL_MS, mailDocument, testEmail } from "../notify/email";
import { isMissingSchema, readModelSummaries, type SqlClient } from "../telemetry/register-store";
import type { ModelKinds } from "./registry";

export type { SqlClient };

const LOG = "adminLog";

/** Who makes a change, for the audit log. */
export interface Actor {
  uid: string | null;
  email: string;
  via: "web" | "cli";
}

/** The person running a CLI on this computer (the audit log has no sign-in to go by). */
export function cliActor(): Actor {
  return { uid: null, email: `${os.userInfo().username}@${os.hostname()}`, via: "cli" };
}

/** A refused change: `code` for the admin page's message, `ids` the customers, projects or emails concerned. */
export class AccessError extends Error {
  constructor(
    readonly code: AccessErrorCode,
    message: string,
    readonly ids: string[] = [],
  ) {
    super(message);
    this.name = "AccessError";
  }
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const time = (v: string | undefined) => (v ? Date.parse(v) || null : null);
/** A registry's version: when it was last saved (only registry saves set updatedAt on a project). */
/**
 * A TimescaleDB failure as the admin page's error: "db-not-ready" when the ingest schema (npm run migrate)
 * has not been applied yet, else "db-unavailable". Refusals made here pass through.
 */
export function dbFailure(e: unknown, ids: string[] = []): AccessError {
  if (e instanceof AccessError) return e;
  return isMissingSchema(e)
    ? new AccessError("db-not-ready", `the history database (TimescaleDB) has no device models yet: run npm run migrate in services/ingest (${(e as Error).message})`, ids)
    : new AccessError("db-unavailable", `the history database (TimescaleDB) is not available: ${(e as Error).message}`, ids);
}

const versionOf = (snap: DocumentSnapshot) => (snap.get("updatedAt") as Timestamp | undefined)?.toMillis() ?? null;

/** Alarm email settings as they will be stored, or the reason they cannot be. */
function cleanNotify(input: NotifyConfig): NotifyConfig {
  const { recipients, invalid } = parseRecipients(input.recipients);
  const config: NotifyConfig = {
    enabled: input.enabled === true,
    recipients,
    minSeverity: input.minSeverity === "critical" ? "critical" : "warning",
    cleared: input.cleared !== false,
    locale: input.locale === "en" ? "en" : "th",
  };
  if (invalid.length) throw new AccessError("bad-email", `not an email address: ${invalid.join(", ")}`, invalid);
  const problems = notifyProblems(config);
  if (problems.length) throw new AccessError("bad-notify", problems.join(", "), problems);
  return config;
}

function checkIds(ids: string[], what: "customer" | "project") {
  const bad = ids.filter((id) => !ID.test(id));
  if (bad.length) throw new AccessError("bad-id", `not a ${what} id (lowercase letters, digits and "-", up to 32): ${bad.join(", ")}`, bad);
}

export function accountRow(u: UserRecord): AccountRow {
  return {
    uid: u.uid,
    email: u.email ?? null,
    disabled: u.disabled,
    access: normalizeAccess(accessOf(u.customClaims)),
    createdAt: time(u.metadata.creationTime),
    lastSignInAt: time(u.metadata.lastSignInTime),
  };
}

export class AccessAdmin {
  readonly db: Firestore;
  readonly auth: Auth;

  constructor(app: App) {
    this.db = getFirestore(app);
    this.auth = getAuth(app);
  }

  /** For the CLIs: this module's own Firebase app, so its SDK objects match the ones used here. */
  static forProject(projectId: string): AccessAdmin {
    return new AccessAdmin(getApps()[0] ?? initializeApp({ projectId }));
  }

  // ---- Reading ---------------------------------------------------------------------------

  async orgs(): Promise<OrgRow[]> {
    const snap = await this.db.collection("orgs").get();
    return snap.docs.map((d) => ({ id: d.id, name: text(d.get("name")) ?? d.id })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Registered projects (those with a registry document), by id. */
  async projects(): Promise<ProjectRow[]> {
    const snap = await this.db.collection("projects").select("name", "org", "devices").get();
    return snap.docs
      .map((d) => ({ id: d.id, name: text(d.get("name")), org: text(d.get("org")), devices: Object.keys(d.get("devices") ?? {}).length }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Projects that send live data (their gateways are in Firestore) but have no registry document yet. */
  async unregistered(registered: ProjectRow[]): Promise<string[]> {
    const known = new Set(registered.map((p) => p.id));
    const refs = await this.db.collection("projects").listDocuments();
    return refs
      .map((r) => r.id)
      .filter((id) => !known.has(id) && ID.test(id))
      .sort();
  }

  /** Every account of the Firebase project, by email. */
  async users(): Promise<UserRecord[]> {
    const users: UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.auth.listUsers(1000, pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);
    return users.sort((a, b) => (a.email ?? a.uid).localeCompare(b.email ?? b.uid));
  }

  async log(limit = 50): Promise<LogEntry[]> {
    const snap = await this.db.collection(LOG).orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => ({
      id: d.id,
      at: (d.get("at") as Timestamp | null)?.toMillis() ?? null,
      actor: String(d.get("actor") ?? ""),
      via: d.get("via") === "cli" ? "cli" : "web",
      action: d.get("action") as AdminAction,
      target: String(d.get("target") ?? ""),
      details: (d.get("details") as LogEntry["details"]) ?? {},
    }));
  }

  async overview(me: string): Promise<Overview> {
    const [orgs, projects, users, log] = await Promise.all([this.orgs(), this.projects(), this.users(), this.log()]);
    return { orgs, projects, accounts: users.map(accountRow), log, unregistered: await this.unregistered(projects), me };
  }

  async account(uid: string): Promise<UserRecord> {
    return this.auth.getUser(uid).catch((e: { code?: string }) => {
      throw e.code === "auth/user-not-found" ? new AccessError("account-missing", `no account ${uid}`, [uid]) : e;
    });
  }

  async accountByEmail(email: string): Promise<UserRecord> {
    return this.auth.getUserByEmail(email.trim().toLowerCase()).catch((e: { code?: string }) => {
      throw e.code === "auth/user-not-found" || e.code === "auth/invalid-email" ? new AccessError("account-missing", `no account for ${email}`, [email]) : e;
    });
  }

  // ---- Customers -------------------------------------------------------------------------

  /** Create the customer, or rename it; "create" refuses an id in use, "rename" one that does not exist. */
  async saveOrg(actor: Actor, org: string, name: string, mode: "create" | "rename" | "save" = "save"): Promise<{ created: boolean; changed: boolean }> {
    checkIds([org], "customer");
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > NAME_MAX) throw new AccessError("bad-name", `a customer name is 1 to ${NAME_MAX} characters`);
    const ref = this.db.doc(`orgs/${org}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const before = text(snap.get("name"));
      if (mode === "create" && snap.exists) throw new AccessError("org-exists", `customer id ${org} is already in use`, [org]);
      if (mode === "rename" && !snap.exists) throw new AccessError("org-missing", `no customer ${org}`, [org]);
      if (snap.exists && before === clean) return { created: false, changed: false };
      tx.set(ref, { name: clean, updatedAt: FieldValue.serverTimestamp(), ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
      this.logIn(tx, actor, snap.exists ? "org.rename" : "org.create", org, snap.exists && before ? { name: clean, from: before } : { name: clean });
      return { created: !snap.exists, changed: true };
    });
  }

  /** Delete a customer that has no projects and no accounts left. */
  async deleteOrg(actor: Actor, org: string): Promise<void> {
    checkIds([org], "customer");
    const ref = this.db.doc(`orgs/${org}`);
    const [snap, projects, users] = await Promise.all([ref.get(), this.db.collection("projects").where("org", "==", org).select().get(), this.users()]);
    if (!snap.exists) throw new AccessError("org-missing", `no customer ${org}`, [org]);
    if (!projects.empty) {
      const ids = projects.docs.map((d) => d.id);
      throw new AccessError("org-not-empty", `${org} still has projects: ${ids.join(", ")}; move or remove them first`, ids);
    }
    const members = users.filter((u) => accessOf(u.customClaims).orgs.includes(org)).map((u) => u.email ?? u.uid);
    if (members.length) throw new AccessError("org-has-accounts", `accounts still belong to ${org}: ${members.join(", ")}; remove them first`, members);
    const batch = this.db.batch();
    batch.delete(ref);
    this.logIn(batch, actor, "org.delete", org, { name: text(snap.get("name")) ?? org });
    await batch.commit();
  }

  /**
   * Give projects to the customer (moved from another customer if they had them) and take others away.
   * Only registered projects (npm run registry), so a mistyped id is refused rather than creating one.
   */
  async assignProjects(actor: Actor, org: string, add: string[], remove: string[]): Promise<{ added: { project: string; from: string | null }[]; removed: string[] }> {
    checkIds([org], "customer");
    checkIds([...add, ...remove], "project");
    const both = add.filter((p) => remove.includes(p));
    if (both.length) throw new AccessError("bad-request", `both added and removed: ${both.join(", ")}`, both);
    const orgRef = this.db.doc(`orgs/${org}`);
    const ids = [...new Set([...add, ...remove])];
    return this.db.runTransaction(async (tx) => {
      const orgSnap = await tx.get(orgRef);
      if (!orgSnap.exists) throw new AccessError("org-missing", `no customer ${org}`, [org]);
      const snaps: DocumentSnapshot[] = ids.length ? await tx.getAll(...ids.map((p) => this.db.doc(`projects/${p}`))) : [];
      const byId = new Map(snaps.map((s) => [s.id, s]));
      const unregistered = add.filter((p) => !byId.get(p)?.exists);
      if (unregistered.length) throw new AccessError("project-unregistered", `no registry yet (npm run registry first): ${unregistered.join(", ")}`, unregistered);
      const notOurs = remove.filter((p) => text(byId.get(p)?.get("org")) !== org);
      if (notOurs.length) throw new AccessError("project-not-in-org", `not projects of ${org}: ${notOurs.join(", ")}`, notOurs);

      const added = add.map((p) => ({ project: p, from: text(byId.get(p)!.get("org")) })).filter((x) => x.from !== org);
      for (const { project } of added) tx.update(this.db.doc(`projects/${project}`), { org });
      for (const p of remove) tx.update(this.db.doc(`projects/${p}`), { org: FieldValue.delete() });
      if (added.length || remove.length) this.logIn(tx, actor, "org.projects", org, { added, removed: remove });
      return { added, removed: remove };
    });
  }

  // ---- Plants (device registries) --------------------------------------------------------

  /**
   * A plant's registry for the admin page's editor: the Firestore document, each device's register
   * profile and the devices that send data without being in it (both from TimescaleDB). Without the
   * database (`sql` null or failing) the profiles are unknown: `profiles` is false and saving is refused.
   * With `unregistered` the plant is about to be registered: an empty registry with every device that
   * already sends data, refused once the plant has a registry.
   */
  async registry(project: string, sql: SqlClient | null, { unregistered = false } = {}): Promise<RegistryView> {
    checkIds([project], "project");
    const [snap, rows, models] = await Promise.all([
      this.db.doc(`projects/${project}`).get(),
      sql
        ? sql
            .query("SELECT device, gateway, profile, last_seen FROM devices WHERE project = $1", [project])
            .then((r) => r.rows as { device: string; gateway: string; profile: string | null; last_seen: Date | null }[])
            .catch((e: Error) => {
              console.warn(`[registry] TimescaleDB not available: ${e.message}`);
              return null;
            })
        : null,
      sql ? readModelSummaries(sql).catch(() => null) : null,
    ]);
    if (snap.exists === unregistered) {
      throw unregistered
        ? new AccessError("project-exists", `${project} is registered already`, [project])
        : new AccessError("project-missing", `no registry for ${project}`, [project]);
    }
    const data = snap.data();
    const registered = new Set(Object.keys(data?.devices ?? {}));
    return {
      file: unregistered ? { project, devices: [] } : fileFromStored(project, data, Object.fromEntries((rows ?? []).map((r) => [r.device, r.profile]))),
      org: text(data?.org),
      version: unregistered ? null : versionOf(snap),
      registered: !unregistered,
      profiles: rows !== null && models !== null,
      models: models ?? [],
      seen: (rows ?? [])
        .flatMap((r) => (r.last_seen && !registered.has(r.device) ? [{ device: r.device, gateway: r.gateway, lastSeen: r.last_seen.getTime() }] : []))
        .sort((a, b) => a.device.localeCompare(b.device, "en", { numeric: true })),
    };
  }

  /**
   * Save a plant's registry from a project file (registry.ts): "create" registers a new plant and
   * refuses an id in use, "edit" replaces an existing plant's registry unless it was saved since
   * `version`, "save" does either (npm run registry). The customer the plant belongs to (org) stays.
   *
   * Register profiles go to TimescaleDB first: it is far away and the likelier to fail, so a registry
   * is never saved in Firestore with profiles that did not reach the database; without the database
   * nothing is saved ("db-unavailable"). Devices not seen yet get a row there now (the gateway is
   * filled in by their first message); devices taken out keep their row and data. A registry that
   * would not change is not written again, and not logged.
   */
  async saveRegistry(
    actor: Actor,
    file: RegistryFile,
    sql: SqlClient | null,
    { mode, version = null }: { mode: "create" | "edit" | "save"; version?: number | null },
  ): Promise<{ created: boolean; changed: boolean; devices: number; profiles: number }> {
    // Devices need the database anyway (their profiles go there), and the models to check against are in it.
    const hasDevices = Array.isArray(file.devices) && file.devices.length > 0;
    if (hasDevices && !sql) throw new AccessError("db-unavailable", "the history database (TimescaleDB) is not configured: DATABASE_URL is not set", [String(file.project)]);
    let models: ModelKinds = {};
    if (hasDevices) {
      try {
        models = Object.fromEntries((await readModelSummaries(sql!)).map((m) => [m.id, { kind: m.kind }]));
      } catch (e) {
        throw dbFailure(e, [String(file.project)]);
      }
    }
    const problems = registryProblems(file, models);
    if (problems.length) {
      const ids = [...new Set(problems.map((p) => p.device ?? String(file.project)))];
      throw new AccessError("bad-registry", problems.map((p) => problemText(file, p, models)).join("; "), ids);
    }
    const project = file.project;
    const ref = this.db.doc(`projects/${project}`);
    const check = (snap: DocumentSnapshot) => {
      if (mode === "create" && snap.exists) throw new AccessError("project-exists", `project id ${project} is already in use`, [project]);
      if (mode === "edit" && !snap.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
      if (mode === "edit" && versionOf(snap) !== version) throw new AccessError("registry-changed", `the registry of ${project} was saved by someone else meanwhile`, [project]);
    };
    check(await ref.get());

    const ids = file.devices.map((d) => d.id);
    const profiles = file.devices.map((d) => d.profile ?? null);
    let profilesChanged: string[] = [];
    if (ids.length) {
      try {
        // "prev" sees the rows as they were before the insert: which profiles change, for the audit log.
        const { rows } = await sql!.query(
          `WITH prev AS (SELECT device, profile FROM devices WHERE project = $1)
           INSERT INTO devices AS d (project, device, gateway, profile)
           SELECT $1, x.device, '', x.profile FROM unnest($2::text[], $3::text[]) AS x(device, profile)
           ON CONFLICT (project, device) DO UPDATE SET profile = EXCLUDED.profile
           RETURNING d.device, d.profile IS DISTINCT FROM (SELECT p.profile FROM prev p WHERE p.device = d.device) AS changed`,
          [project, ids, profiles],
        );
        profilesChanged = (rows as { device: string; changed: boolean }[]).filter((r) => r.changed).map((r) => r.device);
      } catch (e) {
        throw dbFailure(e, [project]);
      }
    }

    const name = plantNameOf(file);
    const ownerLogo = file.ownerLogo ?? null;
    const devices = storedDevices(file);
    const result = { devices: ids.length, profiles: profiles.filter(Boolean).length };
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      check(snap);
      const change = registryChange(snap.data(), { name, ownerLogo, devices }, profilesChanged);
      if (snap.exists && !changesAnything(change)) return { created: false, changed: false, ...result };
      // Only the registry's own fields are replaced (devices as a whole); the customer (org) is kept.
      tx.set(
        ref,
        { name, ownerLogo: ownerLogo ?? FieldValue.delete(), devices, updatedAt: FieldValue.serverTimestamp() },
        { mergeFields: ["name", "ownerLogo", "devices", "updatedAt"] },
      );
      const before = text(snap.get("name"));
      this.logIn(
        tx,
        actor,
        snap.exists ? "project.registry" : "project.create",
        project,
        snap.exists
          ? {
              name,
              ...(change.renamed && before ? { from: before } : {}),
              devices: ids.length,
              ...(change.added.length ? { addedDevices: change.added } : {}),
              ...(change.removed.length ? { removedDevices: change.removed } : {}),
              ...(change.changed.length ? { changedDevices: change.changed } : {}),
              ...(change.reordered ? { reordered: true } : {}),
              ...(change.logo ? { logo: true } : {}),
            }
          : { name, devices: ids.length },
      );
      return { created: !snap.exists, changed: true, ...result };
    });
  }

  // ---- Accounts --------------------------------------------------------------------------

  /** Customers must exist; ids must be well formed. Only customers new to the account are looked up. */
  private async checkAccess(after: Access, before: Access = NO_ACCESS): Promise<void> {
    checkIds(after.orgs, "customer");
    checkIds(after.projects, "project");
    const added = after.orgs.filter((o) => !before.orgs.includes(o));
    const missing = (await Promise.all(added.map(async (o) => ((await this.db.doc(`orgs/${o}`).get()).exists ? null : o)))).filter((o): o is string => o !== null);
    if (missing.length) throw new AccessError("org-missing", `no customer ${missing.join(", ")}; create it first`, missing);
  }

  private claimsWithin(claims: Record<string, unknown>) {
    const size = claimsBytes(claims);
    if (size > CLAIMS_MAX_BYTES) {
      throw new AccessError("claims-too-large", `the access would take ${size} bytes, over the ${CLAIMS_MAX_BYTES} an account can carry; give the projects through a customer instead`, [String(size)]);
    }
  }

  /** Set what an account may open: the new access, or a change worked out from the current one. */
  async setAccess(actor: Actor, uid: string, next: Access | ((before: Access) => Access)): Promise<{ user: UserRecord; before: Access; after: Access; changed: boolean }> {
    const user = await this.account(uid);
    const before = normalizeAccess(accessOf(user.customClaims));
    const after = normalizeAccess(typeof next === "function" ? next(before) : next);
    if (actor.uid === user.uid && before.admin && !after.admin) throw new AccessError("own-admin", "you cannot take away your own operator access; ask another operator");
    await this.checkAccess(after, before);
    const claims = claimsFor(user.customClaims, after);
    this.claimsWithin(claims);
    const changed = !sameAccess(before, after);
    if (changed) {
      await this.auth.setCustomUserClaims(uid, claims);
      await this.logNow(actor, "account.access", user.email ?? uid, { before, after });
    }
    return { user, before, after, changed };
  }

  /**
   * A new account (Email/Password sign-in) with no password: the person sets one through a
   * password-reset email or link. Accounts are never created from a sign-up page.
   */
  async createAccount(actor: Actor, email: string, access: Access): Promise<UserRecord> {
    const clean = email.trim().toLowerCase();
    if (!looksLikeEmail(clean)) throw new AccessError("bad-email", `"${email}" is not an email address`, [email]);
    const a = normalizeAccess(access);
    await this.checkAccess(a);
    const claims = claimsFor({}, a);
    this.claimsWithin(claims);
    const user = await this.auth.createUser({ email: clean, emailVerified: false, disabled: false }).catch((e: { code?: string }) => {
      throw e.code === "auth/email-already-exists" ? new AccessError("email-taken", `${clean} already has an account`, [clean]) : e;
    });
    if (hasAccess(a)) await this.auth.setCustomUserClaims(user.uid, claims);
    await this.logNow(actor, "account.create", clean, { after: a });
    return this.account(user.uid);
  }

  /**
   * Disable or enable an account. A disabled account cannot sign in, its sessions cannot renew, and
   * the /api/hvac routes refuse it at once; screens already open lose live data within the hour,
   * when their sign-in token runs out.
   */
  async setDisabled(actor: Actor, uid: string, disabled: boolean): Promise<UserRecord> {
    const user = await this.account(uid);
    if (disabled && actor.uid === uid) throw new AccessError("own-account", "you cannot disable your own account");
    if (user.disabled === disabled) return user;
    await this.auth.updateUser(uid, { disabled });
    if (disabled) await this.auth.revokeRefreshTokens(uid);
    await this.logNow(actor, disabled ? "account.disable" : "account.enable", user.email ?? uid, {});
    return this.account(uid);
  }

  /** A link that lets the person set a new password (for a new account, or when the email does not arrive). */
  async passwordLink(actor: Actor, uid: string): Promise<string> {
    const user = await this.account(uid);
    if (!user.email) throw new AccessError("bad-email", `account ${uid} has no email`, [uid]);
    const link = await this.auth.generatePasswordResetLink(user.email);
    await this.logNow(actor, "account.passwordLink", user.email, {});
    return link;
  }

  // ---- Alarm emails ----------------------------------------------------------------------

  /** A plant's alarm email settings (the defaults until saved), for the admin page. */
  async notifySettings(project: string): Promise<NotifyView> {
    checkIds([project], "project");
    const [plant, stored] = await this.db.getAll(this.db.doc(`projects/${project}`), this.db.doc(`${NOTIFY_CONFIG}/${project}`));
    if (!plant.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
    return {
      project,
      config: readNotifyConfig(stored.data()),
      updatedAt: (stored.get("updatedAt") as Timestamp | undefined)?.toMillis() ?? null,
      updatedBy: text(stored.get("updatedBy")),
    };
  }

  /** Save a plant's alarm email settings (services/ingest picks them up at once). */
  async saveNotify(actor: Actor, project: string, input: NotifyConfig): Promise<{ changed: boolean; config: NotifyConfig }> {
    checkIds([project], "project");
    const config = cleanNotify(input);
    const plantRef = this.db.doc(`projects/${project}`);
    const ref = this.db.doc(`${NOTIFY_CONFIG}/${project}`);
    return this.db.runTransaction(async (tx) => {
      const [plant, before] = await tx.getAll(plantRef, ref);
      if (!plant.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
      const changed = !before.exists || JSON.stringify(readNotifyConfig(before.data())) !== JSON.stringify(config);
      if (changed) {
        tx.set(ref, { ...config, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.email });
        // Turned off: forget what was emailed, so turning on again starts afresh (no "cleared" emails for old alarms).
        if (!config.enabled) tx.delete(this.db.doc(`${NOTIFY_STATE}/${project}`));
        const { enabled, minSeverity, cleared, locale } = config;
        this.logIn(tx, actor, "project.notify", project, { enabled, recipients: config.recipients.length, minSeverity, cleared, locale });
      }
      return { changed, config };
    });
  }

  /** Queue a test email to these recipients now, saying what these settings (saved or not) send. */
  async testNotify(actor: Actor, project: string, input: NotifyConfig, siteUrl: string): Promise<{ sent: number }> {
    checkIds([project], "project");
    const config = cleanNotify({ ...input, enabled: input.enabled === true });
    if (config.recipients.length === 0) throw new AccessError("bad-notify", "no recipients to send to", ["none-to-send"]);
    const plant = await this.db.doc(`projects/${project}`).get();
    if (!plant.exists) throw new AccessError("project-missing", `no registry for ${project}`, [project]);
    const content = testEmail(text(plant.get("name")) ?? project, config, siteUrl);
    const deleteAfter = new Date(Date.now() + KEEP_MAIL_MS);
    const batch = this.db.batch();
    for (const to of config.recipients) batch.create(this.db.collection("mail").doc(), mailDocument(to, content, deleteAfter, { kind: "test", project }));
    this.logIn(batch, actor, "project.notifyTest", project, { recipients: config.recipients.length });
    await batch.commit();
    return { sent: config.recipients.length };
  }

  // ---- Audit log -------------------------------------------------------------------------

  private entry(actor: Actor, action: AdminAction, target: string, details: LogEntry["details"]) {
    return { at: FieldValue.serverTimestamp(), actor: actor.email, actorUid: actor.uid, via: actor.via, action, target, details };
  }

  private logIn(writer: Transaction | WriteBatch, actor: Actor, action: AdminAction, target: string, details: LogEntry["details"]) {
    const ref = this.db.collection(LOG).doc();
    const entry = this.entry(actor, action, target, details);
    if (writer instanceof WriteBatch) writer.set(ref, entry);
    else writer.set(ref, entry);
  }

  private async logNow(actor: Actor, action: AdminAction, target: string, details: LogEntry["details"]) {
    await this.db.collection(LOG).add(this.entry(actor, action, target, details));
  }

  /** Write an audit log entry for a change made outside Firestore (device models, Modbus settings). */
  async record(actor: Actor, action: AdminAction, target: string, details: LogEntry["details"]): Promise<void> {
    await this.logNow(actor, action, target, details);
  }
}
