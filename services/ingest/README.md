# Ingestion service (MQTT → TimescaleDB + Firestore)

รับข้อความจาก MQTT broker (EMQX) ตรวจตามสเปก [`TELEMETRY.md`](../../TELEMETRY.md) แล้วบันทึกลง 2 ที่:
- **TimescaleDB (Tiger Cloud):** ประวัติทั้งหมดและ alarm ถือเป็นข้อมูลหลัก
- **Firestore:** ค่าล่าสุด สถานะ PLC และ alarm ที่ยังเกิดอยู่ ให้หน้าเว็บ subscribe แบบ real-time

```
PLC ──MQTT──▶ EMQX ──(persistent session, QoS 1)──▶ ingest ──1 คำสั่ง SQL ต่อข้อความ──▶ TimescaleDB (หลัก)
                                                       └──1 batch ต่อข้อความ──▶ Firestore (สำหรับแสดงผล)
```

## รับประกันว่าข้อมูลไม่หาย

- **broker เก็บข้อความไว้ให้ตอน service ปิด:** ใช้ session แบบถาวร (`clean: false`) กับ client id ที่ตายตัว พอเปิด service กลับมา broker จะส่งข้อความที่ค้างไว้ให้ (ทดสอบแล้ว ระหว่างปิดอยู่ 1 นาที ข้อมูลกลับมาครบ)
- **ตอบรับ (ack) หลังบันทึกเสร็จเท่านั้น:** ถ้า service ล่มกลางทาง หรือฐานข้อมูลใช้ไม่ได้ broker จะส่งข้อความนั้นซ้ำ
- **ข้อความซ้ำถูกบันทึกครั้งเดียว:** ตารางมี unique key ข้อความที่ broker ส่งซ้ำ (QoS 1) หรือ PLC ส่งซ้ำจาก buffer จึงไม่ซ้ำในฐานข้อมูล
- **ข้อความที่ผิดสเปก:** บันทึกเหตุผลลง log แล้วตอบรับ เพราะส่งซ้ำกี่ครั้งก็ไม่ผ่าน
- **ฐานข้อมูลใช้ไม่ได้ชั่วคราว:** ลองใหม่ 3 ครั้ง (1, 2 และ 4 วินาที) ถ้ายังไม่ได้ ระบบจะไม่ตอบรับ และ broker จะส่งใหม่หลังเชื่อมต่อใหม่
- **ข้อมูลที่ฐานข้อมูลปฏิเสธเอง** (เช่น ค่าผิดชนิด): บันทึกลง log แล้วข้ามไป

## คำสั่ง

| คำสั่ง | หน้าที่ |
|---|---|
| `npm install` | ติดตั้งครั้งแรก |
| `npm run migrate` | สร้างหรืออัปเดตตารางและนโยบาย รันซ้ำได้ ไม่กระทบข้อมูลเดิม (`npm start` รันให้เองทุกครั้งที่เริ่ม) |
| `npm start` | เริ่ม service และเปิด health check ที่ `http://localhost:8090/healthz` |
| `npm run registry -- --file <project.json>` หรือ `--fleet <fleet.json>` | ตั้ง**ทะเบียนอุปกรณ์**ของโปรเจค (ดูหัวข้อด้านล่าง) ใช้ `--project <p>` เพื่อดูทะเบียนปัจจุบัน |
| `npm run set-profile -- --project <p> --device "CH-*" --profile carrier-30ram` | กำหนดว่าอุปกรณ์รุ่นไหน เพื่อให้ระบบแปลง fault word เป็น alarm ได้ ใช้ `--profile none` เพื่อยกเลิก หรือไม่ใส่ `--profile` เพื่อดูรายการ (อุปกรณ์มีในฐานข้อมูลหลังตั้งทะเบียนหรือส่งข้อมูลครั้งแรก) รุ่นที่ใช้ได้มาจากฐานข้อมูล ดูหรือเพิ่มได้ที่หน้าเว็บแท็บรุ่นอุปกรณ์ |
| `npm run org -- --org <ลูกค้า> --name "<ชื่อ>"` | สร้างหรือเปลี่ยนชื่อ**ลูกค้า** ใช้ `--project <p>` ผูกโปรเจคกับลูกค้า, `--remove <p>` ถอนออก, `--delete` ลบลูกค้าที่ว่างแล้ว ไม่ใส่ตัวเลือกเพื่อดูโปรเจคและบัญชีของลูกค้า หรือไม่ใส่ `--org` เพื่อดูลูกค้าทั้งหมด (ดูหัวข้อ "สิทธิ์ของผู้ใช้หน้าเว็บ") ทำบนหน้าเว็บ `/hvac/admin` ได้เช่นกัน |
| `npm run access -- --email <อีเมล> --org <ลูกค้า>` | ให้บัญชีหน้าเว็บสังกัดลูกค้า เห็นทุกโปรเจคของลูกค้านั้น (custom claim ที่ `firestore.rules` และ `/api/hvac/*` ตรวจ) ใช้ `--remove-org` เพื่อถอน, `--project <p>`/`--remove <p>` สำหรับสิทธิ์รายโปรเจคแบบยกเว้น, `--admin yes` ให้เห็นทุกโปรเจค, `--list` ดูทุกบัญชีที่มีสิทธิ์, `--create` สร้างบัญชีใหม่ (ยังไม่มีรหัสผ่าน), `--reset-link` พิมพ์ลิงก์ตั้งรหัสผ่าน, `--disabled yes` หรือ `no` ปิดหรือเปิดใช้บัญชี ทำบนหน้าเว็บ `/hvac/admin` ได้เช่นกัน |
| `npm run fetch-ca` | ดึง CA ของฐานข้อมูลมาเก็บใหม่ ใช้เมื่อเชื่อมต่อแล้วขึ้น certificate error (CA ปัจจุบันหมดอายุ ต.ค. 2027) |
| `npm run typecheck` | ตรวจ TypeScript |

ทดสอบทั้งระบบในเครื่อง: เปิด `npm start` ที่นี่ แล้วรัน PLC จำลองอีก terminal

```bash
cd ../virtual-plc && npm start -- --once
```

## ตั้งค่า (`.env`, ดู `.env.example`)

| ตัวแปร | ความหมาย |
|---|---|
| `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | broker และผู้ใช้ที่ subscribe ได้อย่างเดียว (`ingest`) |
| `MQTT_CLIENT_ID` | **ใช้ 1 ค่าต่อ 1 สภาพแวดล้อม** เช่น `pdm-ingest-local` บนเครื่องนี้ และ `pdm-ingest` บน Cloud Run ถ้ารันสองตัวด้วย id เดียวกัน broker จะสลับ session ไปมาระหว่างสองตัว |
| `DATABASE_URL` | connection string ของ Tiger Cloud |
| `DB_CA_FILE` | CA ของฐานข้อมูล ค่าเริ่มต้นคือ `certs/tiger-ca.pem` ถ้าฐานข้อมูลใช้ CA สาธารณะ ให้ตั้งเป็น `system` |
| `COMPRESS_AFTER` | บีบอัดข้อมูลที่เก่ากว่านี้ ค่าเริ่มต้น `7 days` ช่วงพัฒนาใช้ `1 day` เพื่อประหยัดพื้นที่ |
| `RETENTION` | ลบข้อมูลที่เก่ากว่านี้ ปล่อยว่างคือเก็บตลอด ช่วงพัฒนาใช้ `30 days` เพราะ service ฟรีมีพื้นที่ 750 MB |
| `FIREBASE_PROJECT_ID` | Firebase project ที่จะเขียน live view (`pdm-app-87193`) ปล่อยว่างคือปิด live view แล้วเก็บแค่ประวัติ สิทธิ์ใช้ Application Default Credentials: บนเครื่องนี้มาจาก `gcloud auth application-default login` บน Cloud Run มาจาก service account ของ service |
| `NOTIFY_EMAIL` | `on` เปิดตัวส่งอีเมลแจ้งเตือน alarm (`src/notify.ts`): เขียนอีเมลลง Firestore `mail` ให้ extension "Trigger Email from Firestore" ส่ง สำหรับโรงงานที่เปิดไว้ในหน้า `/hvac/admin` ต้องมี `FIREBASE_PROJECT_ID` ด้วย เปิดใน ingestion ตัวที่รันตลอดเวลาตัวเดียว (ค่าเริ่มต้นปิด) |
| `NOTIFY_SITE_URL` | ที่อยู่เว็บสำหรับลิงก์ "เปิดหน้า Alarm" ในอีเมล เช่น `https://pop--pdm-app-87193.asia-southeast1.hosted.app` ปล่อยว่างคือไม่ใส่ลิงก์ |
| `PORT` | พอร์ต health check (Cloud Run กำหนดให้เอง) |

## ข้อมูลในฐานข้อมูล

| ตาราง | เก็บอะไร |
|---|---|
| `telemetry` | 1 แถวต่อ 1 point ต่อ 1 รอบ (`ts, project, device, point, value`) เป็น hypertable ที่ถูกบีบอัดอัตโนมัติ |
| `telemetry_1h` | ค่าเฉลี่ย/ต่ำสุด/สูงสุด/ล่าสุดรายชั่วโมง (continuous aggregate) ใช้กับกราฟช่วงยาวและรายงาน รวมข้อมูลชั่วโมงล่าสุดให้อัตโนมัติ |
| `events` | การเปลี่ยนสถานะจากช่อง event และ point ที่ระบบสร้างเอง: `_online` (PLC ออนไลน์/ออฟไลน์), `_comm` (อุปกรณ์หยุดหรือกลับมาตอบ Modbus) |
| `devices` | อุปกรณ์ทุกตัวที่เคยเห็นหรือตั้งทะเบียนแล้ว: PLC ที่ต่ออยู่, รุ่น (`profile`), ค่า Modbus ของเครื่อง (`modbus`, ตั้งบนหน้าเว็บ), เวลาที่อ่านค่าได้ล่าสุด, สถานะการสื่อสาร, ข้อผิดพลาดล่าสุด |
| `gateways` | PLC ทุกตัว: สถานะ online, เวอร์ชันโปรแกรม, รอบการส่ง, รอบล่าสุด, seq ล่าสุด |
| `alarms` | fault แต่ละครั้ง: อุปกรณ์, รหัส (เช่น `overload1`), ระดับ (`critical`/`warning`), เวลาเริ่ม `started_at`, เวลาหาย `ended_at` (ว่าง = ยังเกิดอยู่) และช่องรับทราบ `acked_at`/`acked_by` สำหรับหน้าเว็บ |
| `profiles` | รุ่นอุปกรณ์และ register map ของรุ่น (`spec`) แก้ที่หน้าเว็บ `/hvac/admin` แท็บรุ่นอุปกรณ์ |
| `fault_bits` | ความหมายของแต่ละ bit ตามรุ่น (ชื่อไทย/อังกฤษ) แก้พร้อมรุ่นบนหน้าเว็บ มีผลกับ alarm ถัดไปทันที รุ่นใน `pdm-app/src/lib/telemetry/profiles/` ถูกคัดลอกเข้ามาตอน migrate เฉพาะเมื่อยังไม่มีรุ่นนั้น ไม่เขียนทับสิ่งที่แก้บนหน้าเว็บ |
| `fault_words` | ค่าล่าสุดของ fault word แต่ละตัวพร้อมเวลา |

ระบบเขียนข้อมูลผ่านฟังก์ชัน `ingest_telemetry`, `ingest_event` และ `ingest_status` ทำให้ 1 ข้อความใช้ 1 รอบรับส่งกับฐานข้อมูล และอยู่ใน transaction เดียว

### Alarm จาก fault word

ระบบแปลง alarm ภายในคำสั่งเดียวกับที่บันทึกข้อความ ไม่เพิ่มรอบรับส่งกับฐานข้อมูล

- **เปิด alarm:** เมื่อ bit ใน fault word ถูกตั้ง โดยใช้เวลาจากข้อความ ไม่ใช่เวลาที่ได้รับ
- **ปิด alarm:** เมื่อได้ค่า word ที่ bit นั้นหายไปแล้ว
- **เกิดซ้ำ:** fault เดิมที่เกิดอีกครั้งจะได้แถวใหม่
- **ส่งผ่านช่อง event ได้:** PLC ส่ง fault word ที่เปลี่ยนผ่านช่อง event ทันที alarm จึงขึ้นภายในไม่กี่วินาที ไม่ต้องรอรอบ 1 นาที
- **ข้อมูลเก่าไม่ทำให้สถานะผิด:** ข้อความที่เก่ากว่าค่าที่บันทึกไว้ (ส่งย้อนหลังจาก buffer หรือส่งซ้ำ) ไม่เปิดหรือปิด alarm
- **อุปกรณ์ไม่ตอบ:** alarm คงสถานะเดิม เพราะยังไม่รู้ค่าจริง
- **bit ที่ไม่มีในเอกสาร:** ถ้า bit นั้นถูกตั้ง ระบบสร้าง alarm `<word>_bit<n>` ระดับ warning ให้ ไม่ให้ fault ที่ไม่รู้จักหลุดไป
- **ต้องกำหนด profile ก่อน:** อุปกรณ์ที่ยังไม่มี profile จะไม่ถูกแปลง เลือกรุ่นในรายการอุปกรณ์ของโรงงานบนหน้าเว็บ หรือใช้ `npm run set-profile`

```sql
-- Alarm ที่ยังเกิดอยู่ พร้อมชื่อภาษาไทย
SELECT a.device, a.code, a.severity, a.started_at, COALESCE(b.th, a.code) AS name
FROM alarms a LEFT JOIN fault_bits b USING (profile, word, bit)
WHERE a.project = 'hq-chiller' AND a.ended_at IS NULL
ORDER BY a.severity, a.started_at;
```

ตัวอย่าง query สำหรับหน้าเว็บ:

```sql
-- กราฟ 24 ชั่วโมงล่าสุด เฉลี่ยทุก 15 นาที
SELECT time_bucket('15 minutes', ts) AS t, avg(value) AS value
FROM telemetry
WHERE project = 'hq-chiller' AND device = 'CH-2' AND point = 'chwOut' AND ts > now() - INTERVAL '24 hours'
GROUP BY t ORDER BY t;

-- 30 วัน รายชั่วโมง (จากตารางสรุป)
SELECT bucket, avg, min, max FROM telemetry_1h
WHERE project = 'hq-chiller' AND device = 'CH-2' AND point = 'kw' AND bucket > now() - INTERVAL '30 days'
ORDER BY bucket;

-- PLC ที่เงียบเกิน 2.5 เท่าของรอบการส่ง
SELECT project, gateway, state, last_seen FROM gateways
WHERE last_seen < now() - make_interval(secs => 2.5 * interval_s);
```

## ทะเบียนอุปกรณ์ของโปรเจค

หน้า `/hvac` วาดผังจากทะเบียนอุปกรณ์ของแต่ละโปรเจค ไม่ได้ใช้รายชื่อตายตัว ทะเบียนเก็บ 2 ที่:
- **Firestore `projects/{project}`:** ชื่อโรงงานและโลโก้เจ้าของที่ลูกค้าเห็น กับประเภท ชื่อ และลำดับของแต่ละอุปกรณ์ ให้หน้าเว็บใช้วาดผัง
- **TimescaleDB `devices.profile`:** รุ่นของอุปกรณ์ ใช้แปลง fault เป็น alarm

ตั้งได้ 2 ทาง ซึ่งใช้โค้ดตรวจและบันทึกชุดเดียวกัน (`pdm-app/src/lib/access/registry.ts` และ `saveRegistry` ใน `admin.ts`):
- **หน้าเว็บ `/hvac/admin` แท็บโรงงาน** (ผู้ดูแลระบบที่มี claim `admin`): เพิ่มโรงงานและแก้อุปกรณ์ในตาราง นำเข้าและส่งออกไฟล์ JSON รูปแบบเดียวกับด้านล่างได้ ดู `DEPLOY.md` หัวข้อ "เพิ่มโปรเจคใหม่"
- **คำสั่ง `npm run registry`** กับไฟล์ JSON ของโปรเจค:

```json
{
  "project": "hq-chiller",
  "name": "HQ chiller plant",
  "ownerLogo": "/hvac/owners/hq.png",
  "devices": [
    { "id": "CH-1", "kind": "chiller", "name": "CHILLER-1", "capacityTon": 120, "profile": "carrier-30ram" },
    { "id": "CHP-1", "kind": "pump", "name": "CHP-1", "role": "duty" },
    { "id": "AHU-1", "kind": "ahu", "name": "AHU-1" },
    { "id": "PM-CH-1", "kind": "meter", "name": "Power Meter-1", "label": "PM-CH-1", "meterFor": "CH-1" },
    { "id": "CP-1", "kind": "panel", "name": "Control Kit" }
  ]
}
```

```bash
npm run registry -- --file hq-chiller.json
```

**รูปแบบข้อมูล**
- **`name` ของโปรเจค:** ชื่อโรงงานที่ลูกค้าเห็นในตัวเลือกโปรเจค ปุ่มบัญชี และบรรทัดสถานะท้ายหน้า ถ้าไม่ใส่จะแสดงรหัสโปรเจคแทน ควรตั้งชื่อที่ลูกค้าแยกออกเมื่อมีหลายโรงงาน
- **`ownerLogo` ของโปรเจค (ไม่บังคับ):** โลโก้เจ้าของที่แสดงบนสุดของเมนูเมื่อเลือกโปรเจคนี้ ใส่ได้ 2 แบบ
  - path ของไฟล์ใน `pdm-app/public` เช่น `/hvac/owners/hq.png` (ไฟล์ต้อง deploy ไปกับเว็บ)
  - URL ที่ขึ้นต้นด้วย `https://`
  - ถ้าไม่ใส่ จะใช้โลโก้กลางของเว็บ (`HVAC_SITE.ownerLogo` ใน `pdm-app/src/lib/hvac/model.ts`) และถ้าไม่มีทั้งสองแบบ จะไม่แสดงช่องโลโก้
- **`kind` ของอุปกรณ์ (ประเภท):** `chiller`, `pump`, `ahu`, `oau`, `meter` หรือ `panel`
- **`profile` (รุ่น):** รหัสของรุ่นอุปกรณ์ในฐานข้อมูล (ตาราง `profiles` ดูได้ที่หน้าเว็บแท็บรุ่นอุปกรณ์ หรือ `npm run set-profile` ที่ไม่ใส่ตัวเลือก) และต้องเป็นรุ่นของอุปกรณ์ประเภทเดียวกัน เช่น `carrier-30ram` ใช้กับ `chiller` เท่านั้น ถ้าฐานข้อมูลยังไม่ได้ migrate คำสั่งจะบอกให้สั่ง `npm run migrate` ก่อน
- **ฟิลด์ของอุปกรณ์ที่ไม่บังคับ:** `name` (ชื่อบนผัง), `label`, `profile`, `capacityTon` (ของ chiller ใช้คำนวณ % โหลด), `meterFor` (มิเตอร์วัด chiller ตัวไหน), `role` (ปั๊ม: duty/standby)
- **ลำดับในไฟล์คือลำดับบนจอ**
- **ขีดจำกัด:** อุปกรณ์ไม่เกิน 500 ตัวต่อโปรเจค, ชื่อโรงงานไม่เกิน 100 ตัวอักษร, `name` ของอุปกรณ์ไม่เกิน 64 และ `label` ไม่เกิน 32 ตัวอักษร

**การทำงาน**
- **ไฟล์แทนที่ทะเบียนเดิมทั้งหมด:** อุปกรณ์ที่ไม่มีในไฟล์จะหายจากผัง แต่ข้อมูลประวัติยังอยู่ `ownerLogo` ที่ไม่ได้ใส่ในไฟล์ก็ถูกลบเช่นกัน หน้าจอที่เปิดอยู่อัปเดตเองทันที รวมถึงชื่อและโลโก้
- **อุปกรณ์ที่ส่งข้อมูลมาแต่ยังไม่อยู่ในทะเบียน:** แสดงในหมวด "อุปกรณ์ที่ยังไม่อยู่ในรายชื่อ" พร้อมค่าดิบ ช่วยตอนติดตั้งหน้างาน ไม่ถูกนับในยอดรวม
- **ใช้กับไฟล์ fleet ได้:** `npm run registry -- --fleet ../virtual-plc/fleet.example.json` ตั้งทะเบียนของโปรเจคจำลองทั้งสอง
- **ลูกค้าเจ้าของโปรเจค (`org`) คงเดิม:** registry เขียนเฉพาะ field ของตัวเอง (`name`, `ownerLogo`, `devices`, `updatedAt`) ลูกค้าตั้งด้วย `npm run org` หรือแท็บลูกค้าบนหน้าเว็บ
- **TimescaleDB ก่อน Firestore:** เขียนรุ่นลง `devices.profile` ก่อน ถ้าฐานข้อมูลใช้งานไม่ได้ จะไม่บันทึกอะไรเลย (คำสั่งขึ้น `Not saved: ...`) อุปกรณ์ที่เอาออกจากทะเบียนยังมีแถวและข้อมูลใน TimescaleDB เหมือนเดิม
- **บันทึกการเปลี่ยนแปลง:** ทุกครั้งที่ทะเบียนเปลี่ยน จะบันทึกลง Firestore `adminLog` ว่าเพิ่ม เอาออก หรือแก้อุปกรณ์ตัวไหน (คำสั่งบันทึกผู้ทำเป็น `<ผู้ใช้ Windows>@<ชื่อเครื่อง>`) ถ้ารันซ้ำด้วยไฟล์เดิมจะไม่เขียนซ้ำและไม่บันทึก
- **ต้อง `npm install` ใน `pdm-app` ด้วย:** คำสั่งใช้โค้ดและ `firebase-admin` จาก `pdm-app`

## สิทธิ์ของผู้ใช้หน้าเว็บ

ลูกค้า 1 รายมีได้หลายโรงงาน (1 โปรเจค = 1 โรงงาน) บัญชีที่สังกัดลูกค้าเห็นทุกโรงงานของลูกค้านั้น รวมถึงโรงงานที่ผูกภายหลัง โดยไม่ต้องแก้บัญชี

| ข้อมูล | ที่เก็บ | ตั้งด้วย |
|---|---|---|
| ลูกค้า | Firestore `orgs/{org}` (`name`) | `npm run org -- --org acme --name "ACME Co., Ltd."` |
| โรงงานเป็นของลูกค้าไหน | Firestore `projects/{project}.org` | `npm run org -- --org acme --project hq-chiller` |
| บัญชีสังกัดลูกค้าไหน | custom claim `orgs` ของบัญชี | `npm run access -- --email <อีเมล> --org acme` |
| สิทธิ์รายโปรเจคแบบยกเว้น เช่น ผู้รับเหมา | custom claim `projects` | `npm run access -- --email <อีเมล> --project hq-chiller` |
| ทีมดูแลระบบ (ทุกโปรเจค) | custom claim `admin` | `npm run access -- --email <อีเมล> --admin yes` |

- **ผูกหรือถอนโรงงานของลูกค้า:** หน้าเว็บของผู้ใช้เห็นทันที (`firestore.rules` อ่านเอกสารโปรเจคทุกครั้ง) ส่วน `/api/hvac/*` เห็นภายใน 1 นาที
- **ให้หรือถอนสิทธิ์บัญชี:** มีผลเมื่อผู้ใช้กด "ตรวจอีกครั้ง" หรือ login ใหม่ หน้าเว็บที่เปิดค้างไว้จะถูกตัดเมื่อ token ต่ออายุ (ไม่เกิน 1 ชั่วโมง)
- **ปิดใช้บัญชี (`--disabled yes`):** login และต่ออายุไม่ได้ `/api/hvac/*` ปฏิเสธทันที ส่วนค่าสดบนหน้าจอที่เปิดค้างไว้ยังอยู่ได้จนกว่า token หมดอายุ (ไม่เกิน 1 ชั่วโมง)
- **หน้าเว็บ `/hvac/admin` และคำสั่งใช้โค้ดชุดเดียวกัน** (`pdm-app/src/lib/access/`) การตรวจจึงเหมือนกันทุกทาง และทุกการเปลี่ยนแปลงถูกบันทึกลง Firestore `adminLog` (คำสั่งบันทึกผู้ทำเป็น `<ผู้ใช้ Windows>@<ชื่อเครื่อง>`) คำสั่ง `org`, `access` และ `registry` จึงต้อง `npm install` ใน `pdm-app` ไว้ด้วย
- **กันพิมพ์ผิด:** `org --project` ต้องมีทะเบียนของโปรเจคก่อน และ `access --org` ต้องมีลูกค้านั้นก่อน ถ้าไม่มี คำสั่งไม่บันทึกอะไร
- **ขนาด claims:** บัญชีหนึ่งรวมกันได้ไม่เกิน 1000 byte `access` แจ้งก่อนบันทึกถ้าเกิน ให้ใช้ลูกค้าแทนการให้รายโปรเจคจำนวนมาก
- **ย้ายบัญชีเดิมที่ให้สิทธิ์รายโปรเจค:** ให้บัญชีสังกัดลูกค้า (`--org`) แล้ว `access` จะบอกว่าโปรเจครายตัวไหนซ้ำกับของลูกค้า ให้ `--remove` ออก (ขั้นตอนเต็มใน `DEPLOY.md`)
- **ทดสอบกับ emulator ได้โดยไม่แตะของจริง:** ดู `DEPLOY.md` หัวข้อ "ทดสอบสิทธิ์ของ `/hvac`"

## Live view ใน Firestore

| เอกสาร | เนื้อหา |
|---|---|
| `projects/{project}` | ชื่อโรงงาน (`name`) โลโก้เจ้าของ (`ownerLogo`) และทะเบียนอุปกรณ์ (`npm run registry` หรือแท็บโรงงานของ `/hvac/admin`) กับลูกค้าเจ้าของ (`org`, `npm run org` หรือแท็บลูกค้า) |
| `orgs/{org}` | ชื่อลูกค้า (`name`, `npm run org`) |
| `projects/{project}/gateways/{gateway}` | 1 เอกสารต่อ PLC: `state`/`stateAt`/`fw` (online), `interval`/`lastTs`/`seq`/`lastSeen` (รอบล่าสุด), `devices.{id}.values.{point}` (ค่าล่าสุด), `devices.{id}.ok`/`error` (อุปกรณ์ตอบหรือไม่), `devices.{id}.changedAt` (event ล่าสุด) |
| `projects/{project}/alarms/{id}` | เฉพาะ alarm ที่ยังเกิดอยู่ พร้อมชื่อไทย/อังกฤษและเวลาเริ่ม (`id` = `alarms.id` ใน TimescaleDB) ระบบลบออกเมื่อ fault หาย |

- **ค่าใช้จ่าย:** 1 ข้อความเขียน 1 batch ใช้ 1 write ต่อ PLC ต่อรอบ บวกกับจำนวน alarm ที่เปลี่ยน
- **ข้อมูลเก่าไม่ทับค่าล่าสุดบนจอ:** รอบที่เก่ากว่าที่มีอยู่ (ส่งย้อนหลังจาก buffer) ไปลงแค่ประวัติ ไม่เขียนทับ Firestore
- **อุปกรณ์ไม่ตอบ:** ขึ้น `ok: false` พร้อมสาเหตุ และยังเก็บค่าล่าสุดที่อ่านได้ไว้
- **ค่าที่อ่านไม่ได้ในรอบนั้น (null):** หน้าจอค้างค่าล่าสุดที่อ่านได้ไว้ ไม่ขึ้นช่องว่าง ส่วน TimescaleDB ยังบันทึก null ตามจริง
- **ถ้า Firestore มีปัญหา:** ระบบบันทึกเหตุลง log แล้วตอบรับข้อความต่อตามปกติ ประวัติไม่หาย
  - ค่าล่าสุดจะถูกต้องอีกครั้งในรอบถัดไป
  - รายการ alarm จะถูกซ่อมให้ตรงกับ TimescaleDB ตอนเริ่มและทุก 10 นาที
- **Browser อ่านได้เฉพาะโปรเจคที่บัญชีมีสิทธิ์** ตาม `pdm-app/firestore.rules` (ดูหัวข้อ "สิทธิ์ของผู้ใช้หน้าเว็บ") และเขียนไม่ได้
- **ก่อนใช้งานจริง ให้ deploy การยกเว้น index ของ `devices`** ซึ่งอยู่ใน `pdm-app/firestore.indexes.json` สั่งด้วย `firebase deploy --only firestore:indexes` จากโฟลเดอร์ `pdm-app`
  - เหตุผล: Firestore จำกัด index ไว้ 40,000 รายการต่อเอกสาร PLC ที่ต่ออุปกรณ์ราว 400 ตัวขึ้นไปจะเขียนไม่ได้ถ้าไม่ยกเว้น

## ความเร็ว

ระบบประมวลผลทีละข้อความตามลำดับ ซึ่งจำเป็นเพื่อให้ตอบรับหลังบันทึกเสร็จ

| ตำแหน่งฐานข้อมูล | เวลาต่อข้อความ | รองรับได้ประมาณ |
|---|---|---|
| Tiger Cloud ฟรี (US East) | ประมาณ 250 ms | 4 ข้อความ/วินาที หรือราว 240 PLC ที่ส่งทุก 1 นาที |
| service แบบเสียเงินที่สิงคโปร์ | ไม่กี่ ms | มากกว่าข้างบนหลายสิบเท่า |

## Deploy บน Cloud Run (ภายหลัง)

ต้องรันค้างไว้ตลอด เพราะต้องต่อ MQTT ค้างไว้:
- `min-instances=1`, `max-instances=1`
- เปิดให้ใช้ CPU ได้ตลอด (CPU always allocated / instance-based billing)
- `MQTT_CLIENT_ID=pdm-ingest`
- เก็บรหัสผ่านใน Secret Manager
- ใช้ service account ของ service ที่มีสิทธิ์แค่ `roles/datastore.user` (เขียน Firestore) ไม่ใช้บัญชี Owner
- ตอน deploy ระบบจะเปิด instance ใหม่ก่อนปิดตัวเก่า ตัวใหม่ใช้ client id เดียวกันจึงรับ session ต่อได้เลย ไม่มีข้อความหาย

## หมายเหตุบน Windows

คำสั่ง `kill` จาก Git Bash ปิดโปรเซสทันทีโดยไม่ผ่านขั้นปิดอย่างนุ่มนวล ไม่เป็นไร เพราะข้อความที่ยังไม่ได้ตอบรับจะถูกส่งซ้ำเมื่อเปิดใหม่ ส่วนบน Cloud Run ระบบส่ง SIGTERM และ service ปิดตัวอย่างถูกต้อง
