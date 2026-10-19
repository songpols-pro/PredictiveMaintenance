// GET /api/hvac/history?project=hq-chiller&points=CH-1.chwOut,PLANT.kw&from=<ms>&to=<ms>&step=<ms>
// → { rows: [{ t, values: [...] }] }, one value per requested point (null where nothing was stored).

import { rowsFromBuckets } from "@/lib/hvac/history-spec";
import { MAX_HISTORY_POINTS, MAX_SAMPLES, pointById } from "@/lib/hvac/points";
import { authorize } from "@/lib/server/hvac-auth";
import { historyBuckets } from "@/lib/server/hvac-history";
import { projectLayout } from "@/lib/server/registry";
import { historyConfigured } from "@/lib/server/timescale";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const project = q.get("project");
  const caller = await authorize(request, project);
  if (caller instanceof Response) return caller;
  if (!historyConfigured()) return Response.json({ error: "history store not configured" }, { status: 503 });

  const layout = await projectLayout(project!);
  const points = (q.get("points") ?? "").split(",").filter(Boolean);
  const from = Number(q.get("from"));
  const to = Number(q.get("to"));
  const step = Number(q.get("step"));
  if (!points.length || points.length > MAX_HISTORY_POINTS || points.some((p) => !pointById(p, layout))) return Response.json({ error: "bad points" }, { status: 400 });
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || !Number.isInteger(step) || step < 60_000 || (to - from) / step > MAX_SAMPLES) {
    return Response.json({ error: "bad time range" }, { status: 400 });
  }

  const buckets = await historyBuckets(project!, points, from, to, step, layout);
  return Response.json({ rows: rowsFromBuckets(points, buckets, from, to, step, undefined, layout) });
}
