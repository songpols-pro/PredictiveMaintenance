// Localization of mock *data* (what a real backend would return per Accept-Language).
// UI chrome lives in src/lib/i18n/messages; this file covers domain vocabulary and
// templated text such as alert titles, timeline events and contributing-factor details.

import type { Locale } from "@/lib/i18n/config";
import type { FactorParams, SensorKind, ThresholdDirection } from "@/lib/types";

/** English source text → Thai. Anything not listed passes through unchanged. */
const TH: Record<string, string> = {
  // Sites, regions, lines
  "Rayong Plant": "โรงงานระยอง",
  "Chonburi Plant": "โรงงานชลบุรี",
  "Ayutthaya Plant": "โรงงานอยุธยา",
  "Eastern Seaboard": "ภาคตะวันออก",
  Central: "ภาคกลาง",
  Machining: "แมชชีนนิ่ง",
  Assembly: "ประกอบ",
  Utilities: "สาธารณูปโภค",
  "Press Shop": "เพรส",
  "Paint Line": "พ่นสี",
  Woodworking: "งานไม้",
  Finishing: "ตกแต่งผิว",

  // Equipment base names
  "Cooling Water Pump": "ปั๊มน้ำหล่อเย็น",
  "Chilled Water Pump": "ปั๊มน้ำเย็น",
  "Process Water Pump": "ปั๊มน้ำกระบวนการผลิต",
  "Condensate Pump": "ปั๊มน้ำคอนเดนเสท",
  "Hot Water Pump": "ปั๊มน้ำร้อน",
  "Main Drive Motor": "มอเตอร์ขับหลัก",
  "Spindle Drive Motor": "มอเตอร์ขับสปินเดิล",
  "Hydraulic Pump Motor": "มอเตอร์ปั๊มไฮดรอลิก",
  "Conveyor Drive Motor": "มอเตอร์ขับสายพาน",
  "Mixer Motor": "มอเตอร์เครื่องผสม",
  "Screw Compressor": "เครื่องอัดอากาศแบบสกรู",
  "Air Compressor": "เครื่องอัดอากาศ",
  "Main Gearbox": "เกียร์บ็อกซ์หลัก",
  "Conveyor Gearbox": "เกียร์บ็อกซ์สายพาน",
  "Reducer Gearbox": "เกียร์ทดรอบ",
  "Belt Conveyor": "สายพานลำเลียง",
  "Roller Conveyor": "ลูกกลิ้งลำเลียง",
  "Overhead Conveyor": "สายพานลำเลียงแขวน",
  "CNC Router Spindle": "สปินเดิลเราเตอร์ CNC",
  "5-Axis Spindle": "สปินเดิล 5 แกน",
  "Machining Center Spindle": "สปินเดิลแมชชีนนิ่งเซ็นเตอร์",
  "Exhaust Fan": "พัดลมดูดอากาศ",
  "Dust Extraction Blower": "โบลเวอร์ดูดฝุ่น",
  "Booth Supply Fan": "พัดลมจ่ายอากาศห้องพ่นสี",
  "Cooling Tower Fan": "พัดลมหอผึ่งเย็น",
  "Hydraulic Press 400t": "เครื่องอัดไฮดรอลิก 400 ตัน",
  "Hydraulic Press 250t": "เครื่องอัดไฮดรอลิก 250 ตัน",

  // Sensors and factor labels
  "Vibration (RMS)": "ความสั่นสะเทือน (RMS)",
  Temperature: "อุณหภูมิ",
  Pressure: "ความดัน",
  "Motor current": "กระแสมอเตอร์",
  "Anomaly rate (7 d)": "อัตราค่าผิดปกติ (7 วัน)",
  "Run hours since overhaul": "ชั่วโมงเดินเครื่องตั้งแต่ซ่อมใหญ่",

  // Failure modes
  "Bearing outer-race defect (drive end)": "ตลับลูกปืนแหวนนอกชำรุด (ฝั่งขับ)",
  "Mechanical seal leak": "แมคคานิคอลซีลรั่ว",
  "Impeller wear / cavitation": "ใบพัดสึก / เกิดคาวิเทชัน",
  "Stator winding insulation breakdown": "ฉนวนขดลวดสเตเตอร์เสื่อม",
  "Bearing defect (non-drive end)": "ตลับลูกปืนชำรุด (ฝั่งตรงข้ามขับ)",
  "Overheating – oil cooler fouling": "ร้อนเกิน – ออยล์คูลเลอร์อุดตัน",
  "Inlet valve leakage": "วาล์วทางเข้ารั่ว",
  "Gear tooth wear": "ฟันเฟืองสึก",
  "Lubrication degradation": "น้ำมันหล่อลื่นเสื่อมสภาพ",
  "Drive belt misalignment": "สายพานขับเยื้องแนว",
  "Idler bearing seizure": "ลูกปืนลูกกลิ้งรองติดขัด",
  "Spindle bearing preload loss": "พรีโหลดลูกปืนสปินเดิลหลวม",
  "Rotor imbalance (dust build-up)": "โรเตอร์ไม่สมดุล (ฝุ่นสะสม)",
  "Bearing defect": "ตลับลูกปืนชำรุด",
  "Hydraulic pump internal leakage": "ปั๊มไฮดรอลิกรั่วภายใน",
  "Cylinder seal wear": "ซีลกระบอกสูบสึก",
  "Other / unclassified": "อื่นๆ / ไม่ระบุ",

  // Recommended actions
  "Replace drive-end bearing and re-grease; check shaft alignment after install.": "เปลี่ยนตลับลูกปืนฝั่งขับและอัดจาระบีใหม่ ตรวจศูนย์เพลาหลังติดตั้ง",
  "Replace mechanical seal; inspect sleeve for scoring.": "เปลี่ยนแมคคานิคอลซีล ตรวจปลอกเพลาว่ามีรอยขูดหรือไม่",
  "Inspect impeller and suction strainer; verify NPSH margin.": "ตรวจใบพัดและตะแกรงด้านดูด ตรวจค่า NPSH ให้มีระยะเผื่อพอ",
  "Run insulation-resistance (megger) test; plan rewind or swap with spare motor.": "ทดสอบความต้านทานฉนวน (เมกเกอร์) แล้ววางแผนพันขดลวดใหม่หรือสลับใช้มอเตอร์สำรอง",
  "Replace NDE bearing; verify lubrication interval.": "เปลี่ยนตลับลูกปืนฝั่งตรงข้ามขับ ทบทวนรอบการหล่อลื่น",
  "Clean oil cooler fins and check thermostatic valve; replace oil filter.": "ล้างครีบออยล์คูลเลอร์ ตรวจวาล์วควบคุมอุณหภูมิ และเปลี่ยนไส้กรองน้ำมัน",
  "Replace inlet valve kit; leak-test downstream header.": "เปลี่ยนชุดวาล์วทางเข้า แล้วทดสอบการรั่วของท่อเมนด้านจ่าย",
  "Borescope inspection of gear mesh; take oil sample for particle count.": "ส่องกล้องตรวจการขบของเฟือง และเก็บตัวอย่างน้ำมันส่งตรวจปริมาณอนุภาค",
  "Drain and replace gear oil; inspect breather.": "ถ่ายน้ำมันเกียร์และเติมใหม่ ตรวจช่องระบายอากาศ",
  "Re-track and re-tension belt; check pulley lagging.": "ปรับแนวและความตึงสายพาน ตรวจยางหุ้มพูลเลย์",
  "Replace seized idler bearings on return side.": "เปลี่ยนลูกปืนลูกกลิ้งรองที่ติดขัดฝั่งขากลับ",
  "Schedule spindle rebuild; reduce max RPM by 20% until serviced.": "นัดซ่อมใหญ่สปินเดิล และลดรอบสูงสุดลง 20% จนกว่าจะซ่อมเสร็จ",
  "Clean impeller and perform field balancing.": "ทำความสะอาดใบพัดและถ่วงสมดุลหน้างาน",
  "Replace fan bearings and coupling element.": "เปลี่ยนตลับลูกปืนพัดลมและยางยอยคัปปลิ้ง",
  "Replace pump seal & valve-plate kit; flush and filter oil.": "เปลี่ยนชุดซีลและวาล์วเพลตของปั๊ม แล้วล้างระบบและกรองน้ำมัน",
  "Replace cylinder seals at next planned stop.": "เปลี่ยนซีลกระบอกสูบในการหยุดเครื่องตามแผนครั้งถัดไป",
  "No action needed. Continue routine preventive maintenance.": "ยังไม่ต้องดำเนินการ ทำ PM ตามรอบปกติต่อไป",

  // Parts
  "Deep groove ball bearing 6309-2RS": "ตลับลูกปืนเม็ดกลมร่องลึก 6309-2RS",
  "Angular contact bearing 7210 BEP (pair)": "ตลับลูกปืนสัมผัสเชิงมุม 7210 BEP (คู่)",
  "Mechanical seal kit 45 mm": "ชุดแมคคานิคอลซีล 45 มม.",
  "Impeller 250 mm SS316": "ใบพัด 250 มม. สแตนเลส SS316",
  "Hydraulic pump seal & valve-plate kit": "ชุดซีลและวาล์วเพลตปั๊มไฮดรอลิก",
  "Hydraulic return filter 10 µm": "ไส้กรองน้ำมันไฮดรอลิกไหลกลับ 10 ไมครอน",
  "Compressor oil-cooler cleaning kit": "ชุดล้างออยล์คูลเลอร์เครื่องอัดอากาศ",
  "Compressor inlet valve kit": "ชุดวาล์วทางเข้าเครื่องอัดอากาศ",
  "Synthetic bearing grease 400 g": "จาระบีสังเคราะห์สำหรับลูกปืน 400 ก.",
  "Gear oil ISO VG 220, 20 L": "น้ำมันเกียร์ ISO VG 220 ขนาด 20 ลิตร",
  "V-belt SPB 2240": "สายพานร่องวี SPB 2240",
  "Fan balancing weight set": "ชุดตุ้มถ่วงสมดุลพัดลม",
  "Winding insulation varnish kit": "ชุดวาร์นิชฉนวนขดลวด",
  "Spindle preload spacer set": "ชุดแหวนรองพรีโหลดสปินเดิล",
  "Jaw coupling element 90 mm": "ยางยอยคัปปลิ้งแบบก้ามปู 90 มม.",

  // Maintenance history
  "Vibration & thermography route": "ตรวจการสั่นและภาพความร้อนตามเส้นทาง",
  "Ultrasonic leak survey": "สำรวจการรั่วด้วยอัลตราโซนิก",
  "Visual inspection – guarding and mounts": "ตรวจด้วยสายตา – การ์ดป้องกันและฐานยึด",
  "Lubrication and filter change": "หล่อลื่นและเปลี่ยนไส้กรอง",
  "Planned overhaul – bearings and seals": "ซ่อมใหญ่ตามแผน – ลูกปืนและซีล",
  "Belt and coupling check": "ตรวจสายพานและคัปปลิ้ง",
  "Replaced worn coupling element": "เปลี่ยนยางยอยคัปปลิ้งที่สึก",
  "Fixed oil leak at housing gasket": "แก้น้ำมันรั่วที่ปะเก็นเสื้อ",
  "Re-terminated loose motor lead": "ต่อสายมอเตอร์ที่หลวมใหม่",
  "Bearing replaced after PdM alert": "เปลี่ยนลูกปืนหลังได้รับแจ้งเตือนจาก PdM",
  "Alignment corrected after PdM alert": "แก้ศูนย์เพลาหลังได้รับแจ้งเตือนจาก PdM",
  "All readings recorded in route log.": "บันทึกค่าทั้งหมดในสมุดตรวจเส้นทางแล้ว",
  "Completed per PM checklist.": "ทำครบตามเช็กลิสต์ PM",
  "No abnormal findings.": "ไม่พบความผิดปกติ",
  "Unplanned stop; root cause logged.": "หยุดเครื่องนอกแผน บันทึกสาเหตุแล้ว",
  "Planned during scheduled downtime.": "ทำในช่วงหยุดเครื่องตามแผน",

  // Notification rule seeds
  "Critical – page on-call maintenance": "วิกฤต – แจ้งช่างซ่อมบำรุงเวร",
  "On-call Maintenance Engineer": "วิศวกรซ่อมบำรุงเวร",
  "Plant Manager": "ผู้จัดการโรงงาน",
  "Warning – reliability team": "เตือน – ทีม Reliability",
  "Reliability Engineers": "วิศวกร Reliability",
  "Maintenance Engineer (site)": "วิศวกรซ่อมบำรุง (ประจำโรงงาน)",
  "Chonburi press shop – supervisor": "แผนกเพรส ชลบุรี – หัวหน้างาน",
  "Press Shop Supervisor": "หัวหน้างานแผนกเพรส",
  "Connectivity issues – OT support": "ปัญหาการเชื่อมต่อ – ทีม OT",
  "OT Support Desk": "ทีมสนับสนุน OT",
  "Daily digest – plant managers": "สรุปรายวัน – ผู้จัดการโรงงาน",
  "Plant Managers": "ผู้จัดการโรงงาน",
};

export function tx(text: string, locale: Locale): string {
  return locale === "th" ? (TH[text] ?? text) : text;
}

/** "Cooling Water Pump 303" → "ปั๊มน้ำหล่อเย็น 303" */
export function txName(name: string, locale: Locale): string {
  if (locale !== "th") return name;
  const m = name.match(/^(.*) (\d+)$/);
  return m ? `${tx(m[1], locale)} ${m[2]}` : tx(name, locale);
}

const n1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function factorLabel(p: FactorParams, sensorLabel: (k: SensorKind) => string, locale: Locale): string {
  if (p.kind === "anomalies") return tx("Anomaly rate (7 d)", locale);
  if (p.kind === "hours") return tx("Run hours since overhaul", locale);
  return sensorLabel(p.sensor);
}

export function factorDetail(p: FactorParams, locale: Locale): string {
  const th = locale === "th";
  switch (p.kind) {
    case "ratio":
      return th
        ? `${n1(p.now)} ${p.unit} สูงกว่าค่าฐาน 30 วัน ${p.ratio} เท่า (${n1(p.base)} ${p.unit})`
        : `${n1(p.now)} ${p.unit}, ${p.ratio}× 30-day baseline (${n1(p.base)} ${p.unit})`;
    case "below":
      return th
        ? `${n1(p.now)} ${p.unit} ต่ำกว่าค่าฐาน 30 วัน ${p.pct}% (${n1(p.base)} ${p.unit})`
        : `${n1(p.now)} ${p.unit}, ${p.pct}% below 30-day baseline (${n1(p.base)} ${p.unit})`;
    case "temp":
      return th ? `${n1(p.now)} °C สูงกว่าค่าฐาน 30 วัน +${n1(p.delta)} °C` : `${n1(p.now)} °C, +${n1(p.delta)} °C over 30-day baseline`;
    case "load":
      return th ? `${n1(p.now)} A สูงกว่าโหลดปกติ ${p.pct}%` : `${n1(p.now)} A, ${p.pct}% above baseline load`;
    case "anomalies":
      return th ? `พบค่าผิดปกติ ${p.recent} ครั้ง เทียบกับ ${p.prior} ครั้งใน 7 วันก่อนหน้า` : `${p.recent} anomalous readings vs. ${p.prior} in the prior 7 days`;
    case "hours":
      return th
        ? `${p.hours.toLocaleString("en-US")} ชม. (ผู้ผลิตกำหนดรอบที่ ${p.interval.toLocaleString("en-US")} ชม.)`
        : `${p.hours.toLocaleString("en-US")} h (OEM interval ${p.interval.toLocaleString("en-US")} h)`;
  }
}

// ---- Alerts --------------------------------------------------------------------------

export type AlertTemplate =
  | { kind: "threshold"; sensor: SensorKind; level: "warning" | "critical"; value: number; limit: number; direction: ThresholdDirection; unit: string }
  | { kind: "prediction"; code: "failure-7d" | "rul-14" | "health-drop" | "imbalance" | "winding"; points?: number }
  | { kind: "connectivity"; code: "no-data-6h" | "no-data-2d" }
  | { kind: "transient"; code: "vibration" | "temperature"; sensor: SensorKind; warning: number; unit: string };

export type EventCode =
  | "triggered-threshold"
  | "triggered-connectivity"
  | "triggered-prediction"
  | "acknowledged"
  | "assigned"
  | "unassigned"
  | "wo-created"
  | "snoozed"
  | "snoozed-balancing"
  | "resolved"
  | "resolved-inspection"
  | "reopened";

export interface PredictionContext {
  mode: string;
  rul: number;
  low: number;
  high: number;
  level: number;
}

export function alertText(
  tpl: AlertTemplate,
  locale: Locale,
  ctx: { sensorLabel: string; prediction?: PredictionContext },
): { title: string; description: string; rule: string } {
  const th = locale === "th";
  const label = ctx.sensorLabel;
  switch (tpl.kind) {
    case "threshold": {
      const above = tpl.direction === "above";
      const sym = above ? ">" : "<";
      const level = th ? (tpl.level === "critical" ? "วิกฤต" : "เตือน") : tpl.level;
      return th
        ? {
            title: `${label}${above ? "สูงกว่า" : "ต่ำกว่า"}เกณฑ์${level}`,
            description: `${label}อยู่ที่ ${tpl.value} ${tpl.unit} ${above ? "สูงกว่า" : "ต่ำกว่า"}เกณฑ์${level} (${tpl.limit} ${tpl.unit}) นานกว่า 30 นาที`,
            rule: `${label} ${sym} ${tpl.limit} ${tpl.unit} นาน 30 นาที`,
          }
        : {
            title: `${label} ${above ? "above" : "below"} ${level} limit`,
            description: `${label} reached ${tpl.value} ${tpl.unit}, ${above ? "above" : "below"} the ${level} limit of ${tpl.limit} ${tpl.unit} for more than 30 minutes.`,
            rule: `${label} ${sym} ${tpl.limit} ${tpl.unit} for 30 min`,
          };
    }
    case "prediction": {
      const titles = th
        ? {
            "failure-7d": "คาดว่าจะเสียภายใน 7 วัน",
            "rul-14": "อายุใช้งานคงเหลือต่ำกว่า 14 วัน",
            "health-drop": `คะแนนสุขภาพลดลง ${tpl.points} คะแนนใน 7 วัน`,
            imbalance: "พบแนวโน้มโรเตอร์ไม่สมดุล",
            winding: "สงสัยฉนวนขดลวดเสื่อม",
          }
        : {
            "failure-7d": "Failure predicted within 7 days",
            "rul-14": "Remaining useful life below 14 days",
            "health-drop": `Health score dropped ${tpl.points} pts in 7 days`,
            imbalance: "Rotor imbalance trend detected",
            winding: "Winding insulation degradation suspected",
          };
      const p = ctx.prediction;
      const description = !p
        ? ""
        : th
          ? `โมเดลคาดว่าจะเกิด “${p.mode}” อายุใช้งานคงเหลือ ${p.rul} วัน (${p.low}–${p.high} วัน ช่วงความเชื่อมั่น ${p.level}%)`
          : `Model predicts “${p.mode}”. Remaining useful life ${p.rul} days (${p.low}–${p.high} d, ${p.level}% interval).`;
      return {
        title: titles[tpl.code],
        description,
        rule: th ? "RUL < 14 วัน หรือคะแนนสุขภาพลด > 10 คะแนนใน 7 วัน และความมั่นใจ ≥ 60%" : "RUL < 14 days or health drop > 10 pts / 7 d, confidence ≥ 60%",
      };
    }
    case "connectivity":
      if (tpl.code === "no-data-6h")
        return th
          ? { title: "ไม่ได้รับข้อมูลมา 6 ชั่วโมง", description: "เกตเวย์ AYT-GW-02 หยุดส่งข้อมูล ค่าจากเซนเซอร์และผลพยากรณ์ของเครื่องนี้จะหยุดชั่วคราวจนกว่าข้อมูลจะกลับมา", rule: "ไม่มีข้อมูลเกิน 2 ชม." }
          : { title: "No data received for 6 hours", description: "Edge gateway AYT-GW-02 stopped reporting. Readings and predictions for this asset are paused until data resumes.", rule: "No telemetry for > 2 h" };
      return th
        ? { title: "ไม่ได้รับข้อมูลมา 2 วัน", description: "เซนเซอร์วัดการสั่นแบบไร้สายแจ้งแบตเตอรี่ต่ำก่อนขาดการติดต่อ ผลพยากรณ์จึงไม่เป็นปัจจุบัน", rule: "ไม่มีข้อมูลเกิน 24 ชม." }
        : { title: "No data received for 2 days", description: "Wireless vibration sensor battery reported low before going silent. Predictions are stale.", rule: "No telemetry for > 24 h" };
    case "transient":
      return th
        ? {
            title: tpl.code === "vibration" ? "การสั่นพุ่งสูงชั่วขณะ" : "อุณหภูมิพุ่งหลังเดินเครื่องใหม่",
            description: `${label}เกินเกณฑ์เตือน ${tpl.warning} ${tpl.unit} ชั่วขณะ แล้วกลับสู่ปกติ`,
            rule: `${label} > ${tpl.warning} ${tpl.unit} นาน 30 นาที`,
          }
        : {
            title: tpl.code === "vibration" ? "Transient vibration spike" : "Temperature spike after restart",
            description: `${label} briefly exceeded the warning limit of ${tpl.warning} ${tpl.unit} and returned to normal.`,
            rule: `${label} > ${tpl.warning} ${tpl.unit} for 30 min`,
          };
  }
}

export function eventText(code: EventCode, locale: Locale, params: Record<string, string | number> = {}): string {
  const th = locale === "th";
  switch (code) {
    case "triggered-threshold":
      return th ? "เกิดการแจ้งเตือนจากกฎเกณฑ์ค่า" : "Alert triggered by threshold rule";
    case "triggered-connectivity":
      return th ? "เกิดการแจ้งเตือนจากกฎการเชื่อมต่อ" : "Alert triggered by connectivity rule";
    case "triggered-prediction":
      return th ? `${params.model} แจ้งเตือนจากผลพยากรณ์` : `Prediction alert raised by ${params.model}`;
    case "acknowledged":
      return th ? `${params.user} รับทราบแล้ว` : `Acknowledged by ${params.user}`;
    case "assigned":
      return th ? `มอบหมายให้ ${params.user}` : `Assigned to ${params.user}`;
    case "unassigned":
      return th ? "ยกเลิกผู้รับผิดชอบ" : "Unassigned";
    case "wo-created":
      return th ? `สร้างใบสั่งงาน ${params.wo}` : `Work order ${params.wo} created`;
    case "snoozed":
      return th ? `เลื่อนเตือน ${params.hours} ชม.` : `Snoozed for ${params.hours} h`;
    case "snoozed-balancing":
      return th ? "เลื่อนเตือน 24 ชม.: นัดถ่วงสมดุลหน้างานไว้แล้ว" : "Snoozed for 24 h: field balancing already scheduled";
    case "resolved":
      return th ? "ปิดการแจ้งเตือนแล้ว" : "Resolved";
    case "resolved-inspection":
      return th ? "ปิดแล้ว: ค่ากลับเข้าเกณฑ์หลังการตรวจ" : "Resolved: reading back within limits after inspection";
    case "reopened":
      return th ? "เปิดการแจ้งเตือนอีกครั้ง" : "Reopened";
  }
}

export function apiErrorMessage(locale: Locale): string {
  return locale === "th"
    ? "บริการ PdM ไม่ตอบสนอง (HTTP 503) ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน"
    : "The PdM service did not respond (HTTP 503). Data shown may be out of date.";
}

/** Text that exists in both languages (seed content such as work order titles). */
export type Text = string | { en: string; th: string };

export function resolveText(text: Text, locale: Locale): string {
  return typeof text === "string" ? text : text[locale];
}
