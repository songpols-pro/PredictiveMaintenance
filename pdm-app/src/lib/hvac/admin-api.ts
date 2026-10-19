"use client";

// The admin page's calls to /api/hvac/admin (operators only), with the signed-in operator's ID token.

import type { AccessErrorCode, AccountRow, AdminRequest, Access, Overview } from "@/lib/access/model";
import type { ModelView, PlantModbusView } from "@/lib/access/models";
import type { RegistryView } from "@/lib/access/registry";
import type { NotifyConfig, NotifyView } from "@/lib/notify/config";
import type { ModelSummary } from "@/lib/telemetry/register-map";
import { idToken } from "@/lib/firebase/session";

export type AdminErrorCode = AccessErrorCode | "forbidden" | "signedOut" | "network" | "failed";

/** A refused or failed call; `code` picks the message, `ids` are the customers, projects or emails concerned. */
export class AdminApiError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    readonly ids: string[] = [],
    message: string = code,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function call<T>(init?: RequestInit, query = ""): Promise<T> {
  const token = await idToken();
  let res: Response;
  try {
    res = await fetch(`/api/hvac/admin${query}`, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new AdminApiError("network");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; ids?: string[]; message?: string };
  if (res.ok) return body as T;
  const code = res.status === 401 ? "signedOut" : res.status === 403 ? "forbidden" : ((body.error as AdminErrorCode | undefined) ?? "failed");
  throw new AdminApiError(code, body.ids ?? [], body.message);
}

export const loadOverview = () => call<Overview>();

/** A plant's device registry for the editor; `unregistered` for a project that sends data but has no registry yet. */
export const loadRegistry = (project: string, unregistered = false) =>
  call<RegistryView>(undefined, `?registry=${encodeURIComponent(project)}${unregistered ? "&new=1" : ""}`);

/** Every device model (register map), with its counts. */
export const loadModels = () => call<ModelSummary[]>(undefined, "?models");
/** One device model, for its editor. */
export const loadModel = (id: string) => call<ModelView>(undefined, `?model=${encodeURIComponent(id)}`);
/** A plant's devices with their Modbus settings and the models they use. */
export const loadPlantModbus = (project: string) => call<PlantModbusView>(undefined, `?modbus=${encodeURIComponent(project)}`);
/** A plant's alarm email settings. */
export const loadNotify = (project: string) => call<NotifyView>(undefined, `?notify=${encodeURIComponent(project)}`);

type Result<A extends AdminRequest["action"]> = A extends "saveNotify"
  ? { changed: boolean; config: NotifyConfig }
  : A extends "testNotify"
    ? { sent: number }
    : A extends "saveModel"
  ? { created: boolean }
  : A extends "saveModbus"
    ? { changed: boolean }
    : A extends "saveRegistry"
  ? { created: boolean; changed: boolean; devices: number; profiles: number }
  : A extends "createAccount"
  ? { account: AccountRow }
  : A extends "setAccess"
    ? { access: Access; changed: boolean }
    : A extends "setDisabled"
      ? { account: AccountRow }
      : A extends "passwordLink"
        ? { link: string }
        : A extends "assignProjects"
          ? { added: { project: string; from: string | null }[]; removed: string[] }
          : A extends "saveOrg"
            ? { created: boolean; changed: boolean }
            : Record<string, never>;

export function adminAction<R extends AdminRequest>(request: R): Promise<Result<R["action"]>> {
  return call<Result<R["action"]>>({ method: "POST", body: JSON.stringify(request) });
}
