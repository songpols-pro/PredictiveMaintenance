// Alerts, work orders and maintenance history that tell a consistent story with the fleet.

import type { Alert, MaintenanceEvent, MaintenanceType, WorkOrder } from "@/lib/types";
import { ASSETS, getModel, sensorNowValue } from "./assets";
import { TYPE_PROFILES, USERS } from "./catalog";
import { DAY, HOUR, NOW, intBetween, isoAgo, isoIn, pick, round, seeded } from "./random";

const MIN = 60_000;

function nameOf(assetId: string): string {
  return ASSETS.find((a) => a.id === assetId)?.name ?? assetId;
}

function sensorValue(assetId: string, kind: "vibration" | "temperature" | "pressure" | "current") {
  const model = getModel(assetId)!;
  const tpl = TYPE_PROFILES[model.asset.type].sensors.find((s) => s.kind === kind)!;
  const v = sensorNowValue(model, kind);
  const digits = tpl.unit === "bar" && tpl.base < 20 ? 2 : 1;
  return { value: round(v, digits), tpl };
}

function thresholdAlert(
  id: string,
  assetId: string,
  kind: "vibration" | "temperature" | "pressure" | "current",
  level: "warning" | "critical",
  agoMs: number,
  extra: Partial<Alert> = {},
): Alert {
  const { value, tpl } = sensorValue(assetId, kind);
  const limit = level === "critical" ? tpl.critical : tpl.warning;
  const cmp = tpl.direction === "above" ? "above" : "below";
  const sym = tpl.direction === "above" ? ">" : "<";
  return {
    id,
    assetId,
    severity: level,
    status: "open",
    source: "threshold",
    title: `${tpl.label} ${cmp} ${level} limit`,
    description: `${tpl.label} reached ${value} ${tpl.unit}, ${cmp} the ${level} limit of ${limit} ${tpl.unit} for more than 30 minutes.`,
    rule: `${tpl.label} ${sym} ${limit} ${tpl.unit} for 30 min`,
    sensor: kind,
    value,
    threshold: limit,
    triggeredAt: isoAgo(agoMs),
    events: [{ at: isoAgo(agoMs), text: "Alert triggered by threshold rule" }],
    ...extra,
  };
}

function predictionAlert(id: string, assetId: string, severity: "warning" | "critical", agoMs: number, title: string, extra: Partial<Alert> = {}): Alert {
  const asset = ASSETS.find((a) => a.id === assetId)!;
  const p = asset.prediction!;
  return {
    id,
    assetId,
    severity,
    status: "open",
    source: "prediction",
    title,
    description: `Model predicts “${p.failureModes[0].mode}”. Remaining useful life ${p.rulDays} days (${p.rulLow}–${p.rulHigh} d, ${Math.round(p.intervalLevel * 100)}% interval).`,
    rule: "RUL < 14 days or health drop > 10 pts / 7 d, confidence ≥ 60%",
    confidence: p.confidence,
    triggeredAt: isoAgo(agoMs),
    events: [{ at: isoAgo(agoMs), text: `Prediction alert raised by ${p.modelVersion}` }],
    ...extra,
  };
}

function ackEvents(base: Alert, ackAgoMs: number, by: string, assignee?: string, wo?: string, woAgoMs?: number) {
  const user = USERS.find((u) => u.id === by)!;
  const events = [...base.events, { at: isoAgo(ackAgoMs), text: `Acknowledged by ${user.name}`, by }];
  if (assignee) {
    const a = USERS.find((u) => u.id === assignee)!;
    events.push({ at: isoAgo(ackAgoMs - 2 * MIN), text: `Assigned to ${a.name}`, by });
  }
  if (wo && woAgoMs) events.push({ at: isoAgo(woAgoMs), text: `Work order ${wo} created`, by });
  return events;
}

function buildAlerts(): Alert[] {
  const list: Alert[] = [];

  // RYG-PMP-303: critical bearing defect, in progress
  {
    const a = thresholdAlert("AL-2481", "RYG-PMP-303", "vibration", "critical", 2 * HOUR + 40 * MIN);
    list.push({ ...a, status: "acknowledged", acknowledgedAt: isoAgo(1 * HOUR + 50 * MIN), acknowledgedBy: "u2", assigneeId: "u2", workOrderId: "WO-1048", events: ackEvents(a, 1 * HOUR + 50 * MIN, "u2", "u2", "WO-1048", 1 * HOUR + 45 * MIN) });
    const b = predictionAlert("AL-2476", "RYG-PMP-303", "critical", 20 * HOUR, "Failure predicted within 7 days");
    list.push({ ...b, status: "acknowledged", acknowledgedAt: isoAgo(19 * HOUR), acknowledgedBy: "u1", assigneeId: "u2", workOrderId: "WO-1048", events: ackEvents(b, 19 * HOUR, "u1", "u2") });
  }
  // CBI-HPR-101: critical pressure loss, nobody has picked up the newest alert yet
  list.push(thresholdAlert("AL-2483", "CBI-HPR-101", "pressure", "critical", 55 * MIN));
  {
    const b = predictionAlert("AL-2479", "CBI-HPR-101", "critical", 9 * HOUR, "Remaining useful life below 14 days");
    list.push({ ...b, assigneeId: "u4", workOrderId: "WO-1047", events: [...b.events, { at: isoAgo(8 * HOUR), text: "Assigned to Arthit Wongsa", by: "u7" }, { at: isoAgo(7 * HOUR + 30 * MIN), text: "Work order WO-1047 created", by: "u4" }] });
  }
  // AYT-CMP-301: critical overheating
  list.push(thresholdAlert("AL-2482", "AYT-CMP-301", "temperature", "critical", 1 * HOUR + 25 * MIN));
  {
    const b = predictionAlert("AL-2474", "AYT-CMP-301", "warning", 30 * HOUR, "Health score dropped 14 pts in 7 days");
    list.push({ ...b, status: "acknowledged", acknowledgedAt: isoAgo(26 * HOUR), acknowledgedBy: "u6", assigneeId: "u6", workOrderId: "WO-1046", events: ackEvents(b, 26 * HOUR, "u6", "u6", "WO-1046", 25 * HOUR) });
  }
  // Warnings
  list.push(thresholdAlert("AL-2478", "RYG-SPN-101", "vibration", "warning", 12 * HOUR, { assigneeId: "u1" }));
  {
    const b = predictionAlert("AL-2477", "CBI-FAN-201", "warning", 16 * HOUR, "Rotor imbalance trend detected");
    list.push({ ...b, status: "snoozed", snoozedUntil: isoIn(8 * HOUR), assigneeId: "u5", workOrderId: "WO-1045", events: [...b.events, { at: isoAgo(14 * HOUR), text: "Snoozed for 24 h: field balancing already scheduled", by: "u4" }] });
  }
  {
    const a = thresholdAlert("AL-2472", "AYT-FAN-103", "vibration", "warning", 2 * DAY + 3 * HOUR);
    list.push({ ...a, status: "acknowledged", acknowledgedAt: isoAgo(2 * DAY), acknowledgedBy: "u6", assigneeId: "u8", workOrderId: "WO-1044", events: ackEvents(a, 2 * DAY, "u6", "u8", "WO-1044", 2 * DAY - 20 * MIN) });
  }
  list.push(predictionAlert("AL-2480", "RYG-MTR-204", "warning", 6 * HOUR, "Winding insulation degradation suspected"));
  list.push(thresholdAlert("AL-2475", "CBI-PMP-303", "pressure", "warning", 26 * HOUR));

  // Connectivity
  list.push({
    id: "AL-2484",
    assetId: "AYT-CNV-201",
    severity: "info",
    status: "open",
    source: "connectivity",
    title: "No data received for 6 hours",
    description: "Edge gateway AYT-GW-02 stopped reporting. Readings and predictions for this asset are paused until data resumes.",
    rule: "No telemetry for > 2 h",
    triggeredAt: isoAgo(4 * HOUR + 12 * MIN),
    events: [{ at: isoAgo(4 * HOUR + 12 * MIN), text: "Alert triggered by connectivity rule" }],
  });
  list.push({
    id: "AL-2471",
    assetId: "CBI-FAN-203",
    severity: "warning",
    status: "acknowledged",
    source: "connectivity",
    title: "No data received for 2 days",
    description: "Wireless vibration sensor battery reported low before going silent. Predictions are stale.",
    rule: "No telemetry for > 24 h",
    triggeredAt: isoAgo(1 * DAY + 3 * HOUR),
    acknowledgedAt: isoAgo(1 * DAY),
    acknowledgedBy: "u5",
    assigneeId: "u5",
    workOrderId: "WO-1042",
    events: [
      { at: isoAgo(1 * DAY + 3 * HOUR), text: "Alert triggered by connectivity rule" },
      { at: isoAgo(1 * DAY), text: "Acknowledged by Ploy Thanakorn", by: "u5" },
      { at: isoAgo(23 * HOUR), text: "Work order WO-1042 created", by: "u5" },
    ],
  });

  // Resolved history on healthy assets
  const healthy = ASSETS.filter((a) => a.status === "healthy");
  const rand = seeded("resolved-alerts");
  for (let i = 0; i < 8; i++) {
    const asset = healthy[(i * 7 + 3) % healthy.length];
    const kind = pick(rand, ["vibration", "temperature"] as const);
    const tpl = TYPE_PROFILES[asset.type].sensors.find((s) => s.kind === kind)!;
    const ago = (i + 1) * 2.3 * DAY + intBetween(rand, 1, 10) * HOUR;
    const by = pick(rand, ["u2", "u4", "u6", "u1"]);
    const user = USERS.find((u) => u.id === by)!;
    list.push({
      id: `AL-24${String(60 + i).padStart(2, "0")}`,
      assetId: asset.id,
      severity: "warning",
      status: "resolved",
      source: "threshold",
      title: kind === "vibration" ? "Transient vibration spike" : "Temperature spike after restart",
      description: `${tpl.label} briefly exceeded the warning limit of ${tpl.warning} ${tpl.unit} and returned to normal.`,
      rule: `${tpl.label} > ${tpl.warning} ${tpl.unit} for 30 min`,
      sensor: kind,
      value: round(tpl.warning * 1.04, 1),
      threshold: tpl.warning,
      triggeredAt: isoAgo(ago),
      acknowledgedAt: isoAgo(ago - 35 * MIN),
      acknowledgedBy: by,
      assigneeId: by,
      resolvedAt: isoAgo(ago - 4 * HOUR),
      events: [
        { at: isoAgo(ago), text: "Alert triggered by threshold rule" },
        { at: isoAgo(ago - 35 * MIN), text: `Acknowledged by ${user.name}`, by },
        { at: isoAgo(ago - 4 * HOUR), text: "Resolved: reading back within limits after inspection", by },
      ],
    });
  }
  return list.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

function buildWorkOrders(): WorkOrder[] {
  const wo = (w: Omit<WorkOrder, "title"> & { title: string }) => w;
  return [
    wo({ id: "WO-1048", title: `Replace drive-end bearing – ${nameOf("RYG-PMP-303")}`, description: "Vibration and model both point to a DE bearing outer-race defect. Replace bearing, re-grease, laser-align after install.", assetId: "RYG-PMP-303", alertId: "AL-2481", status: "in_progress", priority: "P1", type: "predictive", assigneeId: "u2", dueDate: isoIn(1 * DAY), createdAt: isoAgo(1 * HOUR + 45 * MIN), parts: [{ partNo: "BRG-6309-2RS", qty: 2 }, { partNo: "GRS-SHC-100", qty: 1 }] }),
    wo({ id: "WO-1047", title: `Hydraulic pump seal kit – ${nameOf("CBI-HPR-101")}`, description: "Pressure decay indicates internal leakage in the main hydraulic pump. Replace seal and valve-plate kit, flush oil.", assetId: "CBI-HPR-101", alertId: "AL-2479", status: "open", priority: "P1", type: "predictive", assigneeId: "u4", dueDate: isoIn(3 * DAY), createdAt: isoAgo(7 * HOUR + 30 * MIN), parts: [{ partNo: "HYD-PUMP-SK", qty: 1 }, { partNo: "HYD-FLT-10", qty: 2 }] }),
    wo({ id: "WO-1046", title: `Clean oil cooler – ${nameOf("AYT-CMP-301")}`, description: "Discharge temperature trending up. Clean cooler fins, check thermostatic valve and replace oil filter.", assetId: "AYT-CMP-301", alertId: "AL-2474", status: "open", priority: "P2", type: "predictive", assigneeId: "u6", dueDate: isoIn(2 * DAY), createdAt: isoAgo(25 * HOUR), parts: [{ partNo: "CMP-CLR-KIT", qty: 1 }] }),
    wo({ id: "WO-1045", title: `Field balancing – ${nameOf("CBI-FAN-201")}`, description: "Clean impeller and perform two-plane field balancing.", assetId: "CBI-FAN-201", alertId: "AL-2477", status: "open", priority: "P3", type: "predictive", assigneeId: "u5", dueDate: isoIn(3 * DAY), createdAt: isoAgo(14 * HOUR), parts: [{ partNo: "FAN-BAL-WT", qty: 1 }] }),
    wo({ id: "WO-1044", title: `Replace fan bearings – ${nameOf("AYT-FAN-103")}`, description: "Bearing defect frequencies visible in spectrum. Replace both bearings and the coupling element.", assetId: "AYT-FAN-103", alertId: "AL-2472", status: "open", priority: "P2", type: "predictive", assigneeId: "u8", dueDate: isoIn(6 * DAY), createdAt: isoAgo(2 * DAY - 20 * MIN), parts: [{ partNo: "BRG-6309-2RS", qty: 2 }, { partNo: "CPL-JAW-90", qty: 1 }] }),
    wo({ id: "WO-1042", title: `Replace sensor battery – ${nameOf("CBI-FAN-203")}`, description: "Wireless vibration sensor offline. Replace battery and re-pair with gateway.", assetId: "CBI-FAN-203", alertId: "AL-2471", status: "in_progress", priority: "P3", type: "corrective", assigneeId: "u5", dueDate: isoAgo(6 * HOUR), createdAt: isoAgo(23 * HOUR), parts: [] }),
    wo({ id: "WO-1041", title: "Quarterly lubrication – Assembly conveyors", description: "Grease idler and drive bearings on conveyors 201–203.", assetId: "RYG-CNV-201", status: "open", priority: "P3", type: "preventive", assigneeId: "u8", dueDate: isoIn(5 * DAY), createdAt: isoAgo(4 * DAY), parts: [{ partNo: "GRS-SHC-100", qty: 3 }] }),
    wo({ id: "WO-1040", title: "Annual thermography – Utilities compressors", description: "Infrared survey of compressor motors, starters and MCC panel.", assetId: "RYG-CMP-301", status: "open", priority: "P4", type: "inspection", dueDate: isoIn(12 * DAY), createdAt: isoAgo(6 * DAY), parts: [] }),
    wo({ id: "WO-1039", title: `Gear oil change – ${nameOf("RYG-GBX-106")}`, description: "Scheduled oil change at 8,000 h; take oil sample for lab analysis.", assetId: "RYG-GBX-106", status: "in_progress", priority: "P3", type: "preventive", assigneeId: "u2", dueDate: isoAgo(1 * DAY), createdAt: isoAgo(9 * DAY), parts: [{ partNo: "OIL-ISO-220", qty: 1 }] }),
    wo({ id: "WO-1038", title: `Vibration baseline after rebuild – ${nameOf("AYT-SPN-101")}`, description: "Record new vibration baseline at 6k / 12k / 18k RPM after spindle rebuild.", assetId: "AYT-SPN-101", status: "in_progress", priority: "P3", type: "inspection", assigneeId: "u6", dueDate: isoIn(2 * DAY), createdAt: isoAgo(3 * DAY), parts: [] }),
    wo({ id: "WO-1037", title: `Replace coupling element – ${nameOf("CBI-PMP-304")}`, description: "Worn jaw coupling element found during route inspection.", assetId: "CBI-PMP-304", status: "done", priority: "P3", type: "corrective", assigneeId: "u4", dueDate: isoAgo(2 * DAY), createdAt: isoAgo(6 * DAY), completedAt: isoAgo(3 * DAY), parts: [{ partNo: "CPL-JAW-90", qty: 1 }] }),
    wo({ id: "WO-1036", title: `V-belt replacement – ${nameOf("RYG-CNV-202")}`, description: "Replace cracked V-belt set and re-tension.", assetId: "RYG-CNV-202", status: "done", priority: "P2", type: "corrective", assigneeId: "u8", dueDate: isoAgo(4 * DAY), createdAt: isoAgo(7 * DAY), completedAt: isoAgo(5 * DAY), parts: [{ partNo: "BLT-SPB-2240", qty: 2 }] }),
    wo({ id: "WO-1035", title: `Bearing inspection – ${nameOf("AYT-FAN-305")}`, description: "Inspect bearings after vibration warning; no defect found, re-greased.", assetId: "AYT-FAN-305", status: "done", priority: "P3", type: "inspection", assigneeId: "u6", dueDate: isoAgo(7 * DAY), createdAt: isoAgo(10 * DAY), completedAt: isoAgo(8 * DAY), parts: [{ partNo: "GRS-SHC-100", qty: 1 }] }),
    wo({ id: "WO-1034", title: `Mechanical seal replacement – ${nameOf("AYT-PMP-303")}`, description: "Replaced leaking mechanical seal flagged by the model 3 weeks ahead of failure.", assetId: "AYT-PMP-303", status: "done", priority: "P2", type: "predictive", assigneeId: "u6", dueDate: isoAgo(11 * DAY), createdAt: isoAgo(16 * DAY), completedAt: isoAgo(12 * DAY), parts: [{ partNo: "SEAL-MS-45", qty: 1 }] }),
    wo({ id: "WO-1033", title: `Return filter change – ${nameOf("CBI-HPR-102")}`, description: "Planned filter change at 2,000 h.", assetId: "CBI-HPR-102", status: "done", priority: "P4", type: "preventive", assigneeId: "u5", dueDate: isoAgo(14 * DAY), createdAt: isoAgo(20 * DAY), completedAt: isoAgo(15 * DAY), parts: [{ partNo: "HYD-FLT-10", qty: 1 }] }),
  ];
}

const HISTORY_TITLES: Record<MaintenanceType, string[]> = {
  inspection: ["Vibration & thermography route", "Ultrasonic leak survey", "Visual inspection – guarding and mounts"],
  preventive: ["Lubrication and filter change", "Planned overhaul – bearings and seals", "Belt and coupling check"],
  corrective: ["Replaced worn coupling element", "Fixed oil leak at housing gasket", "Re-terminated loose motor lead"],
  predictive: ["Bearing replaced after PdM alert", "Alignment corrected after PdM alert"],
};

export function buildHistory(assetId: string, lastInspectionAt: string): MaintenanceEvent[] {
  const rand = seeded(`${assetId}:history`);
  const techs = USERS.filter((u) => u.role === "Maintenance Engineer" || u.role === "Technician");
  const events: MaintenanceEvent[] = [];
  const push = (agoMs: number, type: MaintenanceType, downtime: number, notes: string, workOrderId?: string) => {
    events.push({
      id: `${assetId}-H${events.length + 1}`,
      assetId,
      date: isoAgo(agoMs),
      type,
      title: pick(rand, HISTORY_TITLES[type]),
      technician: pick(rand, techs).name,
      downtimeHours: downtime,
      notes,
      workOrderId,
    });
  };
  const lastInspectionAgo = NOW - new Date(lastInspectionAt).getTime();
  push(lastInspectionAgo, "inspection", 0, "All readings recorded in route log.");
  let t = lastInspectionAgo;
  for (let i = 0; i < 6; i++) {
    t += intBetween(rand, 35, 110) * DAY;
    if (t > 720 * DAY) break;
    const r = rand();
    if (r < 0.45) push(t, "preventive", round(intBetween(rand, 1, 4) + rand(), 1), "Completed per PM checklist.");
    else if (r < 0.7) push(t, "inspection", 0, "No abnormal findings.");
    else if (r < 0.9) push(t, "corrective", round(intBetween(rand, 3, 9) + rand(), 1), "Unplanned stop; root cause logged.");
    else push(t, "predictive", round(intBetween(rand, 2, 5), 1), "Planned during scheduled downtime.");
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export const ALERTS: Alert[] = buildAlerts();
export const WORK_ORDERS: WorkOrder[] = buildWorkOrders();
