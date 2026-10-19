// GET  /api/hvac/alarms?project=hq-chiller&from=<ms>&to=<ms>   alarm log → { alarms: HvacAlarm[] }
// POST /api/hvac/alarms  { project, ids: ["fault:42", "gateway:plc-01@<since>", "comm:CH-1@<since>", ...] }
//      acknowledge active alarms → { acked: [...] }
// Fault alarms: stored in TimescaleDB and copied to the live alarm documents in Firestore.
// Communication losses (computed by the screens from the gateway documents, see commAlarmId in
// lib/hvac/live-alarms.ts): projects/{project}/commAcks/{key}, one document per gateway or device
// (lib/server/comm-acks.ts). Either way every signed-in screen sees them, and the alarm log says who
// acknowledged each alarm and when.

import { getFirestore } from "firebase-admin/firestore";
import { MAX_LOG_DAYS } from "@/lib/hvac/alarms";
import { adminApp } from "@/lib/server/admin";
import { ackCommLosses, parseCommLoss, readCommAcks, type CommLoss } from "@/lib/server/comm-acks";
import { authorize } from "@/lib/server/hvac-auth";
import { ackFaults, alarmLog } from "@/lib/server/hvac-history";
import { historyConfigured } from "@/lib/server/timescale";

const DAY = 86_400_000;
const MAX_IDS = 500;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const project = q.get("project");
  const caller = await authorize(request, project);
  if (caller instanceof Response) return caller;
  if (!historyConfigured()) return Response.json({ error: "history store not configured" }, { status: 503 });

  const from = Number(q.get("from"));
  const to = Number(q.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > MAX_LOG_DAYS * DAY) return Response.json({ error: "bad time range" }, { status: 400 });
  // Without them the log still shows every alarm, only not who acknowledged the communication losses.
  const acks = await readCommAcks(getFirestore(adminApp()), project!).catch(() => []);
  return Response.json({ alarms: await alarmLog(project!, from, to, acks) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { project?: unknown; ids?: unknown } | null;
  const project = typeof body?.project === "string" ? body.project : null;
  const caller = await authorize(request, project);
  if (caller instanceof Response) return caller;

  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  const faults = ids.filter((x) => /^fault:\d+$/.test(x)).map((x) => Number(x.slice(6)));
  const losses = ids.map(parseCommLoss).filter((x): x is CommLoss => x !== null);
  if (faults.length + losses.length === 0 || ids.length > MAX_IDS) return Response.json({ error: "bad ids" }, { status: 400 });
  // Communication losses need Firestore only, so they are stored even without the history store.
  if (losses.length === 0 && !historyConfigured()) return Response.json({ error: "history store not configured" }, { status: 503 });

  const who = caller.email ?? caller.uid;
  const db = getFirestore(adminApp());
  const [ackedFaults, ackedLosses] = await Promise.all([
    faults.length && historyConfigured()
      ? ackFaults(project!, faults, who).then(async (acked) => {
          // Copy to the live view. An alarm that cleared meanwhile has no document any more: skip it.
          await Promise.all(
            acked.map((a) =>
              db
                .doc(`projects/${project}/alarms/${a.id}`)
                .update({ ackedAt: new Date(a.ackedAt), ackedBy: who })
                .catch(() => undefined),
            ),
          );
          return acked.map((a) => `fault:${a.id}`);
        })
      : [],
    losses.length ? ackCommLosses(db, project!, losses, who) : [],
  ]);
  return Response.json({ acked: [...ackedFaults, ...ackedLosses] });
}
