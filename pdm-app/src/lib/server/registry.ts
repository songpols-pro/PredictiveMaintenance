import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { layoutFromRegistry, type PlantLayout, type RegistryEntry } from "@/lib/hvac/layout";
import { adminApp } from "./admin";

// A project's document (projects/{project}): its device registry, for history queries that need the
// plant's chillers and meters, and the customer it belongs to, for access checks. Kept for a minute:
// registries change at commissioning, and a plant moved to another customer reaches the API within
// that minute (firestore.rules see it at once). Projects without a document are not kept, so
// requests for made-up ids do not fill the cache.

const TTL = 60_000;

interface ProjectRecord {
  layout: PlantLayout;
  org: string | null;
}

const cache = new Map<string, { at: number; record: ProjectRecord }>();

async function projectRecord(project: string): Promise<ProjectRecord> {
  const hit = cache.get(project);
  if (hit && Date.now() - hit.at < TTL) return hit.record;
  const snap = await getFirestore(adminApp()).doc(`projects/${project}`).get();
  const data = snap.data();
  const record: ProjectRecord = {
    layout: layoutFromRegistry(data?.devices as Record<string, RegistryEntry> | undefined),
    org: typeof data?.org === "string" && data.org ? data.org : null,
  };
  if (snap.exists) cache.set(project, { at: Date.now(), record });
  else cache.delete(project);
  return record;
}

/** Drop cached projects after a change made here (the admin API), so access checks see it at once. */
export function forgetProjects(projects: string[]) {
  for (const p of projects) cache.delete(p);
}

export async function projectLayout(project: string): Promise<PlantLayout> {
  return (await projectRecord(project)).layout;
}

/** The customer the project belongs to (field "org", set with `npm run org`); null when it has none. */
export async function projectOrg(project: string): Promise<string | null> {
  return (await projectRecord(project)).org;
}
