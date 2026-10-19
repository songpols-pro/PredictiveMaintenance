// Who may open which project in the web app: custom claims on Firebase Auth accounts (see
// pdm-app/src/lib/access/model.ts). Operators can do the same on the web admin page (/hvac/admin);
// both use pdm-app/src/lib/access, and every change is written to the audit log (Firestore adminLog).
//
//   npm run access -- --list                                              every account that has access
//   npm run access -- --email name@company.co.th                          show the account's access
//   npm run access -- --email name@company.co.th --create --org acme      create the account (no password yet,
//                                                                         see --reset-link) with access
//   npm run access -- --email name@company.co.th --org acme               add a customer: all of its projects,
//                                                                         including ones added later (npm run org)
//   npm run access -- --email name@company.co.th --remove-org acme        remove a customer
//   npm run access -- --email name@company.co.th --project hq-chiller     add a single project (exceptions,
//                                                                         e.g. a contractor for one plant)
//   npm run access -- --email name@company.co.th --remove hq-chiller      remove a single project
//   npm run access -- --email name@company.co.th --admin yes|no           operator: every project
//   npm run access -- --email name@company.co.th --disabled yes|no        disable or enable the account
//   npm run access -- --email name@company.co.th --reset-link             print a link to set a new password
//
// The user sees a change of access at their next sign-in, or right away with "Check again" in the web
// app; a removal reaches a session that stays open within the hour (when its sign-in token renews).

import "./env";
import { parseArgs } from "node:util";
import type { UserRecord } from "firebase-admin/auth";
import { AccessAdmin, AccessError, cliActor } from "../../../pdm-app/src/lib/access/admin";
import { accessOf, hasAccess, normalizeAccess, redundantProjects, type Access } from "../../../pdm-app/src/lib/access/model";
import { config } from "./config";

const USAGE =
  "Usage: npm run access -- --list | --email <email> [--create] [--org <id>]... [--remove-org <id>]... [--project <id>]... [--remove <id>]... [--admin yes|no] [--disabled yes|no] [--reset-link]";

const { values: args } = parseArgs({
  options: {
    list: { type: "boolean" },
    email: { type: "string" },
    create: { type: "boolean" },
    org: { type: "string", multiple: true },
    "remove-org": { type: "string", multiple: true },
    project: { type: "string", multiple: true },
    remove: { type: "string", multiple: true },
    admin: { type: "string" },
    disabled: { type: "string" },
    "reset-link": { type: "boolean" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const yesNo = (v: string | undefined, flag: string) => {
  if (v === undefined) return undefined;
  if (v !== "yes" && v !== "no") fail(`${flag} takes "yes" or "no"`);
  return v === "yes";
};

if (!config.firebaseProjectId) throw new Error("FIREBASE_PROJECT_ID is not set (see .env.example)");
const admin = AccessAdmin.forProject(config.firebaseProjectId);
const actor = cliActor();

const describe = (a: Access) =>
  [a.admin ? "admin (every project)" : null, a.orgs.length ? `customers: ${a.orgs.join(", ")}` : null, a.projects.length ? `projects: ${a.projects.join(", ")}` : null].filter(Boolean).join(" · ");

if (args.list) {
  if (args.email) fail(USAGE);
  for (const u of (await admin.users()).filter((u) => hasAccess(accessOf(u.customClaims)))) {
    console.log(`${u.email ?? u.uid}${u.disabled ? " (disabled)" : ""}: ${describe(accessOf(u.customClaims))}`);
  }
  process.exit(0);
}
if (!args.email) fail(USAGE);

const makeAdmin = yesNo(args.admin, "--admin");
const disabled = yesNo(args.disabled, "--disabled");
const change = (before: Access): Access => {
  const orgs = new Set(before.orgs);
  for (const o of args.org ?? []) orgs.add(o);
  for (const o of args["remove-org"] ?? []) orgs.delete(o);
  const projects = new Set(before.projects);
  for (const p of args.project ?? []) projects.add(p);
  for (const p of args.remove ?? []) projects.delete(p);
  return { admin: makeAdmin ?? before.admin, orgs: [...orgs], projects: [...projects] };
};

let user: UserRecord;
let changed = false;
try {
  if (args.create) {
    user = await admin.createAccount(actor, args.email, normalizeAccess(change({ admin: false, orgs: [], projects: [] })));
    changed = true;
    console.log(`${user.email}: account created without a password; send the person a link with --reset-link`);
  } else {
    user = await admin.accountByEmail(args.email);
    const result = await admin.setAccess(actor, user.uid, change);
    changed = result.changed;
  }
  if (disabled !== undefined && disabled !== (await admin.account(user.uid)).disabled) {
    await admin.setDisabled(actor, user.uid, disabled);
    changed = true;
  }
} catch (e) {
  if (e instanceof AccessError && e.code === "account-missing") fail(`No account for ${args.email}. Create it with --create, or on the admin page (/hvac/admin).`);
  if (e instanceof AccessError) fail(`Not saved: ${e.message}`);
  throw e;
}

// Where the account stands now: its customers' projects, then single projects.
const [now, orgs, projects] = await Promise.all([admin.account(user.uid), admin.orgs(), admin.projects()]);
const after = accessOf(now.customClaims);
const covered = (o: string) => projects.filter((p) => p.org === o).map((p) => p.id);
console.log(`${now.email}${now.disabled ? " (disabled: cannot sign in)" : ""}`);
console.log(`  admin:     ${after.admin ? "yes (every project)" : "no"}`);
console.log(`  customers: ${after.orgs.length ? after.orgs.map((o) => `${o} · ${orgs.find((x) => x.id === o)?.name ?? o} (${covered(o).join(", ") || "no projects yet"})`).join(", ") : "(none)"}`);
console.log(`  projects:  ${after.projects.length ? after.projects.join(", ") : "(none)"}`);
const redundant = redundantProjects(after, projects);
if (redundant.length) {
  console.log(`  note: ${redundant.map((p) => `${p} (${projects.find((x) => x.id === p)?.org})`).join(", ")} also come with the account's customers; --remove them to keep access in one place`);
}
console.log(changed ? '  updated: takes effect at the next sign-in, or with "Check again" in the web app' : "  (no change)");
if (args["reset-link"]) console.log(`  set-password link (valid for a limited time, share it only with this person):\n  ${await admin.passwordLink(actor, user.uid)}`);
