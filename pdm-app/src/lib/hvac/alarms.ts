// Alarm rules (threshold crossings) plus scripted equipment faults, evaluated on the simulation.

import { AIR_SIDE, CHILLERS, type AlarmCode, type AlarmSeverity, type HvacAlarm, type PlantSnap } from "./model";
import { DAY, MIN, plantAt, scriptedEvents } from "./sim";

export const THRESHOLDS = { chwSupplyHigh: 8, humidityHigh: 65, roomTempHigh: 26, kwPerTonHigh: 1.25 };
/** Hysteresis: an alarm clears only once the value is back below limit − deadband (no chattering). */
const DEADBAND = { chwSupplyHigh: 0.3, humidityHigh: 3, roomTempHigh: 0.5, kwPerTonHigh: 0.05 };

interface Rule {
  id: string;
  deviceId: string;
  code: AlarmCode;
  severity: AlarmSeverity;
  unit: string;
  read: (s: PlantSnap) => number | null;
  limit: number;
  clear: number;
}

const RULES: Rule[] = [
  { id: "PLANT.supply", deviceId: "PLANT", code: "chwSupplyHigh", severity: "warning", unit: "°C", read: (s) => s.supply, limit: THRESHOLDS.chwSupplyHigh, clear: THRESHOLDS.chwSupplyHigh - DEADBAND.chwSupplyHigh },
  ...AIR_SIDE.filter((d) => d.kind === "ahu").flatMap((d): Rule[] => [
    { id: `${d.id}.humid`, deviceId: d.id, code: "humidityHigh", severity: "warning", unit: "%RH", read: (s) => s.air.find((a) => a.id === d.id)!.humid, limit: THRESHOLDS.humidityHigh, clear: THRESHOLDS.humidityHigh - DEADBAND.humidityHigh },
    { id: `${d.id}.temp`, deviceId: d.id, code: "roomTempHigh", severity: "warning", unit: "°C", read: (s) => s.air.find((a) => a.id === d.id)!.temp, limit: THRESHOLDS.roomTempHigh, clear: THRESHOLDS.roomTempHigh - DEADBAND.roomTempHigh },
  ]),
  ...CHILLERS.map(
    (d): Rule => ({
      id: `${d.id}.kwPerTon`,
      deviceId: d.id,
      code: "kwPerTonHigh",
      severity: "warning",
      unit: "kW/Ton",
      read: (s) => s.chillers.find((c) => c.id === d.id)!.kwPerTon,
      limit: THRESHOLDS.kwPerTonHigh,
      clear: THRESHOLDS.kwPerTonHigh - DEADBAND.kwPerTonHigh,
    }),
  ),
];

/** Threshold alarms are evaluated on a 5-minute grid, like a BMS alarm scan. */
const SCAN = 5 * MIN;
/** How far back the live view looks for threshold episodes that are still open. */
const LOOKBACK = DAY;
export const MAX_LOG_DAYS = 31;

/** Threshold episodes in [from, to] with hysteresis; an episode still open at `to` has end = null. */
function episodes(from: number, to: number): HvacAlarm[] {
  const out: HvacAlarm[] = [];
  const open = new Map<string, { start: number; peak: number }>();
  for (let t = Math.floor(from / SCAN) * SCAN; t <= to; t += SCAN) {
    const snap = plantAt(t);
    for (const r of RULES) {
      const v = r.read(snap);
      const ep = open.get(r.id);
      if (!ep) {
        if (v !== null && v > r.limit) open.set(r.id, { start: t, peak: v });
      } else if (v === null || v < r.clear) {
        out.push({ id: `${r.id}@${ep.start}`, deviceId: r.deviceId, code: r.code, severity: r.severity, start: ep.start, end: t, value: ep.peak, unit: r.unit });
        open.delete(r.id);
      } else {
        ep.peak = Math.max(ep.peak, v);
      }
    }
  }
  for (const [id, ep] of open) {
    const r = RULES.find((x) => x.id === id)!;
    out.push({ id: `${id}@${ep.start}`, deviceId: r.deviceId, code: r.code, severity: r.severity, start: ep.start, end: null, value: ep.peak, unit: r.unit });
  }
  return out;
}

/** Alarms active right now, newest first. Threshold alarms show the current reading. */
export function activeAlarms(now: number, snap: PlantSnap = plantAt(now)): HvacAlarm[] {
  const out: HvacAlarm[] = [];
  for (const e of scriptedEvents(now, now)) {
    if (e.start <= now && e.end > now) out.push({ id: e.id, deviceId: e.deviceId, code: e.code, severity: e.severity, start: e.start, end: null });
  }
  for (const ep of episodes(now - LOOKBACK, now)) {
    if (ep.end !== null) continue;
    const rule = RULES.find((r) => ep.id.startsWith(`${r.id}@`))!;
    out.push({ ...ep, value: rule.read(snap) ?? ep.value });
  }
  return out.sort((a, b) => b.start - a.start);
}

/** Alarm history overlapping [from, to], newest first. */
export function alarmLog(from: number, to: number, now = Date.now()): HvacAlarm[] {
  const end = Math.min(to, now);
  const start = Math.max(from, end - MAX_LOG_DAYS * DAY);
  const scripted: HvacAlarm[] = scriptedEvents(start, end).map((e) => ({
    id: e.id,
    deviceId: e.deviceId,
    code: e.code,
    severity: e.severity,
    start: e.start,
    end: e.end > now ? null : e.end,
  }));
  return [...scripted, ...episodes(start, end)].sort((a, b) => b.start - a.start);
}
