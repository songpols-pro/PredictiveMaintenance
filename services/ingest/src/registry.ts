// Device registry of a project: its plant name and owner logo, the devices it has, their kind, name and
// order. The web screens draw the plant from it (Firestore projects/{project}); the register profile goes to TimescaleDB
// (devices.profile) so fault words become named alarms. Operators can do the same on the web admin page
// (/hvac/admin, Plants tab); both use pdm-app/src/lib/access, and every change is written to the audit
// log (Firestore adminLog), as done by <user>@<computer>.
//
//   npm run registry -- --fleet ../virtual-plc/fleet.example.json     every project of a fleet file
//   npm run registry -- --file hq-chiller.json                        one project file (below)
//   npm run registry -- --project hq-chiller                          show a project's registry
//
// Project file: { "project": "hq-chiller", "name": "HQ chiller plant", "ownerLogo": "/hvac/owners/hq.png", "devices": [ ...entries ] }
//   name:        plant name customers see in the project switcher (default: the project id)
//   ownerLogo:   optional logo of the plant owner at the top of the menu: a path under pdm-app/public
//                ("/hvac/owners/hq.png") or an https:// URL; without it the site-wide logo is shown
// Entry: { "id": "CH-1", "kind": "chiller", "name": "CHILLER-1", "capacityTon": 120, "profile": "carrier-30ram" }
//   kind:        chiller | pump | ahu | oau | meter | panel
//   optional:    name, label (short tag), profile, capacityTon (chillers), meterFor (meters: chiller id),
//                role (pumps: duty | standby)
// The file replaces the project's registry: devices left out leave the screens (their stored data stays),
// and so does an ownerLogo left out. The customer the project belongs to (org, npm run org) stays.
// Screens show the order of the file. The checks and the writes are in pdm-app/src/lib/access/registry.ts
// and admin.ts (saveRegistry).

import "./env";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { AccessAdmin, AccessError, cliActor } from "../../../pdm-app/src/lib/access/admin";
import { problemText, registryProblems, type RegistryDevice, type RegistryFile } from "../../../pdm-app/src/lib/access/registry";
import { DEVICE_KINDS } from "../../../pdm-app/src/lib/telemetry/catalog";
import { isMissingSchema, readModelSummaries } from "../../../pdm-app/src/lib/telemetry/register-store";
import { config } from "./config";
import { createPool } from "./db";

const { values: args } = parseArgs({ options: { fleet: { type: "string" }, file: { type: "string" }, project: { type: "string" } } });

function fromFleet(path: string): RegistryFile[] {
  const fleet = JSON.parse(readFileSync(path, "utf8")) as { projects?: { id: string; name?: string; ownerLogo?: string; gateways?: { devices?: RegistryDevice[] }[] }[] };
  return (fleet.projects ?? []).map((p) => ({ project: p.id, name: p.name, ownerLogo: p.ownerLogo, devices: (p.gateways ?? []).flatMap((g) => g.devices ?? []) }));
}

if (!config.firebaseProjectId) throw new Error("FIREBASE_PROJECT_ID is not set (see .env.example)");
const admin = AccessAdmin.forProject(config.firebaseProjectId);

if (args.project && !args.fleet && !args.file) {
  const snap = await admin.db.doc(`projects/${args.project}`).get();
  const devices = Object.entries((snap.data()?.devices ?? {}) as Record<string, RegistryDevice & { order?: number }>).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  console.log(`${args.project}${snap.data()?.name ? ` · ${snap.data()!.name}` : ""}: ${devices.length} device(s)${snap.exists ? "" : " (no registry yet)"}`);
  if (snap.data()?.ownerLogo) console.log(`  owner logo: ${snap.data()!.ownerLogo}`);
  console.log(`  customer:   ${snap.data()?.org ?? "(none, see npm run org)"}`);
  for (const [id, d] of devices) console.log(`  ${id.padEnd(10)} ${d.kind.padEnd(8)} ${d.name ?? ""}${d.meterFor ? ` → ${d.meterFor}` : ""}${d.capacityTon ? ` ${d.capacityTon} Ton` : ""}${d.role ? ` ${d.role}` : ""}`);
  process.exit(0);
}

const projects = args.fleet ? fromFleet(args.fleet) : args.file ? [JSON.parse(readFileSync(args.file, "utf8")) as RegistryFile] : [];
if (!projects.length) {
  console.error("Usage: npm run registry -- --fleet <fleet.json> | --file <project.json> | --project <id>");
  process.exit(1);
}

// Device models (register profiles) are in the database; the file is checked against them.
const pool = createPool(config.databaseUrl, config.dbCaFile);
const models = await readModelSummaries(pool).catch(async (e) => {
  await pool.end();
  if (!isMissingSchema(e)) throw e;
  console.error("The database has no device models yet: run npm run migrate first.");
  process.exit(1);
});
const kinds = Object.fromEntries(models.map((m) => [m.id, { kind: m.kind }]));
const problems = projects.flatMap((p) => registryProblems(p, kinds).map((problem) => problemText(p, problem, kinds)));
if (problems.length) {
  console.error(`Not saved, fix these first:\n  ${problems.join("\n  ")}`);
  await pool.end();
  process.exit(1);
}

const actor = cliActor();
try {
  for (const p of projects) {
    const { profiles } = await admin.saveRegistry(actor, p, pool, { mode: "save" });
    const counts = DEVICE_KINDS.map((k) => [k, p.devices.filter((d) => d.kind === k).length] as const).filter(([, n]) => n);
    console.log(`${p.project}: ${p.devices.length} device(s) saved (${counts.map(([k, n]) => `${n} ${k}`).join(", ")}), ${profiles} with a register profile`);
  }
} catch (e) {
  if (!(e instanceof AccessError)) throw e;
  console.error(`Not saved: ${e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
