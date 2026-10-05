// Generates the mock fleet: ~50 assets across 3 sites, with a handful of assets on a clear
// degradation path. A simple power-law health model drives health history, RUL with an
// interval, and (in sensors.ts) the sensor readings, so every number on screen agrees.

import type {
  Asset,
  AssetStatus,
  AssetType,
  ContributingFactor,
  HealthPoint,
  Prediction,
  SensorKind,
} from "@/lib/types";
import { SENSOR_LABELS, TYPE_PROFILES, type FailureModeDef } from "./catalog";
import { DAY, HOUR, NOW, between, gaussian, intBetween, isoAgo, round, seeded } from "./random";

const H0 = 92; // health score of a like-new asset
const FAILURE_LEVEL = 20; // health score treated as functional failure
export const MODEL_VERSION = "PdM-GBT v3.2";
export const SCORED_AT = Math.floor(NOW / HOUR) * HOUR;

type LayoutRow = [siteId: string, lineId: string, type: AssetType, count: number];

const LAYOUT: LayoutRow[] = [
  ["RYG", "RYG-L1", "CNC Spindle", 3],
  ["RYG", "RYG-L1", "Electric Motor", 2],
  ["RYG", "RYG-L1", "Gearbox", 1],
  ["RYG", "RYG-L2", "Conveyor", 3],
  ["RYG", "RYG-L2", "Electric Motor", 2],
  ["RYG", "RYG-UT", "Air Compressor", 2],
  ["RYG", "RYG-UT", "Centrifugal Pump", 3],
  ["RYG", "RYG-UT", "Fan / Blower", 1],
  ["CBI", "CBI-L1", "Hydraulic Press", 2],
  ["CBI", "CBI-L1", "Electric Motor", 2],
  ["CBI", "CBI-L1", "Gearbox", 1],
  ["CBI", "CBI-L2", "Fan / Blower", 3],
  ["CBI", "CBI-L2", "Conveyor", 2],
  ["CBI", "CBI-L2", "Electric Motor", 2],
  ["CBI", "CBI-UT", "Air Compressor", 2],
  ["CBI", "CBI-UT", "Centrifugal Pump", 3],
  ["AYT", "AYT-L1", "CNC Spindle", 2],
  ["AYT", "AYT-L1", "Fan / Blower", 2],
  ["AYT", "AYT-L1", "Electric Motor", 2],
  ["AYT", "AYT-L1", "Conveyor", 1],
  ["AYT", "AYT-L2", "Conveyor", 2],
  ["AYT", "AYT-L2", "Fan / Blower", 1],
  ["AYT", "AYT-L2", "Gearbox", 1],
  ["AYT", "AYT-UT", "Air Compressor", 2],
  ["AYT", "AYT-UT", "Centrifugal Pump", 2],
  ["AYT", "AYT-UT", "Fan / Blower", 1],
];

interface DegradingScenario {
  kind: "degrading";
  status: "critical" | "warning";
  mode: number; // index into the type's failure modes
  health: number;
  rul: number;
  rulLow: number;
  rulHigh: number;
  confidence: number;
  onsetDaysAgo: number;
}

interface OfflineScenario {
  kind: "offline";
  health: number;
  offlineForMs: number;
}

type Scenario = DegradingScenario | OfflineScenario;

const SCENARIOS: Record<string, Scenario> = {
  "RYG-PMP-303": { kind: "degrading", status: "critical", mode: 0, health: 31, rul: 6, rulLow: 4, rulHigh: 9, confidence: 0.86, onsetDaysAgo: 44 },
  "CBI-HPR-101": { kind: "degrading", status: "critical", mode: 0, health: 36, rul: 9, rulLow: 6, rulHigh: 14, confidence: 0.78, onsetDaysAgo: 42 },
  "AYT-CMP-301": { kind: "degrading", status: "critical", mode: 0, health: 39, rul: 12, rulLow: 8, rulHigh: 18, confidence: 0.74, onsetDaysAgo: 45 },
  "RYG-SPN-101": { kind: "degrading", status: "warning", mode: 0, health: 52, rul: 21, rulLow: 15, rulHigh: 30, confidence: 0.69, onsetDaysAgo: 45 },
  "RYG-MTR-204": { kind: "degrading", status: "warning", mode: 0, health: 55, rul: 25, rulLow: 16, rulHigh: 37, confidence: 0.58, onsetDaysAgo: 50 },
  "CBI-FAN-201": { kind: "degrading", status: "warning", mode: 0, health: 58, rul: 27, rulLow: 19, rulHigh: 38, confidence: 0.71, onsetDaysAgo: 36 },
  "AYT-FAN-103": { kind: "degrading", status: "warning", mode: 1, health: 61, rul: 34, rulLow: 24, rulHigh: 47, confidence: 0.64, onsetDaysAgo: 40 },
  "CBI-PMP-303": { kind: "degrading", status: "warning", mode: 1, health: 63, rul: 41, rulLow: 30, rulHigh: 56, confidence: 0.66, onsetDaysAgo: 48 },
  "AYT-CNV-201": { kind: "offline", health: 81, offlineForMs: 6 * HOUR + 12 * 60_000 },
  "CBI-FAN-203": { kind: "offline", health: 74, offlineForMs: 2 * DAY + 3 * HOUR },
};

/** Internal model parameters shared with the sensor generator. */
export interface AssetModel {
  asset: Asset;
  scenario: Scenario | null;
  failureMode: FailureModeDef;
  k: number;
  p: number;
  onset: number;
  baseHealth: number;
  offlineSince: number | null;
  /** fraction of the way from new to failure (0..1) at `daysAgo` */
  degradation(daysAgo: number): number;
  health(daysAgo: number): number;
  sensorBaselines: Partial<Record<SensorKind, number>>;
}

const models = new Map<string, AssetModel>();

function buildAssets(): Asset[] {
  const assets: Asset[] = [];
  const lineCounters = new Map<string, number>();
  const typeCounters = new Map<AssetType, number>();

  for (const [siteId, lineId, type, count] of LAYOUT) {
    const profile = TYPE_PROFILES[type];
    for (let i = 0; i < count; i++) {
      const lineIndex = (lineCounters.get(lineId) ?? 0) + 1;
      lineCounters.set(lineId, lineIndex);
      const typeIndex = typeCounters.get(type) ?? 0;
      typeCounters.set(type, typeIndex + 1);

      const linePrefix = lineId.endsWith("UT") ? 3 : Number(lineId.slice(-1));
      const seq = linePrefix * 100 + lineIndex;
      const id = `${siteId}-${profile.code}-${seq}`;
      const rand = seeded(id);
      const scenario = SCENARIOS[id] ?? null;
      const maker = profile.manufacturers[typeIndex % profile.manufacturers.length];

      const failureMode =
        profile.failureModes[scenario?.kind === "degrading" ? scenario.mode : 0] ?? profile.failureModes[0];

      // Health model
      let k = 0;
      let p = 1;
      let onset = 0;
      let baseHealth = H0;
      if (scenario?.kind === "degrading") {
        onset = scenario.onsetDaysAgo;
        p = Math.log((H0 - FAILURE_LEVEL) / (H0 - scenario.health)) / Math.log((onset + scenario.rul) / onset);
        k = (H0 - scenario.health) / Math.pow(onset, p);
      } else if (scenario?.kind === "offline") {
        baseHealth = scenario.health;
      } else {
        baseHealth = Math.round(between(rand, 74, 97));
      }
      const offlineSince = scenario?.kind === "offline" ? NOW - scenario.offlineForMs : null;

      const healthAt = (daysAgo: number) => {
        if (scenario?.kind === "degrading") {
          const x = onset - daysAgo;
          return x <= 0 ? H0 : H0 - k * Math.pow(x, p);
        }
        // Healthy assets drift down very slowly over the window.
        return baseHealth + daysAgo * 0.02;
      };
      const degradation = (daysAgo: number) =>
        Math.min(1, Math.max(0, (H0 - healthAt(daysAgo)) / (H0 - FAILURE_LEVEL)));

      const health = Math.round(healthAt(offlineSince ? (NOW - offlineSince) / DAY : 0));
      const health7 = Math.round(healthAt(7 + (offlineSince ? (NOW - offlineSince) / DAY : 0)));

      const status: AssetStatus =
        scenario?.kind === "degrading" ? scenario.status : scenario?.kind === "offline" ? "offline" : "healthy";

      const sensors = profile.sensors.map((s) => s.kind);
      const sensorBaselines: Partial<Record<SensorKind, number>> = {};
      for (const s of profile.sensors) sensorBaselines[s.kind] = s.base * (1 + between(rand, -0.05, 0.05));

      const asset: Asset = {
        id,
        name: `${profile.names[typeIndex % profile.names.length]} ${seq}`,
        type,
        siteId,
        lineId,
        manufacturer: maker.name,
        model: maker.models[typeIndex % maker.models.length],
        serialNumber: `${profile.code}${intBetween(rand, 100000, 999999)}`,
        installedAt: isoAgo(intBetween(rand, 400, 3200) * DAY),
        criticality: scenario?.kind === "degrading" && scenario.status === "critical" ? "A" : (["A", "B", "B", "C"] as const)[intBetween(rand, 0, 3)],
        status,
        healthScore: health,
        healthDelta7d: health - health7,
        prediction: null,
        sensors,
        lastInspectionAt: isoAgo(intBetween(rand, 4, 95) * DAY + intBetween(rand, 1, 20) * HOUR),
        lastDataAt: offlineSince ? new Date(offlineSince).toISOString() : isoAgo(intBetween(rand, 1, 9) * 60_000),
        operatingHours: intBetween(rand, 6000, 42000),
      };

      const model: AssetModel = {
        asset,
        scenario,
        failureMode,
        k,
        p,
        onset,
        baseHealth,
        offlineSince,
        degradation,
        health: healthAt,
        sensorBaselines,
      };
      models.set(id, model);
      asset.prediction = buildPrediction(model, rand);
      assets.push(asset);
    }
  }
  return assets;
}

function buildPrediction(model: AssetModel, rand: () => number): Prediction {
  const { asset, scenario, failureMode } = model;
  const profile = TYPE_PROFILES[asset.type];
  const scoredAt = new Date(model.offlineSince ? Math.floor(model.offlineSince / HOUR) * HOUR : SCORED_AT).toISOString();

  if (scenario?.kind === "degrading") {
    const others = profile.failureModes.filter((m) => m !== failureMode).map((m) => m.mode);
    const top = round(between(rand, 0.58, 0.74), 2);
    const rest = 1 - top;
    const failureModes = [
      { mode: failureMode.mode, probability: top },
      ...others.map((mode, i) => ({ mode, probability: round(rest * (i === 0 ? 0.6 : 0.4 / Math.max(1, others.length - 1)), 2) })),
      ...(others.length === 0 ? [{ mode: "Other / unclassified", probability: round(rest, 2) }] : []),
    ];
    const span = scenario.rulHigh - scenario.rulLow;
    const p30 = Math.min(0.98, Math.max(0.02, ((30 - scenario.rulLow) / span) * 0.95 + 0.02));
    return {
      rulDays: scenario.rul,
      rulLow: scenario.rulLow,
      rulHigh: scenario.rulHigh,
      intervalLevel: 0.8,
      confidence: scenario.confidence,
      failureModes,
      failureProbability30d: round(p30, 2),
      contributingFactors: buildFactors(model, rand),
      recommendedAction: failureMode.action,
      recommendedParts: failureMode.parts,
      modelVersion: MODEL_VERSION,
      scoredAt,
    };
  }

  const rul = intBetween(rand, 140, 420);
  return {
    rulDays: rul,
    rulLow: Math.round(rul * 0.7),
    rulHigh: Math.round(rul * 1.35),
    intervalLevel: 0.8,
    confidence: round(between(rand, 0.55, 0.8), 2),
    failureModes: profile.failureModes.map((m, i) => ({ mode: m.mode, probability: round(i === 0 ? 0.04 : 0.02, 2) })),
    failureProbability30d: round(between(rand, 0.005, 0.03), 3),
    contributingFactors: [],
    recommendedAction: "No action needed. Continue routine preventive maintenance.",
    recommendedParts: [],
    modelVersion: MODEL_VERSION,
    scoredAt,
  };
}

/** Value of the primary / secondary sensors "now", used for factor text. */
export function sensorNowValue(model: AssetModel, kind: SensorKind): number {
  const tpl = TYPE_PROFILES[model.asset.type].sensors.find((s) => s.kind === kind)!;
  const base = model.sensorBaselines[kind] ?? tpl.base;
  const scenario = model.scenario;
  if (scenario?.kind !== "degrading") return base;
  const sign = tpl.direction === "above" ? 1 : -1;
  if (kind === model.failureMode.primary) {
    if (scenario.status === "critical") return tpl.critical + sign * Math.abs(tpl.critical - base) * 0.08;
    return (tpl.warning + tpl.critical) / 2;
  }
  const w = model.failureMode.secondary[kind] ?? 0;
  return base + w * (tpl.warning - base) * (scenario.status === "critical" ? 1.05 : 0.8);
}

function buildFactors(model: AssetModel, rand: () => number): ContributingFactor[] {
  const { failureMode, asset } = model;
  const profile = TYPE_PROFILES[asset.type];
  const factors: ContributingFactor[] = [];
  const describe = (kind: SensorKind) => {
    const tpl = profile.sensors.find((s) => s.kind === kind)!;
    const base = model.sensorBaselines[kind] ?? tpl.base;
    const now = sensorNowValue(model, kind);
    const digits = tpl.unit === "mm/s" ? 1 : tpl.unit === "bar" && base < 20 ? 2 : 1;
    if (tpl.direction === "below") {
      const pct = Math.round(((base - now) / base) * 100);
      return `${round(now, digits)} ${tpl.unit}, ${pct}% below 30-day baseline (${round(base, digits)} ${tpl.unit})`;
    }
    if (tpl.unit === "°C") return `${round(now, 1)} °C, +${round(now - base, 1)} °C over 30-day baseline`;
    if (tpl.unit === "A") return `${round(now, 1)} A, ${Math.round(((now - base) / base) * 100)}% above baseline load`;
    return `${round(now, digits)} ${tpl.unit}, ${round(now / base, 1)}× 30-day baseline (${round(base, digits)} ${tpl.unit})`;
  };

  factors.push({ label: SENSOR_LABELS[failureMode.primary], detail: describe(failureMode.primary), weight: between(rand, 0.42, 0.52), sensor: failureMode.primary });
  const secondaries = Object.entries(failureMode.secondary)
    .filter(([kind]) => asset.sensors.includes(kind as SensorKind))
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  for (const [kind, w] of secondaries) {
    if ((w ?? 0) < 0.2) continue;
    factors.push({ label: SENSOR_LABELS[kind as SensorKind], detail: describe(kind as SensorKind), weight: (w ?? 0) * between(rand, 0.3, 0.42), sensor: kind as SensorKind });
  }
  factors.push({ label: "Anomaly rate (7 d)", detail: `${intBetween(rand, 6, 19)} anomalous readings vs. ${intBetween(rand, 0, 2)} in the prior 7 days`, weight: between(rand, 0.08, 0.13) });
  factors.push({ label: "Run hours since overhaul", detail: `${(asset.operatingHours % 18000).toLocaleString("en-US")} h (OEM interval 16,000 h)`, weight: between(rand, 0.04, 0.08) });

  const total = factors.reduce((s, f) => s + f.weight, 0);
  return factors.map((f) => ({ ...f, weight: round(f.weight / total, 2) }));
}

export const ASSETS: Asset[] = buildAssets();

export function getModel(assetId: string): AssetModel | undefined {
  return models.get(assetId);
}

/** 90 days of health history (every 6 h) plus the forecast cone out to the RUL upper bound. */
export function buildHealthSeries(assetId: string): HealthPoint[] {
  const model = models.get(assetId);
  if (!model) return [];
  const { asset } = model;
  const rand = seeded(`${assetId}:health`);
  const points: HealthPoint[] = [];
  const step = 6 * HOUR;
  for (let t = NOW - 90 * DAY; t <= NOW; t += step) {
    const daysAgo = (NOW - t) / DAY;
    const offline = model.offlineSince !== null && t > model.offlineSince;
    const score = offline ? null : Math.max(0, Math.min(100, model.health(daysAgo) + gaussian(rand) * 0.9));
    points.push({ t, score: score === null ? null : round(score, 1) });
  }
  // Anchor the last historical point exactly at the reported score.
  const lastIdx = model.offlineSince
    ? points.findLastIndex((p) => p.score !== null)
    : points.length - 1;
  if (lastIdx >= 0) {
    points[lastIdx] = { ...points[lastIdx], score: asset.healthScore, forecast: asset.healthScore, band: [asset.healthScore, asset.healthScore] };
  }

  const pred = asset.prediction;
  if (!pred || model.offlineSince) return points;

  const c = asset.healthScore;
  const degrading = model.scenario?.kind === "degrading";
  const horizon = degrading ? Math.min(Math.ceil(pred.rulHigh * 1.1) + 2, 75) : 30;
  const curve = (tau: number, R: number) => {
    if (!degrading) return c - ((c - FAILURE_LEVEL) / R) * tau;
    const o = model.onset;
    const g = (Math.pow(o + tau, model.p) - Math.pow(o, model.p)) / (Math.pow(o + R, model.p) - Math.pow(o, model.p));
    return c - (c - FAILURE_LEVEL) * g;
  };
  for (let d = 1; d <= horizon; d++) {
    const mid = Math.max(0, curve(d, pred.rulDays));
    const low = Math.max(0, curve(d, pred.rulLow));
    const high = Math.max(0, curve(d, pred.rulHigh));
    points.push({ t: NOW + d * DAY, score: null, forecast: round(mid, 1), band: [round(Math.min(low, high), 1), round(Math.max(low, high), 1)] });
  }
  return points;
}

export { FAILURE_LEVEL };
