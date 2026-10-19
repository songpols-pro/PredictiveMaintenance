# Virtual PLC และเครื่องมือ MQTT

PLC จำลองที่ส่งข้อมูลตามสเปก [`TELEMETRY.md`](../../TELEMETRY.md) ใช้พัฒนาและทดสอบฝั่งคลาวด์กับเว็บได้ก่อนที่ฮาร์ดแวร์จะติดตั้งเสร็จ และใช้ตรวจข้อความจาก PLC จริงตอน commissioning

ค่าที่ส่งมาจากตัวจำลองชุดเดียวกับหน้า `/hvac` ของเว็บ (`pdm-app/src/lib/hvac/sim.ts`) จึงมีความสัมพันธ์ทางฟิสิกส์ครบ เช่น chiller ที่เดินมีโหลด มิเตอร์รวมเท่ากับกำลังของเครื่อง และ fault/filter เกิดตามสคริปต์

| คำสั่ง | หน้าที่ |
|---|---|
| `npm run broker` | MQTT broker ในเครื่อง (`mqtt://127.0.0.1:1883`, MQTT 3.1.1) ไม่ต้องมี Docker หรือบัญชี cloud บังคับสิทธิ์แบบเดียวกับ production คือ PLC ส่งได้เฉพาะ topic ของตัวเอง |
| `npm start` | PLC จำลองทุกตัวใน `fleet.example.json` ส่งข้อมูลตามรอบของแต่ละตัว |
| `npm start -- --interval 10` | บังคับรอบเป็น 10 วินาทีเพื่อทดสอบเร็ว ๆ (production ใช้ 60 วินาทีขึ้นไป) |
| `npm start -- --once --print` | ส่งหนึ่งรอบ พิมพ์ payload ทั้งหมดออกมา แล้วจบ ใช้ดูเป็นตัวอย่างตอนเขียนโปรแกรม PLC |
| `npm start -- --fleet fleet.json` | ใช้ไฟล์ fleet ของตัวเอง (`fleet.json` ไม่ถูก commit) |
| `npm run tap` | ตัวตรวจ: subscribe `pdm/v1/#` แล้วตรวจทุกข้อความตามสเปก |
| `npm run typecheck` | ตรวจ TypeScript |

## เริ่มใช้ในเครื่อง

ติดตั้งครั้งแรก:

```bash
npm install
```

แล้วเปิด 3 terminal ที่โฟลเดอร์นี้ เรียงตามลำดับ:

```bash
npm run broker
```

```bash
npm run tap
```

```bash
npm start
```

## ไฟล์ fleet

ไฟล์ fleet เขียนว่ามีโปรเจคไหน แต่ละโปรเจคมี PLC กี่ตัว และ PLC แต่ละตัวต่ออุปกรณ์อะไรบ้าง ไม่มีการกำหนดจำนวนตายตัว

ตัวอย่าง `fleet.example.json` มี 2 โปรเจค:

- `hq-chiller`: PLC 1 ตัว ต่ออุปกรณ์ 14 ตัว ชุดเดียวกับหน้า `/hvac`
- `factory-b`: PLC 2 ตัว ตัวแรกส่งทุก 1 นาที ตัวที่สองส่งทุก 5 นาที รวมอุปกรณ์ 20 ตัว

ไฟล์ `fleet.demo-plant.json` คือโรงงานใหม่ `demo-plant` ที่ยังไม่ได้ตั้งทะเบียน (PLC 1 ตัว อุปกรณ์ 9 ตัว มีแค่รหัสกับประเภทเหมือน PLC จริง) ใช้ซ้อมตาม [`NEW-PLANT.md`](../../NEW-PLANT.md) ส่วน F

```json
{
  "projects": [
    {
      "id": "factory-b",
      "gateways": [
        { "id": "plc-01", "interval": 60, "devices": [ { "id": "CH-1", "kind": "chiller" }, { "id": "CHP-1", "kind": "pump" } ] }
      ]
    }
  ]
}
```

- **ใช้เป็นทะเบียนอุปกรณ์ได้ด้วย:** ฟิลด์ `name`, `label`, `profile`, `capacityTon`, `meterFor` และ `role` ของแต่ละอุปกรณ์ PLC จำลองไม่ได้ใช้ แต่ `npm run registry -- --fleet ...` ใน `services/ingest` ใช้ตั้งทะเบียนอุปกรณ์ที่หน้าเว็บใช้วาดผัง
- **`name` และ `ownerLogo` (ไม่บังคับ) ของโปรเจค:** ชื่อโรงงานและโลโก้เจ้าของที่ลูกค้าเห็นในหน้าเว็บ ไปลงทะเบียนพร้อมกันเมื่อสั่ง `npm run registry -- --fleet ...`
- `kind` เลือกได้จาก `chiller`, `pump`, `ahu`, `oau`, `meter`, `panel` ([`catalog.ts`](../../pdm-app/src/lib/telemetry/catalog.ts))
- `simShiftMinutes` (ไม่บังคับ) เลื่อนเวลาของตัวจำลอง เพื่อให้ PLC แต่ละตัวได้ค่าไม่เหมือนกัน ถ้าไม่ใส่ ระบบสุ่มให้คงที่ตามชื่อ

ตัวจำลองใส่ความผิดปกติเล็กน้อยเหมือนหน้างานจริง:

- อุปกรณ์ไม่ตอบ 1% ของรอบ ซึ่งจะไปอยู่ใน `errors`
- อ่านค่าไม่ได้บาง point (`null`)
- ตู้ควบคุมขาดการสื่อสารตามสคริปต์

## ต่อกับ EMQX Cloud

1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ URL (`mqtts://...:8883`) และ username/password สองชุด ทั้ง `npm start` และ `npm run tap` จะอ่านไฟล์นี้เอง
   - **ชุดแรก (`MQTT_USERNAME`) สำหรับ PLC จำลอง:** ส่งได้อย่างเดียว
   - **ชุดที่สอง (`MQTT_TAP_USERNAME`) สำหรับตัวตรวจ:** รับได้อย่างเดียว
3. ถ้าจะกลับไปใช้ broker ในเครื่อง ให้เว้น `MQTT_URL` ว่างไว้

ตั้งสิทธิ์ใน EMQX ที่ **Access Control → Authorization** ตามนี้ เพราะค่าเริ่มต้นของ EMQX Serverless อนุญาตทุก topic

| แท็บ | ผู้ใช้ | Topic | Action | Permission |
|---|---|---|---|---|
| All Users | (ทุกคน) | `#` | Publish & Subscribe | Deny |
| Username | `virtual-plc` | `pdm/v1/#` | Publish | Allow |
| Username | `ingest` | `pdm/v1/#` | Subscribe | Allow |

กฎของ Username ถูกตรวจก่อนกฎของ All Users จึงทำให้ระบบอนุญาตเฉพาะสิ่งที่ระบุไว้

ใน production PLC แต่ละตัวต้องมี username ของตัวเอง ที่ส่งได้เฉพาะ `pdm/v1/{project}/{gateway}/#` ของตัวเอง ส่วน PLC จำลองใช้ username ชุดเดียวร่วมกันเพื่อความสะดวกตอนทดสอบ

**ข้อควรระวัง:** อย่ารัน `--interval 5` ค้างไว้กับ cloud เพราะใช้ข้อมูลมากกว่ารอบปกติ 12 เท่า และโควตาฟรีมีแค่ 1 GB/เดือน

## หมายเหตุบน Windows

ปิดโปรแกรมด้วย Ctrl+C ใน terminal นั้น ถ้าปิดด้วยวิธีอื่นแล้วยังเห็นข้อมูลไหลเข้า (ดูจากตัวตรวจ) แปลว่ามีโปรเซส node ค้างอยู่ ให้ปิดใน Task Manager
