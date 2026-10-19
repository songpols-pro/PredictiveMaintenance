// GET /api/hvac/energy?project=hq-chiller&meters=PM-CH-1,PM-CH-2&times=<ms>,<ms>,...
// → { kwh: { "PM-CH-1": [counter at each time | null] } }. Energy between two times is the difference.

import { DEVICE_ID } from "@/lib/telemetry/contract";
import { authorize } from "@/lib/server/hvac-auth";
import { counterAt } from "@/lib/server/hvac-history";
import { historyConfigured } from "@/lib/server/timescale";

const MAX_TIMES = 400;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const project = q.get("project");
  const caller = await authorize(request, project);
  if (caller instanceof Response) return caller;
  if (!historyConfigured()) return Response.json({ error: "history store not configured" }, { status: 503 });

  const meters = (q.get("meters") ?? "").split(",").filter(Boolean);
  const times = (q.get("times") ?? "").split(",").filter(Boolean).map(Number);
  if (!meters.length || meters.length > 64 || meters.some((m) => !DEVICE_ID.test(m))) return Response.json({ error: "bad meters" }, { status: 400 });
  if (!times.length || times.length > MAX_TIMES || times.some((t) => !Number.isFinite(t))) return Response.json({ error: "bad times" }, { status: 400 });

  return Response.json({ kwh: await counterAt(project!, meters, times) });
}
