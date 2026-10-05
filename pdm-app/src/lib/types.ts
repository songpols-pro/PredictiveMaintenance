// Domain model for the Predictive Maintenance app.
// The mock layer (src/lib/mock) and the API facade (src/lib/api.ts) both speak these types,
// so a real backend only has to return the same shapes.

export type AssetStatus = "critical" | "warning" | "healthy" | "offline";
export type Severity = "critical" | "warning" | "info";
export type SensorKind = "vibration" | "temperature" | "pressure" | "current";
export type ThresholdDirection = "above" | "below";

export type AssetType =
  | "Centrifugal Pump"
  | "Electric Motor"
  | "Air Compressor"
  | "Gearbox"
  | "Conveyor"
  | "CNC Spindle"
  | "Fan / Blower"
  | "Hydraulic Press";

export interface Line {
  id: string;
  name: string;
}

export interface Site {
  id: string;
  name: string;
  region: string;
  lines: Line[];
}

export interface FailureModeEstimate {
  mode: string;
  probability: number; // 0..1
}

export interface ContributingFactor {
  label: string;
  detail: string;
  weight: number; // 0..1, all factors sum to 1
  sensor?: SensorKind;
}

export interface Prediction {
  rulDays: number; // point estimate
  rulLow: number; // lower bound of the confidence interval
  rulHigh: number; // upper bound
  intervalLevel: number; // e.g. 0.8 => 80% interval
  confidence: number; // model confidence 0..1
  failureModes: FailureModeEstimate[]; // sorted, first is the most likely
  failureProbability30d: number;
  contributingFactors: ContributingFactor[];
  recommendedAction: string;
  recommendedParts: string[]; // part numbers
  modelVersion: string;
  scoredAt: string; // ISO
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  siteId: string;
  lineId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installedAt: string;
  criticality: "A" | "B" | "C";
  status: AssetStatus;
  healthScore: number; // 0..100 (last known when offline)
  healthDelta7d: number; // change in points over 7 days
  prediction: Prediction | null; // null when there is not enough data
  sensors: SensorKind[];
  lastInspectionAt: string;
  lastDataAt: string; // data freshness
  operatingHours: number;
}

export interface SensorConfig {
  kind: SensorKind;
  label: string;
  unit: string;
  direction: ThresholdDirection;
  warning: number;
  critical: number;
}

export interface SensorPoint {
  t: number; // epoch ms
  v: number | null; // null = no data (gap)
  anomaly?: number | null; // value of the anomaly within this bucket, if any
}

export interface SensorSeries {
  config: SensorConfig;
  points: SensorPoint[];
  baseline: number;
  latest: number | null;
  anomalyCount: number;
}

export interface HealthPoint {
  t: number;
  score: number | null;
  forecast?: number | null;
  band?: [number, number] | null;
}

export type MaintenanceType = "preventive" | "corrective" | "inspection" | "predictive";

export interface MaintenanceEvent {
  id: string;
  assetId: string;
  date: string;
  type: MaintenanceType;
  title: string;
  technician: string;
  downtimeHours: number;
  notes: string;
  workOrderId?: string;
}

export type AlertStatus = "open" | "acknowledged" | "snoozed" | "resolved";
export type AlertSource = "threshold" | "prediction" | "connectivity";

export interface AlertEvent {
  at: string;
  text: string;
  by?: string; // user id
}

export interface Alert {
  id: string;
  assetId: string;
  severity: Severity;
  status: AlertStatus;
  source: AlertSource;
  title: string;
  description: string;
  rule: string;
  sensor?: SensorKind;
  value?: number;
  threshold?: number;
  confidence?: number;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  assigneeId?: string;
  snoozedUntil?: string;
  resolvedAt?: string;
  workOrderId?: string;
  events: AlertEvent[];
}

export type WorkOrderStatus = "open" | "in_progress" | "done";
export type Priority = "P1" | "P2" | "P3" | "P4";

export interface PartLine {
  partNo: string;
  qty: number;
}

export interface Part {
  partNo: string;
  name: string;
  inStock: number;
  leadTimeDays: number;
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  assetId: string;
  alertId?: string;
  status: WorkOrderStatus;
  priority: Priority;
  type: MaintenanceType;
  assigneeId?: string;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  parts: PartLine[];
}

export type Role =
  | "Admin"
  | "Plant Manager"
  | "Reliability Engineer"
  | "Maintenance Engineer"
  | "Technician";

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  siteIds: string[];
  active: boolean;
}

export interface SiteKpis {
  mtbfHours: number;
  mtbfHoursPrev: number;
  mttrHours: number;
  mttrHoursPrev: number;
  oee: number; // 0..1
  oeePrev: number;
  unplannedDowntimeHours: number; // last 30 days
  unplannedDowntimeHoursPrev: number;
}

export interface ThresholdSetting {
  assetType: AssetType;
  sensor: SensorKind;
  direction: ThresholdDirection;
  unit: string;
  warning: number;
  critical: number;
}

export interface PredictionSettings {
  healthWarningBelow: number;
  healthCriticalBelow: number;
  rulAlertDays: number;
  minConfidence: number; // 0..1
}

export type Channel = "email" | "sms" | "teams" | "line";

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  severities: Severity[];
  siteIds: string[]; // empty = all sites
  channels: Channel[];
  recipients: string; // free text: role or group
  escalateAfterMinutes: number | null;
  escalateTo: string | null;
}

export type SimulationMode = "normal" | "loading" | "empty" | "error";
export type TimeRange = "24h" | "7d" | "30d" | "90d";
