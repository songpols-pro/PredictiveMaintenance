// Alerts, work orders and maintenance history that tell a consistent story with the fleet.
// Alerts are stored as templates + structured events, and seed work orders carry both
// languages, so the API can return them in the user's language (see l10n.ts).

import type { Alert, MaintenanceEvent, MaintenanceType, SensorKind, WorkOrder } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";
import { ASSETS, MODEL_VERSION, getModel, sensorNowValue } from "./assets";
import { TYPE_PROFILES, USERS } from "./catalog";
import { DAY, HOUR, NOW, intBetween, isoAgo, isoIn, pick, round, seeded } from "./random";
import { tx, txName, type AlertTemplate, type EventCode, type Text } from "./l10n";

const MIN = 60_000;

export interface EventRecord {
  at: string;
  code: EventCode;
  by?: string;
  params?: Record<string, string | number>;
}

/** Alert as stored: text is rendered on read from `tpl` and `events`. */
export interface AlertRecord extends Omit<Alert, "title" | "description" | "rule" | "events"> {
  tpl: AlertTemplate;
  events: EventRecord[];
}

/** Work order as stored: seed text exists in both languages, user-entered text in one. */
export interface WorkOrderRecord extends Omit<WorkOrder, "title" | "description"> {
  title: Text;
  description: Text;
}

function nameOf(assetId: string, locale: Locale): string {
  return txName(ASSETS.find((a) => a.id === assetId)?.name ?? assetId, locale);
}

const both = (en: string, th: string): Text => ({ en, th });

function thresholdAlert(id: string, assetId: string, kind: SensorKind, level: "warning" | "critical", agoMs: number, extra: Partial<AlertRecord> = {}): AlertRecord {
  const model = getModel(assetId)!;
  const tpl = TYPE_PROFILES[model.asset.type].sensors.find((s) => s.kind === kind)!;
  const digits = tpl.unit === "bar" && tpl.base < 20 ? 2 : 1;
  const value = round(sensorNowValue(model, kind), digits);
  const limit = level === "critical" ? tpl.critical : tpl.warning;
  return {
    id,
    assetId,
    severity: level,
    status: "open",
    source: "threshold",
    tpl: { kind: "threshold", sensor: kind, level, value, limit, direction: tpl.direction, unit: tpl.unit },
    sensor: kind,
    unit: tpl.unit,
    value,
    threshold: limit,
    triggeredAt: isoAgo(agoMs),
    events: [{ at: isoAgo(agoMs), code: "triggered-threshold" }],
    ...extra,
  };
}

function predictionAlert(id: string, assetId: string, severity: "warning" | "critical", agoMs: number, tpl: Extract<AlertTemplate, { kind: "prediction" }>, extra: Partial<AlertRecord> = {}): AlertRecord {
  const asset = ASSETS.find((a) => a.id === assetId)!;
  return {
    id,
    assetId,
    severity,
    status: "open",
    source: "prediction",
    tpl,
    confidence: asset.prediction!.confidence,
    triggeredAt: isoAgo(agoMs),
    events: [{ at: isoAgo(agoMs), code: "triggered-prediction", params: { model: MODEL_VERSION } }],
    ...extra,
  };
}

/** Acknowledge (+ optional assign and work order) events appended to an alert's history. */
function ackEvents(base: AlertRecord, ackAgoMs: number, by: string, assignee?: string, wo?: string, woAgoMs?: number): EventRecord[] {
  const events: EventRecord[] = [...base.events, { at: isoAgo(ackAgoMs), code: "acknowledged", by, params: { user: by } }];
  if (assignee) events.push({ at: isoAgo(ackAgoMs - 2 * MIN), code: "assigned", by, params: { user: assignee } });
  if (wo && woAgoMs) events.push({ at: isoAgo(woAgoMs), code: "wo-created", by, params: { wo } });
  return events;
}

function buildAlerts(): AlertRecord[] {
  const list: AlertRecord[] = [];

  // RYG-PMP-303: critical bearing defect, in progress
  {
    const a = thresholdAlert("AL-2481", "RYG-PMP-303", "vibration", "critical", 2 * HOUR + 40 * MIN);
    list.push({ ...a, status: "acknowledged", acknowledgedAt: isoAgo(1 * HOUR + 50 * MIN), acknowledgedBy: "u2", assigneeId: "u2", workOrderId: "WO-1048", events: ackEvents(a, 1 * HOUR + 50 * MIN, "u2", "u2", "WO-1048", 1 * HOUR + 45 * MIN) });
    const b = predictionAlert("AL-2476", "RYG-PMP-303", "critical", 20 * HOUR, { kind: "prediction", code: "failure-7d" });
    list.push({ ...b, status: "acknowledged", acknowledgedAt: isoAgo(19 * HOUR), acknowledgedBy: "u1", assigneeId: "u2", workOrderId: "WO-1048", events: ackEvents(b, 19 * HOUR, "u1", "u2") });
  }
  // CBI-HPR-101: critical pressure loss, nobody has picked up the newest alert yet
  list.push(thresholdAlert("AL-2483", "CBI-HPR-101", "pressure", "critical", 55 * MIN));
  {
    const b = predictionAlert("AL-2479", "CBI-HPR-101", "critical", 9 * HOUR, { kind: "prediction", code: "rul-14" });
    list.push({
      ...b,
      assigneeId: "u4",
      workOrderId: "WO-1047",
      events: [...b.events, { at: isoAgo(8 * HOUR), code: "assigned", by: "u7", params: { user: "u4" } }, { at: isoAgo(7 * HOUR + 30 * MIN), code: "wo-created", by: "u4", params: { wo: "WO-1047" } }],
    });
  }
  // AYT-CMP-301: critical overheating
  list.push(thresholdAlert("AL-2482", "AYT-CMP-301", "temperature", "critical", 1 * HOUR + 25 * MIN));
  {
    const b = predictionAlert("AL-2474", "AYT-CMP-301", "warning", 30 * HOUR, { kind: "prediction", code: "health-drop", points: 14 });
    list.push({ ...b, status: "acknowledged", acknowledgedAt: isoAgo(26 * HOUR), acknowledgedBy: "u6", assigneeId: "u6", workOrderId: "WO-1046", events: ackEvents(b, 26 * HOUR, "u6", "u6", "WO-1046", 25 * HOUR) });
  }
  // Warnings
  list.push(thresholdAlert("AL-2478", "RYG-SPN-101", "vibration", "warning", 12 * HOUR, { assigneeId: "u1" }));
  {
    const b = predictionAlert("AL-2477", "CBI-FAN-201", "warning", 16 * HOUR, { kind: "prediction", code: "imbalance" });
    list.push({ ...b, status: "snoozed", snoozedUntil: isoIn(8 * HOUR), assigneeId: "u5", workOrderId: "WO-1045", events: [...b.events, { at: isoAgo(14 * HOUR), code: "snoozed-balancing", by: "u4" }] });
  }
  {
    const a = thresholdAlert("AL-2472", "AYT-FAN-103", "vibration", "warning", 2 * DAY + 3 * HOUR);
    list.push({ ...a, status: "acknowledged", acknowledgedAt: isoAgo(2 * DAY), acknowledgedBy: "u6", assigneeId: "u8", workOrderId: "WO-1044", events: ackEvents(a, 2 * DAY, "u6", "u8", "WO-1044", 2 * DAY - 20 * MIN) });
  }
  list.push(predictionAlert("AL-2480", "RYG-MTR-204", "warning", 6 * HOUR, { kind: "prediction", code: "winding" }));
  list.push(thresholdAlert("AL-2475", "CBI-PMP-303", "pressure", "warning", 26 * HOUR));

  // Connectivity
  list.push({
    id: "AL-2484",
    assetId: "AYT-CNV-201",
    severity: "info",
    status: "open",
    source: "connectivity",
    tpl: { kind: "connectivity", code: "no-data-6h" },
    triggeredAt: isoAgo(4 * HOUR + 12 * MIN),
    events: [{ at: isoAgo(4 * HOUR + 12 * MIN), code: "triggered-connectivity" }],
  });
  list.push({
    id: "AL-2471",
    assetId: "CBI-FAN-203",
    severity: "warning",
    status: "acknowledged",
    source: "connectivity",
    tpl: { kind: "connectivity", code: "no-data-2d" },
    triggeredAt: isoAgo(1 * DAY + 3 * HOUR),
    acknowledgedAt: isoAgo(1 * DAY),
    acknowledgedBy: "u5",
    assigneeId: "u5",
    workOrderId: "WO-1042",
    events: [
      { at: isoAgo(1 * DAY + 3 * HOUR), code: "triggered-connectivity" },
      { at: isoAgo(1 * DAY), code: "acknowledged", by: "u5", params: { user: "u5" } },
      { at: isoAgo(23 * HOUR), code: "wo-created", by: "u5", params: { wo: "WO-1042" } },
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
    list.push({
      id: `AL-24${String(60 + i).padStart(2, "0")}`,
      assetId: asset.id,
      severity: "warning",
      status: "resolved",
      source: "threshold",
      tpl: { kind: "transient", code: kind, sensor: kind, warning: tpl.warning, unit: tpl.unit },
      sensor: kind,
      unit: tpl.unit,
      value: round(tpl.warning * 1.04, 1),
      threshold: tpl.warning,
      triggeredAt: isoAgo(ago),
      acknowledgedAt: isoAgo(ago - 35 * MIN),
      acknowledgedBy: by,
      assigneeId: by,
      resolvedAt: isoAgo(ago - 4 * HOUR),
      events: [
        { at: isoAgo(ago), code: "triggered-threshold" },
        { at: isoAgo(ago - 35 * MIN), code: "acknowledged", by, params: { user: by } },
        { at: isoAgo(ago - 4 * HOUR), code: "resolved-inspection", by },
      ],
    });
  }
  return list.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

function buildWorkOrders(): WorkOrderRecord[] {
  const t = (en: string, th: string, assetId: string) => both(`${en} – ${nameOf(assetId, "en")}`, `${th} – ${nameOf(assetId, "th")}`);
  return [
    { id: "WO-1048", title: t("Replace drive-end bearing", "เปลี่ยนตลับลูกปืนฝั่งขับ", "RYG-PMP-303"), description: both("Vibration and model both point to a DE bearing outer-race defect. Replace bearing, re-grease, laser-align after install.", "ทั้งค่าการสั่นและโมเดลชี้ว่าแหวนนอกของลูกปืนฝั่งขับชำรุด ให้เปลี่ยนลูกปืน อัดจาระบี และตั้งศูนย์ด้วยเลเซอร์หลังติดตั้ง"), assetId: "RYG-PMP-303", alertId: "AL-2481", status: "in_progress", priority: "P1", type: "predictive", assigneeId: "u2", dueDate: isoIn(1 * DAY), createdAt: isoAgo(1 * HOUR + 45 * MIN), parts: [{ partNo: "BRG-6309-2RS", qty: 2 }, { partNo: "GRS-SHC-100", qty: 1 }] },
    { id: "WO-1047", title: t("Hydraulic pump seal kit", "เปลี่ยนชุดซีลปั๊มไฮดรอลิก", "CBI-HPR-101"), description: both("Pressure decay indicates internal leakage in the main hydraulic pump. Replace seal and valve-plate kit, flush oil.", "ความดันที่ลดลงบ่งชี้ว่าปั๊มไฮดรอลิกหลักรั่วภายใน ให้เปลี่ยนชุดซีลและวาล์วเพลต แล้วล้างระบบน้ำมัน"), assetId: "CBI-HPR-101", alertId: "AL-2479", status: "open", priority: "P1", type: "predictive", assigneeId: "u4", dueDate: isoIn(3 * DAY), createdAt: isoAgo(7 * HOUR + 30 * MIN), parts: [{ partNo: "HYD-PUMP-SK", qty: 1 }, { partNo: "HYD-FLT-10", qty: 2 }] },
    { id: "WO-1046", title: t("Clean oil cooler", "ล้างออยล์คูลเลอร์", "AYT-CMP-301"), description: both("Discharge temperature trending up. Clean cooler fins, check thermostatic valve and replace oil filter.", "อุณหภูมิด้านจ่ายมีแนวโน้มสูงขึ้น ให้ล้างครีบคูลเลอร์ ตรวจวาล์วควบคุมอุณหภูมิ และเปลี่ยนไส้กรองน้ำมัน"), assetId: "AYT-CMP-301", alertId: "AL-2474", status: "open", priority: "P2", type: "predictive", assigneeId: "u6", dueDate: isoIn(2 * DAY), createdAt: isoAgo(25 * HOUR), parts: [{ partNo: "CMP-CLR-KIT", qty: 1 }] },
    { id: "WO-1045", title: t("Field balancing", "ถ่วงสมดุลหน้างาน", "CBI-FAN-201"), description: both("Clean impeller and perform two-plane field balancing.", "ทำความสะอาดใบพัดและถ่วงสมดุลแบบสองระนาบ"), assetId: "CBI-FAN-201", alertId: "AL-2477", status: "open", priority: "P3", type: "predictive", assigneeId: "u5", dueDate: isoIn(3 * DAY), createdAt: isoAgo(14 * HOUR), parts: [{ partNo: "FAN-BAL-WT", qty: 1 }] },
    { id: "WO-1044", title: t("Replace fan bearings", "เปลี่ยนลูกปืนพัดลม", "AYT-FAN-103"), description: both("Bearing defect frequencies visible in spectrum. Replace both bearings and the coupling element.", "สเปกตรัมพบความถี่ของลูกปืนชำรุด ให้เปลี่ยนลูกปืนทั้งสองตัวและยางยอยคัปปลิ้ง"), assetId: "AYT-FAN-103", alertId: "AL-2472", status: "open", priority: "P2", type: "predictive", assigneeId: "u8", dueDate: isoIn(6 * DAY), createdAt: isoAgo(2 * DAY - 20 * MIN), parts: [{ partNo: "BRG-6309-2RS", qty: 2 }, { partNo: "CPL-JAW-90", qty: 1 }] },
    { id: "WO-1042", title: t("Replace sensor battery", "เปลี่ยนแบตเตอรี่เซนเซอร์", "CBI-FAN-203"), description: both("Wireless vibration sensor offline. Replace battery and re-pair with gateway.", "เซนเซอร์วัดการสั่นแบบไร้สายออฟไลน์ ให้เปลี่ยนแบตเตอรี่และจับคู่กับเกตเวย์ใหม่"), assetId: "CBI-FAN-203", alertId: "AL-2471", status: "in_progress", priority: "P3", type: "corrective", assigneeId: "u5", dueDate: isoAgo(6 * HOUR), createdAt: isoAgo(23 * HOUR), parts: [] },
    { id: "WO-1041", title: both("Quarterly lubrication – Assembly conveyors", "หล่อลื่นประจำไตรมาส – สายพานไลน์ประกอบ"), description: both("Grease idler and drive bearings on conveyors 201–203.", "อัดจาระบีลูกปืนลูกกลิ้งรองและลูกปืนชุดขับของสายพาน 201–203"), assetId: "RYG-CNV-201", status: "open", priority: "P3", type: "preventive", assigneeId: "u8", dueDate: isoIn(5 * DAY), createdAt: isoAgo(4 * DAY), parts: [{ partNo: "GRS-SHC-100", qty: 3 }] },
    { id: "WO-1040", title: both("Annual thermography – Utilities compressors", "ตรวจภาพความร้อนประจำปี – เครื่องอัดอากาศ"), description: both("Infrared survey of compressor motors, starters and MCC panel.", "สำรวจด้วยกล้องอินฟราเรดที่มอเตอร์เครื่องอัดอากาศ ชุดสตาร์ท และตู้ MCC"), assetId: "RYG-CMP-301", status: "open", priority: "P4", type: "inspection", dueDate: isoIn(12 * DAY), createdAt: isoAgo(6 * DAY), parts: [] },
    { id: "WO-1039", title: t("Gear oil change", "เปลี่ยนน้ำมันเกียร์", "RYG-GBX-106"), description: both("Scheduled oil change at 8,000 h; take oil sample for lab analysis.", "เปลี่ยนน้ำมันตามกำหนดที่ 8,000 ชม. และเก็บตัวอย่างน้ำมันส่งแล็บ"), assetId: "RYG-GBX-106", status: "in_progress", priority: "P3", type: "preventive", assigneeId: "u2", dueDate: isoAgo(1 * DAY), createdAt: isoAgo(9 * DAY), parts: [{ partNo: "OIL-ISO-220", qty: 1 }] },
    { id: "WO-1038", title: t("Vibration baseline after rebuild", "เก็บค่าการสั่นฐานหลังซ่อมใหญ่", "AYT-SPN-101"), description: both("Record new vibration baseline at 6k / 12k / 18k RPM after spindle rebuild.", "บันทึกค่าการสั่นฐานที่ 6k / 12k / 18k RPM หลังซ่อมใหญ่สปินเดิล"), assetId: "AYT-SPN-101", status: "in_progress", priority: "P3", type: "inspection", assigneeId: "u6", dueDate: isoIn(2 * DAY), createdAt: isoAgo(3 * DAY), parts: [] },
    { id: "WO-1037", title: t("Replace coupling element", "เปลี่ยนยางยอยคัปปลิ้ง", "CBI-PMP-304"), description: both("Worn jaw coupling element found during route inspection.", "พบยางยอยคัปปลิ้งสึกระหว่างตรวจตามเส้นทาง"), assetId: "CBI-PMP-304", status: "done", priority: "P3", type: "corrective", assigneeId: "u4", dueDate: isoAgo(2 * DAY), createdAt: isoAgo(6 * DAY), completedAt: isoAgo(3 * DAY), parts: [{ partNo: "CPL-JAW-90", qty: 1 }] },
    { id: "WO-1036", title: t("V-belt replacement", "เปลี่ยนสายพานร่องวี", "RYG-CNV-202"), description: both("Replace cracked V-belt set and re-tension.", "เปลี่ยนชุดสายพานร่องวีที่แตกร้าวและปรับความตึง"), assetId: "RYG-CNV-202", status: "done", priority: "P2", type: "corrective", assigneeId: "u8", dueDate: isoAgo(4 * DAY), createdAt: isoAgo(7 * DAY), completedAt: isoAgo(5 * DAY), parts: [{ partNo: "BLT-SPB-2240", qty: 2 }] },
    { id: "WO-1035", title: t("Bearing inspection", "ตรวจลูกปืน", "AYT-FAN-305"), description: both("Inspect bearings after vibration warning; no defect found, re-greased.", "ตรวจลูกปืนหลังมีการแจ้งเตือนการสั่น ไม่พบความเสียหาย อัดจาระบีแล้ว"), assetId: "AYT-FAN-305", status: "done", priority: "P3", type: "inspection", assigneeId: "u6", dueDate: isoAgo(7 * DAY), createdAt: isoAgo(10 * DAY), completedAt: isoAgo(8 * DAY), parts: [{ partNo: "GRS-SHC-100", qty: 1 }] },
    { id: "WO-1034", title: t("Mechanical seal replacement", "เปลี่ยนแมคคานิคอลซีล", "AYT-PMP-303"), description: both("Replaced leaking mechanical seal flagged by the model 3 weeks ahead of failure.", "เปลี่ยนแมคคานิคอลซีลที่รั่ว ซึ่งโมเดลแจ้งเตือนล่วงหน้า 3 สัปดาห์ก่อนเสีย"), assetId: "AYT-PMP-303", status: "done", priority: "P2", type: "predictive", assigneeId: "u6", dueDate: isoAgo(11 * DAY), createdAt: isoAgo(16 * DAY), completedAt: isoAgo(12 * DAY), parts: [{ partNo: "SEAL-MS-45", qty: 1 }] },
    { id: "WO-1033", title: t("Return filter change", "เปลี่ยนไส้กรองน้ำมันไหลกลับ", "CBI-HPR-102"), description: both("Planned filter change at 2,000 h.", "เปลี่ยนไส้กรองตามแผนที่ 2,000 ชม."), assetId: "CBI-HPR-102", status: "done", priority: "P4", type: "preventive", assigneeId: "u5", dueDate: isoAgo(14 * DAY), createdAt: isoAgo(20 * DAY), completedAt: isoAgo(15 * DAY), parts: [{ partNo: "HYD-FLT-10", qty: 1 }] },
  ];
}

const HISTORY_TITLES: Record<MaintenanceType, string[]> = {
  inspection: ["Vibration & thermography route", "Ultrasonic leak survey", "Visual inspection – guarding and mounts"],
  preventive: ["Lubrication and filter change", "Planned overhaul – bearings and seals", "Belt and coupling check"],
  corrective: ["Replaced worn coupling element", "Fixed oil leak at housing gasket", "Re-terminated loose motor lead"],
  predictive: ["Bearing replaced after PdM alert", "Alignment corrected after PdM alert"],
};

export function buildHistory(assetId: string, lastInspectionAt: string, locale: Locale): MaintenanceEvent[] {
  const rand = seeded(`${assetId}:history`);
  const techs = USERS.filter((u) => u.role === "Maintenance Engineer" || u.role === "Technician");
  const events: MaintenanceEvent[] = [];
  const push = (agoMs: number, type: MaintenanceType, downtime: number, notes: string, workOrderId?: string) => {
    events.push({
      id: `${assetId}-H${events.length + 1}`,
      assetId,
      date: isoAgo(agoMs),
      type,
      title: tx(pick(rand, HISTORY_TITLES[type]), locale),
      technician: pick(rand, techs).name,
      downtimeHours: downtime,
      notes: tx(notes, locale),
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

export const ALERTS: AlertRecord[] = buildAlerts();
export const WORK_ORDERS: WorkOrderRecord[] = buildWorkOrders();
