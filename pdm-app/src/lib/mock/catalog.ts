// Static reference data: sites, people, parts, sensor setups and failure modes per asset type.

import type {
  AssetType,
  NotificationRule,
  Part,
  PredictionSettings,
  SensorConfig,
  SensorKind,
  Site,
  SiteKpis,
  User,
} from "@/lib/types";

export const SITES: Site[] = [
  {
    id: "RYG",
    name: "Rayong Plant",
    region: "Eastern Seaboard",
    lines: [
      { id: "RYG-L1", name: "Machining" },
      { id: "RYG-L2", name: "Assembly" },
      { id: "RYG-UT", name: "Utilities" },
    ],
  },
  {
    id: "CBI",
    name: "Chonburi Plant",
    region: "Eastern Seaboard",
    lines: [
      { id: "CBI-L1", name: "Press Shop" },
      { id: "CBI-L2", name: "Paint Line" },
      { id: "CBI-UT", name: "Utilities" },
    ],
  },
  {
    id: "AYT",
    name: "Ayutthaya Plant",
    region: "Central",
    lines: [
      { id: "AYT-L1", name: "Woodworking" },
      { id: "AYT-L2", name: "Finishing" },
      { id: "AYT-UT", name: "Utilities" },
    ],
  },
];

export const USERS: User[] = [
  { id: "u1", name: "Niran Kittisak", initials: "NK", email: "niran.k@example.com", role: "Reliability Engineer", siteIds: ["RYG", "CBI", "AYT"], active: true },
  { id: "u2", name: "Somchai Prasert", initials: "SP", email: "somchai.p@example.com", role: "Maintenance Engineer", siteIds: ["RYG"], active: true },
  { id: "u3", name: "Kanya Srisuk", initials: "KS", email: "kanya.s@example.com", role: "Plant Manager", siteIds: ["RYG"], active: true },
  { id: "u4", name: "Arthit Wongsa", initials: "AW", email: "arthit.w@example.com", role: "Maintenance Engineer", siteIds: ["CBI"], active: true },
  { id: "u5", name: "Ploy Thanakorn", initials: "PT", email: "ploy.t@example.com", role: "Technician", siteIds: ["CBI"], active: true },
  { id: "u6", name: "Wichai Rattana", initials: "WR", email: "wichai.r@example.com", role: "Maintenance Engineer", siteIds: ["AYT"], active: true },
  { id: "u7", name: "Malee Chaiyaporn", initials: "MC", email: "malee.c@example.com", role: "Plant Manager", siteIds: ["CBI"], active: true },
  { id: "u8", name: "Tanawat Boonmee", initials: "TB", email: "tanawat.b@example.com", role: "Technician", siteIds: ["AYT", "RYG"], active: true },
  { id: "u9", name: "Supaporn Jaidee", initials: "SJ", email: "supaporn.j@example.com", role: "Admin", siteIds: ["RYG", "CBI", "AYT"], active: true },
  { id: "u10", name: "Ekkachai Somboon", initials: "ES", email: "ekkachai.s@example.com", role: "Technician", siteIds: ["RYG"], active: false },
];

export const CURRENT_USER_ID = "u1";

export const PARTS: Part[] = [
  { partNo: "BRG-6309-2RS", name: "Deep groove ball bearing 6309-2RS", inStock: 6, leadTimeDays: 3 },
  { partNo: "BRG-7210-BEP", name: "Angular contact bearing 7210 BEP (pair)", inStock: 2, leadTimeDays: 10 },
  { partNo: "SEAL-MS-45", name: "Mechanical seal kit 45 mm", inStock: 1, leadTimeDays: 7 },
  { partNo: "IMP-250-SS", name: "Impeller 250 mm SS316", inStock: 0, leadTimeDays: 21 },
  { partNo: "HYD-PUMP-SK", name: "Hydraulic pump seal & valve-plate kit", inStock: 0, leadTimeDays: 12 },
  { partNo: "HYD-FLT-10", name: "Hydraulic return filter 10 µm", inStock: 8, leadTimeDays: 4 },
  { partNo: "CMP-CLR-KIT", name: "Compressor oil-cooler cleaning kit", inStock: 3, leadTimeDays: 5 },
  { partNo: "CMP-VLV-KIT", name: "Compressor inlet valve kit", inStock: 1, leadTimeDays: 14 },
  { partNo: "GRS-SHC-100", name: "Synthetic bearing grease 400 g", inStock: 24, leadTimeDays: 2 },
  { partNo: "OIL-ISO-220", name: "Gear oil ISO VG 220, 20 L", inStock: 5, leadTimeDays: 3 },
  { partNo: "BLT-SPB-2240", name: "V-belt SPB 2240", inStock: 10, leadTimeDays: 3 },
  { partNo: "FAN-BAL-WT", name: "Fan balancing weight set", inStock: 4, leadTimeDays: 5 },
  { partNo: "MTR-INS-VRN", name: "Winding insulation varnish kit", inStock: 2, leadTimeDays: 6 },
  { partNo: "SPN-PRL-SET", name: "Spindle preload spacer set", inStock: 0, leadTimeDays: 18 },
  { partNo: "CPL-JAW-90", name: "Jaw coupling element 90 mm", inStock: 7, leadTimeDays: 4 },
];

export const SENSOR_LABELS: Record<SensorKind, string> = {
  vibration: "Vibration (RMS)",
  temperature: "Temperature",
  pressure: "Pressure",
  current: "Motor current",
};

interface SensorTemplate extends SensorConfig {
  base: number;
  noise: number;
  daily: number; // amplitude of the daily load cycle
}

export interface FailureModeDef {
  mode: string;
  primary: SensorKind;
  secondary: Partial<Record<SensorKind, number>>; // effect weight 0..1
  action: string;
  parts: string[];
}

export interface TypeProfile {
  code: string;
  names: string[];
  manufacturers: { name: string; models: string[] }[];
  sensors: SensorTemplate[];
  failureModes: FailureModeDef[];
}

function vib(base: number, warning = 4.5, critical = 7.1): SensorTemplate {
  return { kind: "vibration", label: SENSOR_LABELS.vibration, unit: "mm/s", direction: "above", warning, critical, base, noise: base * 0.06, daily: base * 0.05 };
}
function temp(base: number, warning: number, critical: number): SensorTemplate {
  return { kind: "temperature", label: SENSOR_LABELS.temperature, unit: "°C", direction: "above", warning, critical, base, noise: 0.8, daily: 2.5 };
}
function pres(base: number, warning: number, critical: number): SensorTemplate {
  return { kind: "pressure", label: SENSOR_LABELS.pressure, unit: "bar", direction: "below", warning, critical, base, noise: base * 0.015, daily: base * 0.02 };
}
function amps(base: number): SensorTemplate {
  return { kind: "current", label: SENSOR_LABELS.current, unit: "A", direction: "above", warning: Math.round(base * 1.18), critical: Math.round(base * 1.32), base, noise: base * 0.02, daily: base * 0.05 };
}

export const TYPE_PROFILES: Record<AssetType, TypeProfile> = {
  "Centrifugal Pump": {
    code: "PMP",
    names: ["Cooling Water Pump", "Chilled Water Pump", "Process Water Pump", "Condensate Pump", "Hot Water Pump"],
    manufacturers: [{ name: "Grundfos", models: ["NB 80-250", "NK 100-315"] }, { name: "KSB", models: ["Etanorm 080-250", "Etabloc 065-200"] }],
    sensors: [vib(2.1), temp(55, 80, 95), pres(4.3, 3.6, 3.2), amps(38)],
    failureModes: [
      { mode: "Bearing outer-race defect (drive end)", primary: "vibration", secondary: { temperature: 0.55, current: 0.15 }, action: "Replace drive-end bearing and re-grease; check shaft alignment after install.", parts: ["BRG-6309-2RS", "GRS-SHC-100"] },
      { mode: "Mechanical seal leak", primary: "pressure", secondary: { vibration: 0.3, temperature: 0.25 }, action: "Replace mechanical seal; inspect sleeve for scoring.", parts: ["SEAL-MS-45"] },
      { mode: "Impeller wear / cavitation", primary: "pressure", secondary: { vibration: 0.45, current: 0.3 }, action: "Inspect impeller and suction strainer; verify NPSH margin.", parts: ["IMP-250-SS"] },
    ],
  },
  "Electric Motor": {
    code: "MTR",
    names: ["Main Drive Motor", "Spindle Drive Motor", "Hydraulic Pump Motor", "Conveyor Drive Motor", "Mixer Motor"],
    manufacturers: [{ name: "ABB", models: ["M3BP 200", "M3BP 160"] }, { name: "Siemens", models: ["1LE1 180", "SIMOTICS GP 132"] }],
    sensors: [vib(1.6), temp(78, 110, 130), amps(62)],
    failureModes: [
      { mode: "Stator winding insulation breakdown", primary: "current", secondary: { temperature: 0.7, vibration: 0.15 }, action: "Run insulation-resistance (megger) test; plan rewind or swap with spare motor.", parts: ["MTR-INS-VRN"] },
      { mode: "Bearing defect (non-drive end)", primary: "vibration", secondary: { temperature: 0.5 }, action: "Replace NDE bearing; verify lubrication interval.", parts: ["BRG-6309-2RS", "GRS-SHC-100"] },
    ],
  },
  "Air Compressor": {
    code: "CMP",
    names: ["Screw Compressor", "Air Compressor"],
    manufacturers: [{ name: "Atlas Copco", models: ["GA 75", "GA 55 VSD"] }, { name: "Kaeser", models: ["CSD 105", "BSD 72"] }],
    sensors: [vib(2.4), temp(82, 100, 110), pres(7.6, 6.9, 6.4), amps(128)],
    failureModes: [
      { mode: "Overheating – oil cooler fouling", primary: "temperature", secondary: { current: 0.4, vibration: 0.1 }, action: "Clean oil cooler fins and check thermostatic valve; replace oil filter.", parts: ["CMP-CLR-KIT"] },
      { mode: "Inlet valve leakage", primary: "pressure", secondary: { current: 0.35, temperature: 0.2 }, action: "Replace inlet valve kit; leak-test downstream header.", parts: ["CMP-VLV-KIT"] },
    ],
  },
  Gearbox: {
    code: "GBX",
    names: ["Main Gearbox", "Conveyor Gearbox", "Reducer Gearbox"],
    manufacturers: [{ name: "SEW-Eurodrive", models: ["X3KS 180", "R97"] }, { name: "Flender", models: ["H2SH 7"] }],
    sensors: [vib(2.8), temp(60, 85, 95), amps(45)],
    failureModes: [
      { mode: "Gear tooth wear", primary: "vibration", secondary: { temperature: 0.4 }, action: "Borescope inspection of gear mesh; take oil sample for particle count.", parts: ["OIL-ISO-220"] },
      { mode: "Lubrication degradation", primary: "temperature", secondary: { vibration: 0.35 }, action: "Drain and replace gear oil; inspect breather.", parts: ["OIL-ISO-220"] },
    ],
  },
  Conveyor: {
    code: "CNV",
    names: ["Belt Conveyor", "Roller Conveyor", "Overhead Conveyor"],
    manufacturers: [{ name: "Interroll", models: ["RM 8320", "CM 5000"] }, { name: "Dorner", models: ["3200 Series"] }],
    sensors: [vib(1.9), temp(48, 70, 85), amps(18)],
    failureModes: [
      { mode: "Drive belt misalignment", primary: "vibration", secondary: { current: 0.4 }, action: "Re-track and re-tension belt; check pulley lagging.", parts: ["BLT-SPB-2240"] },
      { mode: "Idler bearing seizure", primary: "temperature", secondary: { vibration: 0.5, current: 0.3 }, action: "Replace seized idler bearings on return side.", parts: ["BRG-6309-2RS"] },
    ],
  },
  "CNC Spindle": {
    code: "SPN",
    names: ["CNC Router Spindle", "5-Axis Spindle", "Machining Center Spindle"],
    manufacturers: [{ name: "HSD", models: ["ES951", "ES929"] }, { name: "Fischer", models: ["MFW-2310"] }],
    sensors: [vib(1.2, 2.8, 4.5), temp(38, 55, 65), amps(22)],
    failureModes: [
      { mode: "Spindle bearing preload loss", primary: "vibration", secondary: { temperature: 0.6 }, action: "Schedule spindle rebuild; reduce max RPM by 20% until serviced.", parts: ["BRG-7210-BEP", "SPN-PRL-SET"] },
    ],
  },
  "Fan / Blower": {
    code: "FAN",
    names: ["Exhaust Fan", "Dust Extraction Blower", "Booth Supply Fan", "Cooling Tower Fan"],
    manufacturers: [{ name: "Ziehl-Abegg", models: ["ZAplus 900", "FE2owlet 710"] }, { name: "Nicotra Gebhardt", models: ["RZR 13-0500"] }],
    sensors: [vib(2.3), temp(46, 75, 90), amps(30)],
    failureModes: [
      { mode: "Rotor imbalance (dust build-up)", primary: "vibration", secondary: { current: 0.2 }, action: "Clean impeller and perform field balancing.", parts: ["FAN-BAL-WT"] },
      { mode: "Bearing defect", primary: "vibration", secondary: { temperature: 0.55 }, action: "Replace fan bearings and coupling element.", parts: ["BRG-6309-2RS", "CPL-JAW-90"] },
    ],
  },
  "Hydraulic Press": {
    code: "HPR",
    names: ["Hydraulic Press 400t", "Hydraulic Press 250t"],
    manufacturers: [{ name: "Schuler", models: ["HPX 400", "HPX 250"] }, { name: "Komatsu", models: ["H2F 250"] }],
    sensors: [vib(2.0), temp(48, 60, 68), pres(182, 165, 155), amps(95)],
    failureModes: [
      { mode: "Hydraulic pump internal leakage", primary: "pressure", secondary: { temperature: 0.6, current: 0.3 }, action: "Replace pump seal & valve-plate kit; flush and filter oil.", parts: ["HYD-PUMP-SK", "HYD-FLT-10"] },
      { mode: "Cylinder seal wear", primary: "pressure", secondary: { temperature: 0.3 }, action: "Replace cylinder seals at next planned stop.", parts: ["HYD-FLT-10"] },
    ],
  },
};

export function sensorTemplate(type: AssetType, kind: SensorKind) {
  return TYPE_PROFILES[type].sensors.find((s) => s.kind === kind);
}

export const SITE_KPIS: Record<string, SiteKpis> = {
  RYG: { mtbfHours: 612, mtbfHoursPrev: 571, mttrHours: 3.8, mttrHoursPrev: 4.4, oee: 0.781, oeePrev: 0.764, unplannedDowntimeHours: 21.5, unplannedDowntimeHoursPrev: 30.2 },
  CBI: { mtbfHours: 438, mtbfHoursPrev: 466, mttrHours: 5.1, mttrHoursPrev: 4.6, oee: 0.716, oeePrev: 0.729, unplannedDowntimeHours: 38.0, unplannedDowntimeHoursPrev: 31.4 },
  AYT: { mtbfHours: 529, mtbfHoursPrev: 518, mttrHours: 4.2, mttrHoursPrev: 4.3, oee: 0.752, oeePrev: 0.748, unplannedDowntimeHours: 26.7, unplannedDowntimeHoursPrev: 27.9 },
};

export const DEFAULT_PREDICTION_SETTINGS: PredictionSettings = {
  healthWarningBelow: 70,
  healthCriticalBelow: 40,
  rulAlertDays: 14,
  minConfidence: 0.6,
};

export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  { id: "nr1", name: "Critical – page on-call maintenance", enabled: true, severities: ["critical"], siteIds: [], channels: ["sms", "line", "email"], recipients: "On-call Maintenance Engineer", escalateAfterMinutes: 30, escalateTo: "Plant Manager" },
  { id: "nr2", name: "Warning – reliability team", enabled: true, severities: ["warning"], siteIds: [], channels: ["email", "teams"], recipients: "Reliability Engineers", escalateAfterMinutes: 240, escalateTo: "Maintenance Engineer (site)" },
  { id: "nr3", name: "Chonburi press shop – supervisor", enabled: true, severities: ["critical", "warning"], siteIds: ["CBI"], channels: ["line"], recipients: "Press Shop Supervisor", escalateAfterMinutes: null, escalateTo: null },
  { id: "nr4", name: "Connectivity issues – OT support", enabled: true, severities: ["info"], siteIds: [], channels: ["email"], recipients: "OT Support Desk", escalateAfterMinutes: null, escalateTo: null },
  { id: "nr5", name: "Daily digest – plant managers", enabled: false, severities: ["critical", "warning", "info"], siteIds: [], channels: ["email"], recipients: "Plant Managers", escalateAfterMinutes: null, escalateTo: null },
];
