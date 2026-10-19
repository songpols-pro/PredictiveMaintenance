"use client";

// Live view of one project, pushed by Firestore:
//   projects/{project}                     registry: name, ownerLogo, devices.{id}.{kind, name, order, ...} (lib/access/registry.ts)
//                                          and the customer it belongs to: org (npm run org)
//   projects/{project}/gateways/{gateway}  state, interval, lastTs, lastSeen, devices.{id}.{values, ok, ts, errorAt}
//   projects/{project}/alarms/{id}         active alarms with their Thai and English names
//   projects/{project}/commAcks/{key}      the latest acknowledged communication loss per gateway or device
//                                          (key "gateway:<id>" / "comm:<id>"): since, ackedAt, ackedBy
// Gateways and alarms are written by services/ingest (see its live.ts), commAcks by /api/hvac/alarms.
// Customers' names are in orgs/{org}.

import { collection, doc, onSnapshot, query, where, type DocumentData, type FirestoreError } from "firebase/firestore";
import { clientDb } from "@/lib/firebase/client";
import { snapFromReadings, type Readings } from "./from-readings";
import { allDevices, layoutFromRegistry, type PlantLayout, type RegistryEntry } from "./layout";
import { DEFAULT_INTERVAL_S, liveAlarms, ms, SILENT_CYCLES, type AlarmDocData, type CommAckDocData, type GatewayDocData } from "./live-alarms";
import type { HvacAlarm } from "./model";

/** What the live store keeps for one project (see LiveData in live.ts). */
export interface LiveProjectData {
  snap: ReturnType<typeof snapFromReadings>;
  layout: PlantLayout;
  /** Devices that report data but are not in the registry yet (commissioning): shown as they are. */
  unassigned: { id: string; values: Record<string, number | null>; ok: boolean }[];
  alarms: HvacAlarm[];
  /** Server time the newest message arrived (ms). */
  receivedAt: number;
  /** Readings older than this are stale: 2.5 × the slowest gateway's cycle. */
  staleAfter: number;
}

function build(layout: PlantLayout, gateways: Map<string, GatewayDocData>, alarmDocs: (AlarmDocData & { id: string })[], commAcks: Map<string, CommAckDocData>, now: number): LiveProjectData {
  const readings: Readings = {};
  const deviceGateway = new Map<string, string>();
  let newestTs = 0;
  let receivedAt = 0;
  let slowest = 0;
  for (const [id, g] of gateways) {
    slowest = Math.max(slowest, (g.interval ?? DEFAULT_INTERVAL_S) * 1000);
    newestTs = Math.max(newestTs, ms(g.lastTs));
    receivedAt = Math.max(receivedAt, ms(g.lastSeen));
    for (const [device, d] of Object.entries(g.devices ?? {})) {
      readings[device] = { values: d.values ?? {}, ok: d.ok !== false };
      deviceGateway.set(device, id);
    }
  }
  const { alarms, silent } = liveAlarms(gateways, alarmDocs, commAcks, now);

  const offline = (device: string) => {
    const g = deviceGateway.get(device);
    return g === undefined || silent.has(g);
  };
  const known = new Set(allDevices(layout).map((d) => d.id));
  const unassigned = Object.entries(readings)
    .filter(([id]) => !known.has(id))
    .map(([id, r]) => ({ id, values: r!.values, ok: r!.ok && !offline(id) }))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return {
    snap: snapFromReadings(newestTs || now, readings, offline, layout),
    layout,
    unassigned,
    alarms,
    receivedAt: receivedAt || now,
    staleAfter: SILENT_CYCLES * (slowest || DEFAULT_INTERVAL_S * 1000),
  };
}

/** Plant name and owner logo (path or URL) of a project, from its registry; null when not set. */
export interface ProjectInfo {
  name: string | null;
  ownerLogo: string | null;
  /** The customer the project belongs to (orgs/{org}); null when it has none. */
  org: string | null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const projectInfo = (data: DocumentData | undefined): ProjectInfo => ({ name: text(data?.name), ownerLogo: text(data?.ownerLogo), org: text(data?.org) });

/**
 * Listen to the name, logo and customer of one project; returns the function that stops listening.
 * A project without a registry, or one the account can no longer read, reports nulls.
 */
export function subscribeProjectInfo(project: string, onInfo: (info: ProjectInfo) => void): () => void {
  return onSnapshot(
    doc(clientDb(), "projects", project),
    (s) => onInfo(projectInfo(s.data())),
    () => onInfo(projectInfo(undefined)),
  );
}

/** Firestore "in" filters take up to 30 values. */
const IN_LIMIT = 30;

/**
 * Listen to the projects an account can list: every project for operators ("all"), else those of the
 * given customers (field org). onList gets all of them after each change, the first time once every
 * query has answered from the server; a refused query counts as no projects. An empty answer from the
 * offline cache is not reported, so a device without a connection does not look like an account
 * without plants. Returns the function that stops listening.
 */
export function subscribeProjectList(scope: "all" | string[], onList: (projects: Record<string, ProjectInfo>) => void): () => void {
  const projects = collection(clientDb(), "projects");
  const queries = scope === "all" ? [projects] : chunk(scope, IN_LIMIT).map((orgs) => query(projects, where("org", "in", orgs)));
  const parts: (Record<string, ProjectInfo> | null)[] = queries.map(() => null);
  const publish = () => {
    if (parts.every(Boolean)) onList(Object.assign({}, ...parts));
  };
  const stops = queries.map((q, i) =>
    onSnapshot(
      q,
      (s) => {
        if (s.empty && s.metadata.fromCache && !parts[i]) return;
        parts[i] = Object.fromEntries(s.docs.map((d) => [d.id, projectInfo(d.data())]));
        publish();
      },
      () => {
        parts[i] = {};
        publish();
      },
    ),
  );
  return () => stops.forEach((stop) => stop());
}

/** Listen to customers' names (orgs/{org}.name): every customer for operators ("all"), else the given ones. */
export function subscribeOrgNames(scope: "all" | string[], onNames: (names: Record<string, string>) => void): () => void {
  const db = clientDb();
  const names: Record<string, string> = {};
  const report = (org: string, data: DocumentData | undefined) => {
    const name = text(data?.name);
    if (name) names[org] = name;
    else delete names[org];
  };
  if (scope === "all") {
    return onSnapshot(
      collection(db, "orgs"),
      (s) => {
        for (const key of Object.keys(names)) delete names[key];
        for (const d of s.docs) report(d.id, d.data());
        onNames({ ...names });
      },
      () => onNames({}),
    );
  }
  const stops = scope.map((org) =>
    onSnapshot(
      doc(db, "orgs", org),
      (s) => {
        report(org, s.data());
        onNames({ ...names });
      },
      () => undefined,
    ),
  );
  return () => stops.forEach((stop) => stop());
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Listen to one project; returns the function that stops listening. */
export function subscribeProject(project: string, onData: (d: LiveProjectData) => void, onError: (e: FirestoreError) => void): () => void {
  const db = clientDb();
  let layout: PlantLayout | null = null;
  let gateways: Map<string, GatewayDocData> | null = null;
  let alarms: (AlarmDocData & { id: string })[] | null = null;
  let commAcks: Map<string, CommAckDocData> | null = null;
  const publish = () => {
    if (layout && gateways && alarms && commAcks) onData(build(layout, gateways, alarms, commAcks, Date.now()));
  };
  // A project without a registry document has no layout: every device it reports shows as unassigned.
  const stopRegistry = onSnapshot(
    doc(db, "projects", project),
    (s) => {
      layout = layoutFromRegistry((s.data()?.devices as Record<string, RegistryEntry> | undefined) ?? {});
      publish();
    },
    onError,
  );
  const stopGateways = onSnapshot(
    collection(db, "projects", project, "gateways"),
    (s) => {
      gateways = new Map(s.docs.map((d) => [d.id, d.data() as GatewayDocData]));
      publish();
    },
    onError,
  );
  const stopAlarms = onSnapshot(
    collection(db, "projects", project, "alarms"),
    (s) => {
      alarms = s.docs.map((d) => ({ id: d.id, ...(d.data() as AlarmDocData) }));
      publish();
    },
    onError,
  );
  // Acknowledgements only mark alarms: if they cannot be read, the plant is still shown (all unacknowledged).
  const stopCommAcks = onSnapshot(
    collection(db, "projects", project, "commAcks"),
    (s) => {
      commAcks = new Map(s.docs.map((d) => [d.id, d.data() as CommAckDocData]));
      publish();
    },
    () => {
      commAcks = new Map();
      publish();
    },
  );
  // Staleness depends on the clock as well as on new data: re-evaluate every 15 s.
  const tick = setInterval(publish, 15_000);
  return () => {
    stopRegistry();
    stopGateways();
    stopAlarms();
    stopCommAcks();
    clearInterval(tick);
  };
}
