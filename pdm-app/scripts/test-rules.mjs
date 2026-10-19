// Checks firestore.rules against the Firestore emulator: who can read which project, customer and
// collection. Start the emulator first (from pdm-app):
//   npx firebase-tools@13 emulators:start --only firestore --project demo-pdm-monitor
// then: npm run test:rules
// Test data is written with the Admin SDK (not subject to the rules) and cleared at the start.

import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, where } from "firebase/firestore";

const PROJECT = "demo-pdm-monitor";
const HOST = "127.0.0.1";
const PORT = 8085;
process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PORT}`;

const res = await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" }).catch(() => null);
if (!res?.ok) {
  console.error(`No Firestore emulator on ${HOST}:${PORT}. Start it first (see the top of this file).`);
  process.exit(1);
}

const admin = adminDb(initAdmin({ projectId: PROJECT }));
await Promise.all([
  admin.doc("orgs/acme").set({ name: "ACME" }),
  admin.doc("orgs/beta").set({ name: "Beta" }),
  admin.doc("projects/p1").set({ name: "P1", org: "acme" }),
  admin.doc("projects/p2").set({ name: "P2", org: "beta" }),
  admin.doc("projects/p3").set({ name: "P3 (no customer)" }),
  admin.doc("projects/p1/gateways/g1").set({ state: "online" }),
  admin.doc("projects/p1/alarms/a1").set({ code: "x" }),
  admin.doc("projects/p1/commAcks/gateway:g1").set({ since: 1, ackedBy: "x@example.com" }),
  admin.doc("projects/p2/commAcks/gateway:g1").set({ since: 1, ackedBy: "x@example.com" }),
  admin.doc("projects/p2/gateways/g1").set({ state: "online" }),
  admin.doc("projects/p3/gateways/g1").set({ state: "online" }),
  admin.doc("projects/ghost/gateways/g1").set({ state: "online" }), // live data, no registry document
  admin.doc("demoRequests/r1").set({ email: "x@example.com" }),
  admin.doc("adminLog/l1").set({ action: "org.create", target: "acme" }),
  admin.doc("notifyConfig/p1").set({ enabled: true, recipients: ["x@example.com"] }),
  admin.doc("notifyState/p1").set({ open: {} }),
]);

let n = 0;
/** A web client signed in with these claims (null: signed out), talking to the emulator. */
function client(claims) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "test" }, `c${n++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, PORT, claims ? { mockUserToken: { sub: `u${n}`, email: `u${n}@example.com`, ...claims } } : undefined);
  return { app, db };
}

const read = (label, run) => ({ label, run });
const reads = {
  project: (p) => read(`get projects/${p}`, (db) => getDoc(doc(db, "projects", p))),
  gateway: (p) => read(`get projects/${p}/gateways/g1`, (db) => getDoc(doc(db, "projects", p, "gateways", "g1"))),
  gateways: (p) => read(`list projects/${p}/gateways`, (db) => getDocs(collection(db, "projects", p, "gateways"))),
  alarms: (p) => read(`list projects/${p}/alarms`, (db) => getDocs(collection(db, "projects", p, "alarms"))),
  commAcks: (p) => read(`list projects/${p}/commAcks`, (db) => getDocs(collection(db, "projects", p, "commAcks"))),
  org: (o) => read(`get orgs/${o}`, (db) => getDoc(doc(db, "orgs", o))),
  allOrgs: () => read("list orgs", (db) => getDocs(collection(db, "orgs"))),
  allProjects: () => read("list projects", (db) => getDocs(collection(db, "projects"))),
  projectsIn: (orgs) => read(`list projects where org in [${orgs}]`, (db) => getDocs(query(collection(db, "projects"), where("org", "in", orgs)))),
  projectsOf: (org) => read(`list projects where org == ${org}`, (db) => getDocs(query(collection(db, "projects"), where("org", "==", org)))),
  demoRequests: () => read("list demoRequests", (db) => getDocs(collection(db, "demoRequests"))),
  adminLog: () => read("list adminLog", (db) => getDocs(collection(db, "adminLog"))),
  notifyConfig: (p) => read(`get notifyConfig/${p}`, (db) => getDoc(doc(db, "notifyConfig", p))),
  notifyState: (p) => read(`get notifyState/${p}`, (db) => getDoc(doc(db, "notifyState", p))),
};

const cases = [
  // [who, claims, read, expected allowed]
  ["signed out", null, reads.project("p1"), false],
  ["signed out", null, reads.gateways("p1"), false],
  ["signed out", null, reads.commAcks("p1"), false],
  ["no claims", {}, reads.project("p1"), false],
  ["no claims", {}, reads.gateways("p1"), false],
  ["no claims", {}, reads.projectsIn(["acme"]), false],

  ["acme user", { orgs: ["acme"] }, reads.project("p1"), true],
  ["acme user", { orgs: ["acme"] }, reads.gateway("p1"), true],
  ["acme user", { orgs: ["acme"] }, reads.gateways("p1"), true],
  ["acme user", { orgs: ["acme"] }, reads.alarms("p1"), true],
  ["acme user", { orgs: ["acme"] }, reads.commAcks("p1"), true],
  ["acme user", { orgs: ["acme"] }, reads.org("acme"), true],
  ["acme user", { orgs: ["acme"] }, reads.projectsIn(["acme"]), true],
  ["acme user", { orgs: ["acme"] }, reads.projectsOf("acme"), true],
  ["acme user", { orgs: ["acme"] }, reads.project("p2"), false],
  ["acme user", { orgs: ["acme"] }, reads.project("p3"), false],
  ["acme user", { orgs: ["acme"] }, reads.project("ghost"), false],
  ["acme user", { orgs: ["acme"] }, reads.gateways("p2"), false],
  ["acme user", { orgs: ["acme"] }, reads.commAcks("p2"), false],
  ["acme user", { orgs: ["acme"] }, reads.gateways("p3"), false],
  ["acme user", { orgs: ["acme"] }, reads.gateways("ghost"), false],
  ["acme user", { orgs: ["acme"] }, reads.org("beta"), false],
  ["acme user", { orgs: ["acme"] }, reads.allOrgs(), false],
  ["acme user", { orgs: ["acme"] }, reads.allProjects(), false],
  ["acme user", { orgs: ["acme"] }, reads.projectsIn(["acme", "beta"]), false],
  ["acme user", { orgs: ["acme"] }, reads.projectsOf("beta"), false],
  ["acme user", { orgs: ["acme"] }, reads.demoRequests(), false],

  ["acme + beta user", { orgs: ["acme", "beta"] }, reads.projectsIn(["acme", "beta"]), true],
  ["acme + beta user", { orgs: ["acme", "beta"] }, reads.gateways("p2"), true],
  ["acme + beta user", { orgs: ["acme", "beta"] }, reads.gateways("p3"), false],

  ["single-plant grant", { projects: ["p2"] }, reads.project("p2"), true],
  ["single-plant grant", { projects: ["p2"] }, reads.gateways("p2"), true],
  ["single-plant grant", { projects: ["p2"] }, reads.org("beta"), false],
  ["single-plant grant", { projects: ["p2"] }, reads.project("p1"), false],
  ["single-plant grant", { projects: ["p2"] }, reads.projectsIn(["beta"]), false],
  ["single-plant grant", { projects: ["ghost"] }, reads.gateways("ghost"), true],
  ["acme user + grant", { orgs: ["acme"], projects: ["p3"] }, reads.gateways("p3"), true],

  ["claims of the wrong type", { orgs: "acme", projects: "p1" }, reads.project("p1"), false],
  ["claims of the wrong type", { orgs: "acme", projects: "p1" }, reads.gateways("p1"), false],
  ["claims of the wrong type", { admin: "true" }, reads.allProjects(), false],

  ["operator", { admin: true }, reads.allProjects(), true],
  ["operator", { admin: true }, reads.allOrgs(), true],
  ["operator", { admin: true }, reads.project("p3"), true],
  ["operator", { admin: true }, reads.gateways("p3"), true],
  ["operator", { admin: true }, reads.gateways("ghost"), true],
  ["operator", { admin: true }, reads.demoRequests(), false],
  ["operator", { admin: true }, reads.adminLog(), false],
  ["acme user", { orgs: ["acme"] }, reads.adminLog(), false],
  // Alarm email recipients are personal data: server code only, operators edit them through the API.
  ["acme user", { orgs: ["acme"] }, reads.notifyConfig("p1"), false],
  ["operator", { admin: true }, reads.notifyConfig("p1"), false],
  ["operator", { admin: true }, reads.notifyState("p1"), false],
];

let failed = 0;
for (const [who, claims, { label, run }, expected] of cases) {
  const { app, db } = client(claims);
  let allowed;
  let detail = "";
  try {
    await run(db);
    allowed = true;
  } catch (e) {
    allowed = false;
    if (e.code !== "permission-denied") detail = ` (${e.code ?? e.message})`;
  }
  await deleteApp(app);
  const ok = allowed === expected && !detail;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${who.padEnd(26)} ${label.padEnd(44)} ${allowed ? "allowed" : "denied"}${detail}`);
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
