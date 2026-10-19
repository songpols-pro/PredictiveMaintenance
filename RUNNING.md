# คู่มือรันโปรแกรมและการจำลอง

วิธีเปิด ปิด และจำลองระบบทั้งหมดบนเครื่องพัฒนา ส่วนการ deploy ขึ้น cloud ดู [`DEPLOY.md`](DEPLOY.md) และสเปกสำหรับ PLC จริงดู [`TELEMETRY.md`](TELEMETRY.md) การซ้อมเพิ่มโรงงานใหม่ด้วย PLC จำลองดู [`NEW-PLANT.md`](NEW-PLANT.md) ส่วน F

## โปรแกรมในระบบ

| โปรแกรม | โฟลเดอร์ | คำสั่ง | หน้าที่ | พอร์ต |
|---|---|---|---|---|
| เว็บ | `pdm-app` | `npm run dev` | เว็บไซต์ `/`, แอป PdM `/app` (ข้อมูลจำลองเสมอ) และ Chiller Plant `/hvac` | http://localhost:3000 |
| Ingestion | `services/ingest` | `npm start` | รับข้อความจาก MQTT แล้วเก็บลง TimescaleDB (ประวัติ, alarm) และ Firestore (ค่าล่าสุด) | http://localhost:8090/healthz |
| Virtual PLC | `services/virtual-plc` | `npm start` | PLC จำลอง 3 ตัว อุปกรณ์รวม 34 ตัว ใน 2 โปรเจค ส่งข้อมูลตามสเปกเหมือน PLC จริง | ไม่มี |
| MQTT broker ในเครื่อง | `services/virtual-plc` | `npm run broker` | broker สำรองสำหรับทดสอบโดยไม่ใช้ EMQX | mqtt://127.0.0.1:1883 |
| ตัวตรวจ (tap) | `services/virtual-plc` | `npm run tap` | ดูและตรวจทุกข้อความที่ผ่าน broker | ไม่มี |

เส้นทางข้อมูล:

```
Virtual PLC ──MQTT/TLS──▶ EMQX Cloud ──▶ Ingestion ──▶ TimescaleDB (Tiger Cloud) ──/api/hvac/*──▶ เว็บ /hvac
                                                  └─▶ Firestore ──────────────────onSnapshot──▶
```

- **ทุกโปรแกรมต้องเปิด terminal แยกกัน:** แต่ละตัวรันค้างไว้จนกด Ctrl+C
- **คำสั่งในคู่มือนี้เริ่มจากโฟลเดอร์หลักของโปรเจค** (`E:\POP\CLAUDE\Monitor`)
- **ใช้ได้ทั้ง Git Bash และ PowerShell:** ยกเว้นคำสั่งที่แยกไว้ให้ชัดว่าเป็นของ shell ไหน
- **ถ้าตัวเลือกหลัง `--` ไม่มีผลใน PowerShell:** ให้พิมพ์ `npm.cmd` แทน `npm` เช่น `npm.cmd start -- --once`

## ติดตั้งและตั้งค่าครั้งแรก

ต้องมี Node.js 22 ขึ้นไป แล้วติดตั้ง package ทั้ง 3 โฟลเดอร์:

```bash
cd pdm-app
npm install
cd ../services/ingest
npm install
cd ../virtual-plc
npm install
```

ไฟล์ตั้งค่า (ไม่ถูก commit ขึ้น git) บนเครื่องนี้กรอกไว้แล้ว ถ้าย้ายไปเครื่องใหม่ให้คัดลอกจาก `.env.example` ในโฟลเดอร์เดียวกันแล้วกรอกเอง:

| ไฟล์ | สิ่งที่ต้องมี |
|---|---|
| `services/ingest/.env` | EMQX (ผู้ใช้ `ingest`), `DATABASE_URL` ของ Tiger Cloud, `FIREBASE_PROJECT_ID` และ `NOTIFY_EMAIL=off` (อีเมลแจ้งเตือน alarm เปิดเฉพาะ ingestion ตัวที่ deploy ดู [`DEPLOY.md`](DEPLOY.md)) |
| `services/virtual-plc/.env` | EMQX (ผู้ใช้ `virtual-plc` สำหรับส่ง และผู้ใช้ `ingest` สำหรับ tap) |
| `pdm-app/.env.local` | `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_HVAC_SOURCE=live`, `DATABASE_URL` |

Ingestion และ API ของเว็บเขียน Firestore ด้วยสิทธิ์ของบัญชี Google ในเครื่อง ถ้ายังไม่เคย login หรือขึ้น error เรื่อง credentials ให้สั่ง:

```bash
gcloud auth application-default login
```

## แบบที่ 1: ระบบเต็มด้วย PLC จำลองผ่าน cloud จริง

ใช้ทดสอบเส้นทางเดียวกับ PLC จริงทุกขั้น เปิด 3 terminal ตามลำดับนี้

**1. Ingestion** เปิดก่อนเพื่อพร้อมรับข้อมูล รอจนขึ้นบรรทัด `connected to mqtts://...`

```bash
cd services/ingest
npm start
```

**2. Virtual PLC**

```bash
cd services/virtual-plc
npm start
```

**3. เว็บ**

```bash
cd pdm-app
npm run dev
```

จากนั้นเปิด http://localhost:3000/hvac แล้ว login ด้วยบัญชีที่ได้รับสิทธิ์ (วิธีให้สิทธิ์ดู [`DEPLOY.md`](DEPLOY.md) หัวข้อ "เพิ่มผู้ใช้")

- **ข้อมูลแรกจะขึ้นภายในประมาณ 1 นาที:** `hq-chiller` และ `factory-b/plc-01` ส่งทุก 1 นาที ส่วน `factory-b/plc-02` ส่งทุก 5 นาที
- **สลับโปรเจค:** ที่เมนูบัญชีมุมขวาบน
- **ดูสถานะ ingestion:** เปิด http://localhost:8090/healthz จะเห็นสถานะ MQTT, จำนวนข้อความที่รับ เก็บ ซ้ำ และปฏิเสธ และจำนวน alarm ที่เปิดและปิด
- **ถ้าเปิด ingestion ทีหลัง PLC ข้อมูลไม่หาย:** EMQX เก็บข้อความไว้ให้ (persistent session) แล้วส่งต่อเมื่อ ingestion กลับมา

## แบบที่ 2: เว็บอย่างเดียวด้วยข้อมูลจำลองในตัว

ไม่ต้อง login ไม่ต้องรัน ingestion หรือ PLC และไม่ใช้ cloud เลย เหมาะกับเดโมลูกค้าหรือถ่ายภาพหน้าจอ ตัวจำลองในเว็บสร้างข้อมูลย้อนหลังให้ครบ ทั้ง trend รายงาน พลังงาน และประวัติ alarm

Git Bash:

```bash
cd pdm-app
NEXT_PUBLIC_HVAC_SOURCE=sim npm run dev
```

PowerShell:

```powershell
cd pdm-app
$env:NEXT_PUBLIC_HVAC_SOURCE = "sim"; npm run dev
```

ค่าที่ตั้งในคำสั่งมีผลเหนือ `.env.local` จึงไม่ต้องแก้ไฟล์ ถ้าจะกลับไปใช้ข้อมูลจริง ให้กด Ctrl+C แล้วสั่ง `npm run dev` ใหม่ (ใน PowerShell ให้เปิด terminal ใหม่ เพราะค่า `$env:` ค้างอยู่จนกว่าจะปิดหน้าต่าง)

สิ่งที่มีเฉพาะโหมดนี้:

- **ปุ่ม "เดโม" มุมขวาบน:** เลือก "ขาดการเชื่อมต่อ" เพื่อดูหน้าจอตอนตัวควบคุมหลุด และเลือก "ข้อมูลสด" เพื่อกลับเป็นปกติ
- **ส่วนอื่นที่เห็นเฉพาะโหมดนี้:** แผงคาดการณ์ PdM, ช่องโลโก้ และลิงก์ไปแอป `/app` (โหมดข้อมูลจริงซ่อนไว้ เพราะยังเป็นข้อมูลตัวอย่าง)
- **ผังโรงงาน:** เป็นชุดเดียวกับโปรเจค `hq-chiller` คือ chiller 3 เครื่อง ปั๊ม 2 ตัว AHU/OAU และมิเตอร์

## แบบที่ 3: ทดสอบในเครื่องโดยไม่ผ่าน EMQX

ใช้ broker ในเครื่องแทน EMQX เหมาะเมื่อต้องการทดสอบบ่อย ๆ หรือส่งข้อมูลถี่โดยไม่เปลืองโควตาฟรีของ EMQX (1 GB ต่อเดือน)

- **ข้อมูลยังไปที่ฐานข้อมูลชุดเดิม:** ingestion ยังเขียนลง TimescaleDB และ Firestore ชุดเดียวกับแบบที่ 1 เว็บจึงแสดงผลเหมือนเดิม
- **broker ในเครื่องเก็บข้อความในหน่วยความจำเท่านั้น:** ปิด broker แล้วข้อความที่ค้างอยู่จะหาย

เปิด 3 terminal ตามลำดับนี้

**1. Broker**

```bash
cd services/virtual-plc
npm run broker
```

**2. Ingestion** ชี้ไปที่ broker ในเครื่อง

Git Bash:

```bash
cd services/ingest
MQTT_URL=mqtt://127.0.0.1:1883 npm start
```

PowerShell:

```powershell
cd services/ingest
$env:MQTT_URL = "mqtt://127.0.0.1:1883"; npm start
```

**3. Virtual PLC** ชี้ไปที่ broker ในเครื่องเช่นกัน (ส่งถี่ได้ เช่นทุก 10 วินาที)

Git Bash:

```bash
cd services/virtual-plc
MQTT_URL=mqtt://127.0.0.1:1883 npm start -- --interval 10
```

PowerShell:

```powershell
cd services/virtual-plc
$env:MQTT_URL = "mqtt://127.0.0.1:1883"; npm.cmd start -- --interval 10
```

ถ้าต้องการดูข้อความด้วย ให้เปิด `npm run tap` อีก terminal โดยตั้ง `MQTT_URL` แบบเดียวกัน

## ตัวเลือกของ Virtual PLC

สั่งจากโฟลเดอร์ `services/virtual-plc`

| คำสั่ง | ผล |
|---|---|
| `npm start` | PLC ทุกตัวใน `fleet.example.json` ส่งข้อมูลตามรอบของตัวเอง (60 หรือ 300 วินาที) |
| `npm start -- --once` | ส่งรอบเดียวแล้วจบ ใช้ทดสอบเร็ว ๆ ว่าทั้งเส้นทางทำงาน |
| `npm start -- --once --print` | ส่งรอบเดียวและพิมพ์ payload ทั้งหมด ใช้เป็นตัวอย่างตอนเขียนโปรแกรม PLC จริง |
| `npm start -- --interval 10` | บังคับทุก PLC ให้ส่งทุก 10 วินาที |
| `npm start -- --fleet fleet.json` | ใช้ไฟล์ fleet ของตัวเอง (`fleet.json` ไม่ถูก commit) รูปแบบไฟล์ดู [`services/virtual-plc/README.md`](services/virtual-plc/README.md) |

**ระวังโควตาของ EMQX:** อย่ารัน `--interval` สั้น ๆ ค้างไว้กับ EMQX เพราะ `--interval 5` ใช้ข้อมูลมากกว่ารอบปกติ 12 เท่า ถ้าต้องการส่งถี่ให้ใช้แบบที่ 3

## เหตุการณ์ที่ตัวจำลองสร้างให้

ตัวจำลองใส่ความผิดปกติแบบหน้างานจริงเพื่อทดสอบ alarm และหน้าจอ เหตุการณ์ตามสคริปต์เกิดวันละ 0 ถึง 2 ครั้ง สุ่มแบบคงที่ตามวัน

- **ชื่ออุปกรณ์ในตารางเป็นของ `hq-chiller`:** โปรเจคนี้เกิดเหตุการณ์เวลาเดียวกับเว็บโหมดจำลอง
- **PLC ของ `factory-b`:** ถูกเลื่อนเวลาไป จึงเกิดเหตุการณ์คนละเวลา

| เหตุการณ์ | สิ่งที่ PLC จำลองส่ง | เว็บโหมดข้อมูลจริง | เว็บโหมดจำลอง |
|---|---|---|---|
| Compressor ของ chiller ขัดข้อง (20 ถึง 90 นาที) | `fault` = 1 และ `fault1` bit 14 | chiller ขึ้น FAULT และมี alarm ชื่อตามรุ่น Carrier | FAULT และ alarm |
| ปั๊ม CHP-1 trip (12 ถึง 47 นาที) | `fault` = 1 | ปั๊มขึ้น FAULT แต่ยังไม่มี alarm | FAULT และ alarm |
| ตู้ควบคุม CP-1 ขาดการสื่อสาร (3 ถึง 15 นาที) | ตู้อยู่ใน `errors` (timeout) | ตู้ขึ้น OFFLINE และมี alarm การสื่อสาร | OFFLINE และ alarm |
| ไส้กรอง AHU-3 ตัน (จันทร์ 08:00 ถึงอาทิตย์ 18:00) | `filter` = 1 | ยังไม่แสดง | alarm |
| อุปกรณ์ไม่ตอบ 1% ของรอบ | อุปกรณ์อยู่ใน `errors` | ขึ้น "ไม่ตอบสนอง" และมี alarm การสื่อสารชั่วคราว | ไม่มี |
| อ่านค่าไม่ได้ 0.2% ของค่า | ค่านั้นเป็น `null` | หน้าจอคงค่าล่าสุดที่อ่านได้ | ไม่มี |
| ปิด Virtual PLC | EMQX ส่ง status `offline` แทน (Last Will) | มี alarm การสื่อสารของ PLC ทันที และขึ้นแถบเตือน "ขาดการเชื่อมต่อกับตัวควบคุมของ Chiller Plant" เมื่อไม่มีข้อมูลใหม่เกิน 2.5 รอบ | ใช้ปุ่ม "เดโม" แทน |

alarm จากค่าเกินเกณฑ์ เช่น น้ำเย็นขาออกสูงหรือความชื้นสูง ตอนนี้มีเฉพาะโหมดจำลอง ส่วนโหมดข้อมูลจริงจะย้ายไปคำนวณใน ingestion ภายหลัง

## ตัวตรวจข้อความ (tap)

สั่งจากโฟลเดอร์ `services/virtual-plc` ใช้ตรวจทั้ง PLC จำลองและ PLC จริงตอน commissioning (รายละเอียดใน [`TELEMETRY.md`](TELEMETRY.md) หัวข้อ 11)

| คำสั่ง | ผล |
|---|---|
| `npm run tap` | แสดงสรุปทุกข้อความ และเตือนเมื่อผิดสเปก, seq ขาดหาย หรือมี point ที่ไม่รู้จัก |
| `npm run tap -- --print` | พิมพ์ payload เต็มของทุกข้อความ |
| `npm run tap -- --topic "pdm/v1/hq-chiller/#"` | ดูเฉพาะโปรเจคเดียว |

## ดูข้อมูลที่เก็บแล้ว

- **ทะเบียนอุปกรณ์ของโปรเจค:** จากโฟลเดอร์ `services/ingest` สั่ง `npm run registry -- --project hq-chiller`
- **ตั้งทะเบียนใหม่จากไฟล์ fleet:** สั่ง `npm run registry -- --fleet ../virtual-plc/fleet.example.json` หน้าเว็บจะวาดผังใหม่ทันที
- **ค่าล่าสุดและ alarm ที่ยังเกิดอยู่:** Firebase console → Firestore → `projects`
- **ประวัติทั้งหมด:** Tiger Cloud console → service `pdm-dev` → SQL editor เช่น `SELECT * FROM alarms ORDER BY started_at DESC LIMIT 20;`

## ปิดโปรแกรม

กด **Ctrl+C** ใน terminal ของแต่ละโปรแกรม แนะนำให้ปิดตามลำดับ Virtual PLC → Ingestion → เว็บ

ถ้าปิดหน้าต่าง terminal ไปโดยไม่กด Ctrl+C บางครั้งโปรเซส node จะค้างอยู่เบื้องหลัง อาการที่เห็นคือข้อมูลยังไหลเข้า หรือเปิดเว็บใหม่แล้วพอร์ต 3000 ถูกใช้อยู่ ให้หาและปิดเฉพาะตัวที่ค้างใน PowerShell:

```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId, CommandLine | Format-List
```

ดูจาก `CommandLine` ว่าตัวไหนเป็นของโปรเจคนี้ (`virtual-plc.ts`, `main.ts`, `next dev`) แล้วปิดทีละตัวด้วยหมายเลข ProcessId:

```powershell
Stop-Process -Id 12345
```

อย่าปิด node ทุกตัวด้วยชื่อ เพราะโปรแกรมอื่นในเครื่องอาจใช้ node อยู่ด้วย

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| ingestion ขึ้น `DATABASE_URL is not set` | ไม่มีไฟล์ `services/ingest/.env` หรือยังไม่ได้กรอก |
| ingestion ขึ้น certificate error ตอนต่อฐานข้อมูล | สั่ง `npm run fetch-ca` ใน `services/ingest` เพื่อดึง CA ใหม่ |
| ingestion หรือ API ของเว็บขึ้น error เรื่อง credentials ของ Google | สั่ง `gcloud auth application-default login` |
| PLC จำลองหรือ ingestion ต่อ EMQX ไม่ได้ (ขึ้น `Connection refused`) | ตรวจ username และ password ใน `.env` เทียบกับ EMQX → Access Control |
| หน้า `/hvac` ขึ้น "บัญชีนี้ยังไม่ได้รับสิทธิ์ดูโรงงานใด" | ให้สิทธิ์ด้วย `npm run access` (ดู [`DEPLOY.md`](DEPLOY.md)) แล้วกด "ตรวจอีกครั้ง" |
| หน้า `/hvac` ขึ้นแถบ "ขาดการเชื่อมต่อกับตัวควบคุมของ Chiller Plant" | Virtual PLC หรือ ingestion ไม่ได้รันอยู่ |
| หน้า `/hvac` ขึ้น "โปรเจคนี้ยังไม่ได้ลงทะเบียนอุปกรณ์" | ตั้งทะเบียนด้วย `npm run registry` (ดูหัวข้อ "ดูข้อมูลที่เก็บแล้ว") |
| trend หรือประวัติ alarm ขึ้น "โหลดข้อมูลนี้ไม่สำเร็จ" หรือรายงานและพลังงานไม่ขึ้น | `pdm-app/.env.local` ไม่มี `DATABASE_URL` หรือฐานข้อมูลไม่ตอบ |
| `npm run dev` แจ้งว่าพอร์ต 3000 ถูกใช้อยู่ | มีเว็บตัวเก่ารันค้างอยู่ ปิดตามหัวข้อ "ปิดโปรแกรม" |
