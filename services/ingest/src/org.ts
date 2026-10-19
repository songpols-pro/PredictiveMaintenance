// Customers (organizations) and the projects they own. An account given a customer
// (`npm run access -- --org`) opens every project of it, including projects added later: adding a
// plant to a customer is one command here, and its users see it at once without signing in again.
// Operators can do the same on the web admin page (/hvac/admin); both use pdm-app/src/lib/access.
//
//   npm run org                                              every customer and its projects
//   npm run org -- --org acme                                one customer: projects and accounts
//   npm run org -- --org acme --name "ACME Co., Ltd."        create the customer, or rename it
//   npm run org -- --org acme --project hq-chiller           give a project to the customer (moved if another one had it)
//   npm run org -- --org acme --remove hq-chiller            take a project away from the customer
//   npm run org -- --org acme --delete                       delete a customer without projects or accounts
//
// Firestore: orgs/{org} { name }, projects/{project}.org. A project needs its registry first
// (`npm run registry`), so a mistyped id is refused instead of creating an empty project.
// firestore.rules see a change at once, the web app's /api/hvac routes within a minute.
// Every change is written to the audit log (Firestore adminLog), as done by <user>@<computer>.

import "./env";
import { parseArgs } from "node:util";
import { AccessAdmin, AccessError, cliActor } from "../../../pdm-app/src/lib/access/admin";
import { accessOf, ID } from "../../../pdm-app/src/lib/access/model";
import { config } from "./config";

const USAGE = 'Usage: npm run org [-- --org <id> [--name "<customer name>"] [--project <id>]... [--remove <id>]... [--delete]]';

const { values: args } = parseArgs({
  options: {
    org: { type: "string" },
    name: { type: "string" },
    project: { type: "string", multiple: true },
    remove: { type: "string", multiple: true },
    delete: { type: "boolean" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!config.firebaseProjectId) throw new Error("FIREBASE_PROJECT_ID is not set (see .env.example)");
const admin = AccessAdmin.forProject(config.firebaseProjectId);
const actor = cliActor();
const adding = args.project ?? [];
const removing = args.remove ?? [];
const label = (p: { id: string; name: string | null }) => `${p.id}${p.name ? ` · ${p.name}` : ""}`;

if (!args.org) {
  if (args.name !== undefined || adding.length || removing.length || args.delete) fail(USAGE);
  const [orgs, projects] = await Promise.all([admin.orgs(), admin.projects()]);
  if (!orgs.length) console.log('No customers yet. Create one with: npm run org -- --org <id> --name "<customer name>"');
  for (const o of orgs) {
    const own = projects.filter((p) => p.org === o.id);
    console.log(`${o.id} · ${o.name}: ${own.length} project(s)`);
    for (const p of own) console.log(`  ${label(p)}`);
  }
  const known = new Set(orgs.map((o) => o.id));
  const rest = projects.filter((p) => p.org === null || !known.has(p.org));
  if (rest.length) console.log(`No customer: ${rest.length} project(s)`);
  for (const p of rest) console.log(`  ${label(p)}${p.org ? ` (customer "${p.org}" does not exist, see --name)` : ""}`);
  process.exit(0);
}

const org = args.org;
if (!ID.test(org)) fail(`"${org}" is not a customer id (lowercase letters, digits and "-", up to 32)`);
if (args.delete && (args.name !== undefined || adding.length || removing.length)) fail("--delete goes alone");

try {
  if (args.delete) {
    await admin.deleteOrg(actor, org);
    console.log(`${org}: deleted`);
    process.exit(0);
  }
  if (args.name !== undefined) {
    const { created, changed } = await admin.saveOrg(actor, org, args.name);
    console.log(!changed ? `${org}: name unchanged` : created ? `${org}: created as "${args.name.trim()}"` : `${org}: renamed to "${args.name.trim()}"`);
  } else if (!(await admin.orgs()).some((o) => o.id === org)) {
    fail(`No customer "${org}". Create it first: npm run org -- --org ${org} --name "<customer name>"`);
  }
  if (adding.length || removing.length) {
    const { added, removed } = await admin.assignProjects(actor, org, adding, removing);
    for (const p of adding) {
      const a = added.find((x) => x.project === p);
      console.log(a ? `${p}: added to ${org}${a.from ? ` (moved from ${a.from})` : ""}` : `${p}: already a project of ${org}`);
    }
    for (const p of removed) console.log(`${p}: removed from ${org}`);
  }
} catch (e) {
  if (e instanceof AccessError) fail(`Nothing changed: ${e.message}`);
  throw e;
}

// Where the customer stands now.
const [orgs, projects, users] = await Promise.all([admin.orgs(), admin.projects(), admin.users()]);
const own = projects.filter((p) => p.org === org);
const ids = own.map((p) => p.id);
const members = users.filter((u) => accessOf(u.customClaims).orgs.includes(org));
const guests = users.flatMap((u) => {
  const a = accessOf(u.customClaims);
  const single = a.projects.filter((p) => ids.includes(p));
  return single.length && !a.orgs.includes(org) ? [`${u.email ?? u.uid} (${single.join(", ")})`] : [];
});
const operators = users.filter((u) => accessOf(u.customClaims).admin).length;
console.log(`${org} · ${orgs.find((o) => o.id === org)?.name ?? "(no name)"}`);
console.log(`  projects: ${own.length ? own.map(label).join(", ") : "(none)"}`);
console.log(`  accounts: ${members.length ? members.map((u) => `${u.email ?? u.uid}${u.disabled ? " (disabled)" : ""}`).join(", ") : "(none)"}`);
if (guests.length) console.log(`  single-project accounts: ${guests.join(", ")}`);
console.log(`  plus ${operators} operator account(s), which see every project`);
