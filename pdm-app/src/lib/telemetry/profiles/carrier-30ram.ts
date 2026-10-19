// Device model (register map and fault bits): Carrier 30RAM / 30RHM-X modular chiller.
// Source: "485 communication protocol (Standard MODBUS), 30RAM/RHM-X Series Modular chiller V1.2" (2021-11-03).
//
// A seed: services/ingest adds it to the database (profiles, fault_bits) when it is missing and never
// overwrites it, so the database is the source of truth. Change it on the admin page (/hvac/admin,
// Models tab), not here; edits here only reach a database that does not have the model yet.
//
// Wording fixes against the vendor document (machine-translated from Chinese):
//  "air discharge" / "exhaust" temperature = compressor discharge temperature,
//  "low voltage" in the fault list = low PRESSURE, "high/low voltage sensor" = high/low PRESSURE sensor,
//  "temperature sensing package" = temperature sensor.

import type { FaultBitRow, ModelDef, RegisterRow, Severity } from "../register-map";

type FaultBit = Omit<FaultBitRow, "word">;

const temp = (key: string, register: number, scope: RegisterRow["scope"] = "module", verify?: string): RegisterRow => ({
  key,
  fc: 4,
  register,
  type: "int16",
  scale: 0.1,
  scope,
  ...(verify ? { verify } : {}),
});
const flag = (key: string, register: number, bits: number[]): RegisterRow => ({ key, fc: 4, register, type: "uint16", bits, scope: "module" });
const word = (key: string, register: number, scope: RegisterRow["scope"] = "module"): RegisterRow => ({ key, fc: 4, register, type: "uint16", scope });

const REGISTERS: RegisterRow[] = [
  word("enabled", 30006),
  word("mode", 30007),
  flag("comp1a", 30010, [0]),
  flag("comp1b", 30010, [3]),
  flag("comp2a", 30010, [4]),
  flag("comp2b", 30010, [7]),
  flag("comp1", 30010, [0, 3]),
  flag("comp2", 30010, [4, 7]),
  flag("fan1", 30010, [1]),
  flag("fan2", 30010, [5]),
  flag("run", 30011, [8, 12]),
  flag("defrost", 30011, [10, 14]),
  // "fault" = bit 11 or 15 of 30011, OR any of the fault words below is not zero (see TELEMETRY.md).
  flag("fault", 30011, [11, 15]),
  temp("ambient", 30012),
  temp("discharge1", 30013),
  temp("discharge2", 30014),
  temp("innerCoil1", 30015, "module", "Assumed to be the water-side (internal) coil sensor; fault bit 30030.4 names it 'internal coil'."),
  temp("innerCoil2", 30016, "module", "As innerCoil1."),
  temp("fin1", 30017),
  temp("fin2", 30018),
  temp("chwIn", 30019),
  temp("chwOut", 30020),
  temp("chwInTotal", 30021, "master"),
  temp("chwOutTotal", 30022, "master"),
  word("fault1", 30029),
  word("fault2", 30030),
  word("fault3", 30031),
  word("fault4", 30032, "master"),
  word("exv1", 30033),
  word("exv2", 30034),
  word("exv3", 30035),
  word("exv4", 30036),
  temp("antifreeze", 30047, "module", "The table gives no scaling for this register: check ×0.1 against the controller display."),
  {
    key: "setpoint",
    fc: 3,
    register: 40006,
    type: "uint16",
    scope: "master",
    verify: "Documented as 'actual value' in °C (range 5–20) with no ×0.1: check against the controller display.",
  },
];

const NOTES = [
  "Wiring: wired controller terminals A2 / B2 (the PC port; A / B is the internal module bus, never connect the PLC there).",
  "One device per module: module 0 is the master, 1..11 the slaves; each module has 50 input registers (30001-30050 for the master, +50 per slave).",
  "Reads per scan: FC04 from 50 × module, 50 registers per module; FC03 from 0, 10 registers once per unit (set points 40001-40010). Never write (FC06 / FC16).",
  "mode: 1 cooling, 2 heating, 4 water pump only, 8 heating + hot water, 16 cooling + heat recovery.",
  "Temperatures are signed: raw 65526 is -10 before ×0.1.",
  "fault: 1 when bit 11 or 15 of 30011 is set, or when any of fault1-fault4 is not zero.",
].join("\n");

const fault = (severity: Severity) => (bit: number, code: string, en: string, th: string): FaultBit => ({ bit, code, severity, en, th });
const c = fault("critical");
const w = fault("warning");

/** Meaning of every bit in the four fault words. Unlisted bits are reserved. */
const FAULT_BITS: Record<"fault1" | "fault2" | "fault3" | "fault4", FaultBit[]> = {
  // 30029 Unit failure 1
  fault1: [
    c(0, "waterFlowLow", "Insufficient water flow", "น้ำไหลผ่านเครื่องไม่พอ"),
    w(1, "externalInterlock", "External interlock open", "อินเตอร์ล็อกภายนอกตัด"),
    w(2, "wiredControllerSwitch", "Wired controller switch", "สวิตช์ที่ตัวควบคุมแบบสาย"),
    c(3, "masterCommLoss", "Lost communication with the master module", "โมดูลขาดการสื่อสารกับโมดูลหลัก"),
    w(4, "ambientSensor", "Ambient temperature sensor fault", "เซนเซอร์อุณหภูมิภายนอกเสีย"),
    w(5, "antifreezeSensor", "Antifreeze temperature sensor fault", "เซนเซอร์อุณหภูมิกันน้ำแข็งเสีย"),
    w(6, "totalWaterSensor", "Common header water temperature sensor fault", "เซนเซอร์อุณหภูมิน้ำรวมเสีย"),
    w(7, "userWaterFlowLow", "Insufficient heat recovery / hot water flow", "น้ำฝั่ง heat recovery หรือน้ำร้อนไหลไม่พอ"),
    c(8, "dischargeHigh1", "Circuit 1 high discharge temperature", "อุณหภูมิด้านอัดวงจร 1 สูง"),
    c(9, "dischargeHigh2", "Circuit 2 high discharge temperature", "อุณหภูมิด้านอัดวงจร 2 สูง"),
    w(10, "dischargeSensor1", "Circuit 1 discharge temperature sensor fault", "เซนเซอร์อุณหภูมิด้านอัดวงจร 1 เสีย"),
    w(11, "dischargeSensor2", "Circuit 2 discharge temperature sensor fault", "เซนเซอร์อุณหภูมิด้านอัดวงจร 2 เสีย"),
    w(12, "finSensor1", "Circuit 1 outdoor coil temperature sensor fault", "เซนเซอร์อุณหภูมิคอยล์ภายนอกวงจร 1 เสีย"),
    w(13, "finSensor2", "Circuit 2 outdoor coil temperature sensor fault", "เซนเซอร์อุณหภูมิคอยล์ภายนอกวงจร 2 เสีย"),
    c(14, "overload1", "Circuit 1 overload", "วงจร 1 โอเวอร์โหลด"),
    c(15, "overload2", "Circuit 2 overload", "วงจร 2 โอเวอร์โหลด"),
  ],
  // 30030 Unit failure 2
  fault2: [
    w(0, "userWaterInSensor", "Heat recovery water inlet sensor fault", "เซนเซอร์น้ำเข้าฝั่ง heat recovery เสีย"),
    w(1, "userWaterOutSensor", "Heat recovery water outlet sensor fault", "เซนเซอร์น้ำออกฝั่ง heat recovery เสีย"),
    w(2, "tankSensor", "Tank temperature sensor fault", "เซนเซอร์อุณหภูมิถังเสีย"),
    w(3, "heatRecoverySensor", "Heat recovery outlet sensor fault", "เซนเซอร์ทางออก heat recovery เสีย"),
    w(4, "innerCoilSensor1", "Circuit 1 internal coil temperature sensor fault", "เซนเซอร์อุณหภูมิคอยล์ภายในวงจร 1 เสีย"),
    w(5, "innerCoilSensor2", "Circuit 2 internal coil temperature sensor fault", "เซนเซอร์อุณหภูมิคอยล์ภายในวงจร 2 เสีย"),
    c(6, "highPressure1", "Circuit 1 high pressure", "แรงดันด้านสูงวงจร 1 เกิน"),
    c(7, "highPressure2", "Circuit 2 high pressure", "แรงดันด้านสูงวงจร 2 เกิน"),
    w(8, "moduleInSensor", "Module water inlet temperature sensor fault", "เซนเซอร์อุณหภูมิน้ำเข้าโมดูลเสีย"),
    w(9, "moduleOutSensor", "Module water outlet temperature sensor fault", "เซนเซอร์อุณหภูมิน้ำออกโมดูลเสีย"),
    w(10, "waterBelowSetpoint", "Water temperature below set point", "อุณหภูมิน้ำต่ำกว่าค่าที่ตั้ง"),
    c(11, "waterBelow3C", "Water temperature below 3 °C (freeze risk)", "อุณหภูมิน้ำต่ำกว่า 3 °C เสี่ยงน้ำแข็ง"),
    w(12, "waterTooHigh", "Water temperature too high", "อุณหภูมิน้ำสูงเกิน"),
    c(13, "latchedFault", "Fault needs a manual reset", "มี fault ที่ต้องรีเซ็ตด้วยมือ"),
    w(14, "userWaterOutHigh", "Heat recovery water outlet temperature too high", "อุณหภูมิน้ำออกฝั่ง heat recovery สูงเกิน"),
    c(15, "lowPressure", "Low pressure", "แรงดันด้านต่ำต่ำเกิน"),
  ],
  // 30031 Unit failure 3
  fault3: [
    w(0, "dischargeSensor1b", "Circuit 1 second compressor discharge sensor fault", "เซนเซอร์อุณหภูมิด้านอัดคอมเพรสเซอร์ตัวที่ 2 วงจร 1 เสีย"),
    w(1, "dischargeSensor2b", "Circuit 2 second compressor discharge sensor fault", "เซนเซอร์อุณหภูมิด้านอัดคอมเพรสเซอร์ตัวที่ 2 วงจร 2 เสีย"),
    c(2, "phaseLoss", "Phase loss", "ไฟขาดเฟส"),
    c(3, "phaseSequence", "Wrong phase sequence", "ลำดับเฟสผิด"),
    w(4, "lowCurrent1", "Circuit 1 low current", "กระแสวงจร 1 ต่ำ"),
    w(5, "lowCurrent2", "Circuit 2 low current", "กระแสวงจร 2 ต่ำ"),
    c(6, "highCurrent1", "Circuit 1 high current", "กระแสวงจร 1 สูงเกิน"),
    c(7, "highCurrent2", "Circuit 2 high current", "กระแสวงจร 2 สูงเกิน"),
    c(8, "lowPressureCooling1", "Circuit 1 low pressure (cooling)", "แรงดันด้านต่ำวงจร 1 ต่ำเกิน (โหมดทำความเย็น)"),
    c(9, "lowPressureCooling2", "Circuit 2 low pressure (cooling)", "แรงดันด้านต่ำวงจร 2 ต่ำเกิน (โหมดทำความเย็น)"),
    c(10, "lowPressureHeating1", "Circuit 1 low pressure (heating)", "แรงดันด้านต่ำวงจร 1 ต่ำเกิน (โหมดทำความร้อน)"),
    c(11, "lowPressureHeating2", "Circuit 2 low pressure (heating)", "แรงดันด้านต่ำวงจร 2 ต่ำเกิน (โหมดทำความร้อน)"),
    w(12, "highPressureSensor1", "High pressure sensor 1 fault", "เซนเซอร์แรงดันด้านสูง 1 เสีย"),
    w(13, "highPressureSensor2", "High pressure sensor 2 fault", "เซนเซอร์แรงดันด้านสูง 2 เสีย"),
    w(14, "lowPressureSensor1", "Low pressure sensor 1 fault", "เซนเซอร์แรงดันด้านต่ำ 1 เสีย"),
    w(15, "lowPressureSensor2", "Low pressure sensor 2 fault", "เซนเซอร์แรงดันด้านต่ำ 2 เสีย"),
  ],
  // 30032 Unit failure 4 (master only): slave module n has stopped answering on the internal bus
  fault4: Array.from({ length: 15 }, (_, i) =>
    c(i, `slaveCommLoss${i + 1}`, `Lost communication with slave module ${i + 1}`, `ขาดการสื่อสารกับโมดูลรอง ${i + 1}`),
  ),
};

export const CARRIER_30RAM: ModelDef = {
  id: "carrier-30ram",
  kind: "chiller",
  vendor: "Carrier",
  model: "30RAM / 30RHM-X modular chiller",
  spec: {
    document: "485 communication protocol (Standard MODBUS) V1.2, 2021-11-03",
    addressing: "modicon",
    serial: { protocol: "rtu", baud: 19200, dataBits: 8, parity: "none", stopBits: 1, slaveId: 1 },
    modules: { max: 12, blockSize: 50 },
    registers: REGISTERS,
    notAvailable: ["loadPct", "flow", "kw", "suction1", "suction2", "coilOut1", "coilOut2", "lowP1", "lowP2", "highP1", "highP2"],
    notes: NOTES,
  },
  faultBits: Object.entries(FAULT_BITS).flatMap(([word, bits]) => bits.map((b) => ({ word, ...b }))),
};
