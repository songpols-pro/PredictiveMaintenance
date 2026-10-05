// 90 days of hourly sensor readings per asset, generated lazily and cached.
// Readings follow the asset's health model, so degrading assets cross their thresholds
// at the same time their health score and RUL say they should.

import type { SensorKind, SensorPoint, SensorSeries, TimeRange } from "@/lib/types";
import { TYPE_PROFILES } from "./catalog";
import { getModel, sensorNowValue } from "./assets";
import { DAY, HOUR, NOW, between, gaussian, round, seeded } from "./random";

const HOURS = 90 * 24;
const raw = new Map<string, SensorPoint[]>();

function generate(assetId: string, kind: SensorKind): SensorPoint[] {
  const model = getModel(assetId);
  if (!model) return [];
  const tpl = TYPE_PROFILES[model.asset.type].sensors.find((s) => s.kind === kind);
  if (!tpl) return [];

  const rand = seeded(`${assetId}:${kind}`);
  const base = model.sensorBaselines[kind] ?? tpl.base;
  const degrading = model.scenario?.kind === "degrading";
  const fNow = degrading ? Math.max(model.degradation(0), 0.01) : 1;
  const target = sensorNowValue(model, kind);
  const sign = tpl.direction === "above" ? 1 : -1;
  // How strongly this sensor reacts to the asset's failure mode.
  const involvement = kind === model.failureMode.primary ? 1 : (model.failureMode.secondary[kind] ?? 0);
  const points: SensorPoint[] = [];

  for (let i = HOURS; i >= 0; i--) {
    const t = NOW - i * HOUR;
    if (model.offlineSince !== null && t > model.offlineSince) {
      points.push({ t, v: null });
      continue;
    }
    const daysAgo = (NOW - t) / DAY;
    const hourOfDay = new Date(t).getHours();
    const load = Math.sin(((hourOfDay - 8) / 24) * 2 * Math.PI);
    const f = degrading ? model.degradation(daysAgo) / fNow : 0;
    let v = base + (target - base) * f + load * tpl.daily + gaussian(rand) * tpl.noise;

    // Anomalies: rare on healthy assets, increasingly frequent as degradation accelerates.
    const pAnomaly = degrading ? 0.0005 + 0.014 * f * f * involvement : 0.0005;
    let anomaly: number | null = null;
    if (rand() < pAnomaly) {
      v += sign * (tpl.noise * between(rand, 4, 6.5) + Math.abs(target - base) * 0.12 * f);
      anomaly = v;
    }
    const digits = tpl.unit === "bar" && base < 20 ? 2 : 1;
    points.push({ t, v: round(v, digits), anomaly: anomaly === null ? null : round(anomaly, digits) });
  }
  // Pin the latest reading of degrading assets to the modeled value, so the alert text matches.
  if (degrading && model.offlineSince === null) {
    const last = points[points.length - 1];
    const digits = tpl.unit === "bar" && base < 20 ? 2 : 1;
    last.v = round(target, digits);
    last.anomaly = null;
  }
  return points;
}

function rawSeries(assetId: string, kind: SensorKind): SensorPoint[] {
  const key = `${assetId}:${kind}`;
  let pts = raw.get(key);
  if (!pts) {
    pts = generate(assetId, kind);
    raw.set(key, pts);
  }
  return pts;
}

const RANGE: Record<TimeRange, { ms: number; bucketHours: number }> = {
  "24h": { ms: DAY, bucketHours: 1 },
  "7d": { ms: 7 * DAY, bucketHours: 1 },
  "30d": { ms: 30 * DAY, bucketHours: 4 },
  "90d": { ms: 90 * DAY, bucketHours: 12 },
};

function downsample(points: SensorPoint[], bucketHours: number, direction: "above" | "below"): SensorPoint[] {
  if (bucketHours <= 1) return points;
  const out: SensorPoint[] = [];
  for (let i = 0; i < points.length; i += bucketHours) {
    const bucket = points.slice(i, i + bucketHours);
    const vals = bucket.map((p) => p.v).filter((v): v is number => v !== null);
    const anomalies = bucket.map((p) => p.anomaly).filter((v): v is number => v !== null && v !== undefined);
    const anomaly = anomalies.length
      ? direction === "above"
        ? Math.max(...anomalies)
        : Math.min(...anomalies)
      : null;
    out.push({
      t: bucket[bucket.length - 1].t,
      v: vals.length ? round(vals.reduce((s, v) => s + v, 0) / vals.length, 2) : null,
      anomaly,
    });
  }
  return out;
}

export function buildSensorSeries(assetId: string, kind: SensorKind, range: TimeRange): SensorSeries | null {
  const model = getModel(assetId);
  if (!model) return null;
  const tpl = TYPE_PROFILES[model.asset.type].sensors.find((s) => s.kind === kind);
  if (!tpl) return null;
  const { ms, bucketHours } = RANGE[range];
  const all = rawSeries(assetId, kind);
  const inRange = all.filter((p) => p.t > NOW - ms);
  const points = downsample(inRange, bucketHours, tpl.direction);
  const latest = [...all].reverse().find((p) => p.v !== null)?.v ?? null;
  return {
    config: { kind, label: tpl.label, unit: tpl.unit, direction: tpl.direction, warning: tpl.warning, critical: tpl.critical },
    points,
    baseline: round(model.sensorBaselines[kind] ?? tpl.base, 2),
    latest,
    anomalyCount: inRange.filter((p) => p.anomaly !== null && p.anomaly !== undefined).length,
  };
}

/** Readings around an alert trigger, used as evidence in the alert detail panel. */
export function sensorWindow(assetId: string, kind: SensorKind, endMs: number, hours = 48): SensorPoint[] {
  return rawSeries(assetId, kind).filter((p) => p.t > endMs - hours * HOUR && p.t <= endMs);
}
