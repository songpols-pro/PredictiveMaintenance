# คู่มือ deploy PdM Monitor ขึ้น Firebase

เว็บหน้าบ้าน (`/`) และแอป (`/app`) รันบน **Firebase App Hosting** โดยดึงโค้ดจาก GitHub repo นี้
ทุกครั้งที่ push ขึ้น `main` ระบบจะ build และ deploy ให้อัตโนมัติ

แบบฟอร์มขอเดโมบันทึกลง **Cloud Firestore** ผ่านโค้ดฝั่งเซิร์ฟเวอร์ ส่วน browser เข้าถึงฐานข้อมูลตรงไม่ได้

```
ผู้เข้าชม → ฟอร์มขอเดโม → Server Action (src/lib/leads.ts, ตรวจข้อมูลซ้ำ)
                                   ↓ Firebase Admin SDK (สิทธิ์ของ service account ของ App Hosting)
                        Firestore: demoRequests  (+ mail ถ้าเปิดอีเมลแจ้งทีมขาย)
                                   ↓ (ไม่บังคับ) extension "Trigger Email from Firestore"
                              อีเมลถึงทีมขาย
```

## ไฟล์ที่เกี่ยวข้อง (อยู่ใน `pdm-app/`)

| ไฟล์ | หน้าที่ |
|---|---|
| `apphosting.yaml` | ตั้งค่า Cloud Run: ปิดเครื่องเมื่อไม่มีคนเข้า (`minInstances: 0`), จำกัดสูงสุด 4 instance เพื่อคุมค่าใช้จ่าย, ตัวแปร `LEADS_NOTIFY_EMAIL` (ปิดไว้) |
| `package.json` → `engines.node: "22.x"` | บอก Firebase ให้ใช้ Node.js 22 (ต้องตรงกับ runtime ที่เลือกตอนสร้าง backend) |
| `firestore.rules` | ปิดการอ่าน/เขียนจาก browser ทั้งหมด |
| `firebase.json` | ใช้กับ Firebase CLI: deploy rules และรัน emulator ในเครื่อง |
| `.env.example` | ตัวอย่างค่าสำหรับทดสอบในเครื่อง (บน Firebase ไม่ต้องใช้) |
| `src/lib/leads.ts` | Server Action ที่บันทึกคำขอเดโม |
| `src/lib/firebase-admin.ts` | เชื่อม Firestore (ไม่ต้องใส่ key เมื่อรันบน App Hosting) |
| `src/lib/demo-request.ts` | กฎตรวจข้อมูลฟอร์ม ใช้ร่วมกันทั้ง browser และเซิร์ฟเวอร์ |

## ขั้นที่ 1: สร้าง Firebase project และเปิดแผน Blaze

1. ไปที่ [console.firebase.google.com](https://console.firebase.google.com) → **Create a project**
2. อัปเกรดเป็นแผน **Blaze** (จ่ายตามใช้จริง ต้องผูกบัตร) เพราะ App Hosting ไม่มีในแผนฟรี
3. แนะนำให้ตั้ง **budget alert** ใน Google Cloud console → Billing → Budgets & alerts เพื่อให้ระบบส่งอีเมลเตือนเมื่อค่าใช้จ่ายเกินงบที่ตั้งไว้

## ขั้นที่ 2: สร้าง Firestore

1. **Databases & Storage → Firestore → Create database**
2. Location: **asia-southeast1 (Singapore)** ใกล้ไทยที่สุด *(เปลี่ยนภายหลังไม่ได้ ถ้าเลือกไม่ได้แปลว่า project ถูกกำหนด location ไว้แล้ว)*
3. เลือก **Production mode** ซึ่งปิดการเข้าถึงจาก browser ทั้งหมด ตรงกับ `firestore.rules` อยู่แล้ว

## ขั้นที่ 3: สร้าง App Hosting backend

**Hosting & Serverless → App Hosting → Get started** แล้วตั้งค่าดังนี้:

| คำถาม | ตอบ |
|---|---|
| Region | **asia-southeast1 (Singapore)** |
| GitHub repository | `songpols-pro/PredictiveMaintenance` (ต้องกดติดตั้ง Firebase GitHub app ให้ repo นี้) |
| Root directory | **`/pdm-app`** ← สำคัญ เพราะแอปอยู่ในโฟลเดอร์ย่อย |
| Live branch | `main` |
| Automatic rollouts | เปิด |
| Backend name | เช่น `pdm-monitor` |
| Runtime | **Node.js 22** (ให้ตรงกับ `engines` ใน `package.json`) |
| Firebase web app | สร้างใหม่หรือเลือกที่มีอยู่ |

กด **Finish and deploy** แล้วรอ 5–10 นาที จะได้ URL ประมาณ `https://pdm-monitor--<project-id>.asia-southeast1.hosted.app`

## ขั้นที่ 4: deploy Firestore rules จาก git

ฐานข้อมูลที่สร้างแบบ Production mode ปิดทุกอย่างอยู่แล้ว ขั้นนี้มีไว้ให้ rules บนคลาวด์ตรงกับไฟล์ใน git:

```bash
cd pdm-app
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project <PROJECT_ID>
```

## ขั้นที่ 5 (แนะนำ): ลบข้อมูลอัตโนมัติตามประกาศความเป็นส่วนตัว

ประกาศความเป็นส่วนตัวบนเว็บสัญญาว่าจะเก็บข้อมูลไม่เกิน 12 เดือน แต่ละเอกสารที่ระบบบันทึกจึงมีฟิลด์ `deleteAfter` ติดมาด้วย:
- `demoRequests`: 12 เดือน
- `mail`: 30 วัน

ให้เปิด **TTL policy** เพื่อให้ Firestore ลบเอกสารเองเมื่อถึงวันที่ใน `deleteAfter`:
- **ทาง console:** Google Cloud console → Firestore → **Time-to-live (TTL)** → Create policy เลือก collection group `demoRequests` ฟิลด์ `deleteAfter` แล้วทำซ้ำกับ `mail`
- **ทาง gcloud:**
  ```bash
  gcloud firestore fields ttls update deleteAfter --collection-group=demoRequests --enable-ttl --project <PROJECT_ID>
  ```
  ```bash
  gcloud firestore fields ttls update deleteAfter --collection-group=mail --enable-ttl --project <PROJECT_ID>
  ```

ถ้าผู้ติดต่อกลายเป็นลูกค้า ให้ย้ายข้อมูลไป CRM หรือลบฟิลด์ `deleteAfter` ของเอกสารนั้นออก

## ขั้นที่ 6 (ไม่บังคับ): ส่งอีเมลแจ้งทีมขายทุกครั้งที่มีคำขอ

1. **Extensions → Trigger Email from Firestore → Install**
   - Email documents collection: `mail`
   - SMTP: ใช้บัญชีอีเมลของบริษัท เช่น Google Workspace หรือ SendGrid ตามที่ extension แนะนำ (รหัสผ่านจะถูกเก็บใน Secret Manager)
2. เปิดใช้ `LEADS_NOTIFY_EMAIL` แบบใดแบบหนึ่ง:
   - **ใน `apphosting.yaml`:** เอา comment ออก ใส่อีเมลทีมขาย (หลายคนคั่นด้วย `,`) แล้ว push
   - **ใน console:** App Hosting → backend → Settings → Environment
3. อีเมลที่ได้จะมี Reply-To เป็นอีเมลของลูกค้า กด Reply ตอบได้เลย คำขอที่ระบบสงสัยว่าเป็นบอทจะไม่ส่งอีเมล

## ขั้นที่ 7: ตรวจหลัง deploy

- [ ] เปิด `/` และ `/app` ได้ สลับภาษาไทย/อังกฤษได้
- [ ] ส่งฟอร์มขอเดโม 1 ครั้ง แล้วเห็นเอกสารใหม่ใน Firestore → `demoRequests` (`status: "new"`)
- [ ] (ถ้าเปิดอีเมล) ทีมขายได้รับอีเมล
- [ ] แก้ข้อมูลติดต่อใน `src/lib/site-config.ts` ให้เป็นของจริง (ตอนนี้ยังเป็นค่าตัวอย่าง)

## ขั้นที่ 8: ใช้โดเมนของบริษัท

App Hosting → backend → Settings → **Domains → Add custom domain** แล้วเพิ่ม DNS record ตามที่ระบบบอก ใบรับรอง HTTPS ออกให้อัตโนมัติ

---

## ทดสอบในเครื่องด้วย Firestore emulator

ไม่ต้องมี Firebase project ใช้ได้เลย:

1. สร้าง `pdm-app/.env.local` จาก `.env.example` แล้วเปิด 2 บรรทัดนี้:
   ```
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
   GCLOUD_PROJECT=demo-pdm-monitor
   ```
2. เปิด emulator (เครื่องนี้มี Java 11 ซึ่งใช้ได้กับ `firebase-tools@13` ถ้ามี Java 21 ขึ้นไปใช้ `firebase-tools` รุ่นล่าสุดได้):
   ```bash
   npx firebase-tools@13 emulators:start --only firestore --project demo-pdm-monitor
   ```
3. รัน `npm run dev` แล้วส่งฟอร์มที่ `http://localhost:3000/#demo`

ถ้าไม่มี `.env.local`:
- `npm run dev` ส่งฟอร์ม "สำเร็จ" แต่ไม่บันทึกอะไร (มีไว้ให้ลองหน้าตาเท่านั้น)
- production build ที่ไม่มี Firestore จะขึ้นข้อความ "ส่งคำขอไม่สำเร็จ" แทน เพื่อไม่ให้ข้อมูลลูกค้าหายเงียบๆ

### ทดสอบสิทธิ์ของ `/hvac` (rules, คำสั่งผู้ดูแล และหน้าจอ)

1. **`firestore.rules`:** เปิด emulator ตามข้อ 2 แล้วสั่ง `npm run test:rules` ใน `pdm-app` สคริปต์ (`scripts/test-rules.mjs`) ล้างข้อมูลใน emulator ใส่ข้อมูลตัวอย่าง แล้วตรวจว่าบัญชีแต่ละแบบ (ลูกค้า, หลายลูกค้า, รายโปรเจค, ผู้ดูแล, ไม่ได้ login) อ่านอะไรได้บ้าง รวมถึงว่า browser อ่าน `adminLog` ไม่ได้ ควรขึ้น `all 51 passed`
2. **คำสั่ง `npm run org` และ `npm run access` กับ emulator** (ไม่แตะ Firebase จริง): เปิด emulator พร้อม Authentication

   ```bash
   npx firebase-tools@13 emulators:start --only firestore,auth --project demo-pdm-monitor
   ```

   แล้วรันคำสั่งใน `services/ingest` โดยตั้ง environment `FIREBASE_PROJECT_ID=demo-pdm-monitor`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` และ `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (ค่าใน environment ชนะ `.env`)
3. **หน้าเว็บกับ emulator:** build หรือรันเว็บด้วย `NEXT_PUBLIC_FIREBASE_EMULATORS=1`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-pdm-monitor`, `NEXT_PUBLIC_FIREBASE_API_KEY` อะไรก็ได้ และ `NEXT_PUBLIC_HVAC_SOURCE=live` ส่วนฝั่ง server ตั้ง `FIRESTORE_EMULATOR_HOST` และ `FIREBASE_AUTH_EMULATOR_HOST` เหมือนข้อ 2
   - ห้ามตั้ง `NEXT_PUBLIC_FIREBASE_EMULATORS` บนเว็บที่ deploy
   - ค่า `NEXT_PUBLIC_*` ถูกฝังตอน build ถ้าใช้ `next build` เพื่อทดสอบ ให้ build ใหม่ด้วยค่าปกติหลังทดสอบเสร็จ
   - หน้า `/hvac/admin` ทดสอบได้ด้วยบัญชีใน Auth emulator ที่มี claim `admin` (สร้างด้วย `npm run access -- --email <อีเมล> --create --admin yes` ตามข้อ 2 แล้วตั้งรหัสผ่านด้วยลิงก์จาก `--reset-link`) อีเมลตั้งรหัสผ่านไม่ถูกส่งจริง ดูลิงก์ได้ที่ `http://127.0.0.1:9099/emulator/v1/projects/demo-pdm-monitor/oobCodes`
   - **แท็บรุ่นอุปกรณ์และปุ่ม Modbus กับ emulator ก็อ่านเขียน TimescaleDB ของ `DATABASE_URL` เช่นกัน:** ถ้าไม่อยากแตะฐานข้อมูลจริง ให้ชี้ `DATABASE_URL` ไปที่ Postgres ในเครื่อง (เช่น PGlite ผ่าน `@electric-sql/pglite-socket`) แล้วสร้างตารางที่เกี่ยวข้องก่อน
   - **แท็บโรงงานกับ emulator ยังเขียน TimescaleDB จริง:** รุ่นอุปกรณ์ไปที่ `DATABASE_URL` ใน `.env.local` ไม่ใช่ emulator ถ้าไม่อยากให้มีแถวของโรงงานทดสอบในฐานข้อมูล ให้ทดสอบกับโรงงานที่ไม่มีอุปกรณ์ หรือแก้โรงงานที่มีอยู่โดยไม่เปลี่ยนรุ่น ถ้าตั้ง `DATABASE_URL` ให้ชี้ไปพอร์ตที่ไม่มีอะไรเปิดอยู่ จะเห็นหน้าจอตอนฐานข้อมูลใช้งานไม่ได้

## ค่าใช้จ่าย

App Hosting คิดเงินตามการใช้งาน Google Cloud จริง และหลายรายการมีโควตาฟรีรายเดือน:
- **Cloud Run:** ช่วงที่มีคนเข้าเว็บ
- **Cloud Build:** ตอน build
- **Artifact Registry:** พื้นที่เก็บ image
- **Firestore:** การอ่าน/เขียน/พื้นที่

เว็บที่คนเข้าไม่มากมักมีค่าใช้จ่ายต่ำ ใน `apphosting.yaml` ตั้งไว้สองข้อเพื่อคุมค่าใช้จ่าย:
- `minInstances: 0`: ไม่มีค่าใช้จ่ายตอนไม่มีคนเข้า แต่คนแรกหลังเว็บว่างไปนานจะรอโหลดนานขึ้นไม่กี่วินาที
- `maxInstances: 4`: จำกัดจำนวน instance สูงสุด

ดูราคาล่าสุดได้ที่หน้า pricing ของ Firebase

## ข้อควรรู้

- **Next.js 16 ยังเป็นสถานะ "preview" บน App Hosting** (รุ่นที่รองรับเต็มคือ 15.x) ผมทดสอบด้วย adapter ทางการของ Firebase (`@apphosting/adapter-nextjs` 14.0.21) แล้ว build ผ่าน และรันเซิร์ฟเวอร์ได้ทุกหน้า
  - บน Windows ต้องแก้ path ใน adapter ชั่วคราวจึงจะรันได้ ส่วนบน Firebase ซึ่ง build บน Linux ไม่มีปัญหานี้
- **adapter ตั้ง `images.unoptimized = true` ให้เอง:** รูปจึงเสิร์ฟตรงจาก `public/` ซึ่งเป็น `.webp` ขนาดเหมาะสมอยู่แล้ว
- **`/app` เปิดให้ทุกคนเข้าได้:** ตอนนี้ใช้ข้อมูลจำลองที่ทำงานใน browser จึงไม่มีข้อมูลจริงรั่ว ถ้าจะต่อข้อมูลจริงต้องเพิ่มระบบ login ก่อน เช่น Firebase Authentication
- **การกันสแปมตอนนี้มีสามชั้น:**
  - ช่องดักบอท (honeypot) ซึ่งคนมองไม่เห็นและ screen reader อ่านไม่เจอ
  - ตรวจข้อมูลซ้ำฝั่งเซิร์ฟเวอร์
  - จำกัดความยาวทุกช่อง

  คำขอที่สงสัยว่าเป็นบอทจะถูกเก็บไว้เป็น `status: "spam"` ไม่ได้ทิ้ง กันพลาดทิ้งลูกค้าจริง ถ้าสแปมเยอะค่อยเพิ่ม Firebase App Check (reCAPTCHA Enterprise แบบไม่มีโจทย์ให้แก้) หรือ rate limit
- **`npm audit` แจ้ง `uuid` ระดับ moderate:** มาจาก `firebase-admin` → `@google-cloud/storage` ซึ่งแอปนี้ไม่ได้ใช้ (ใช้แค่ Firestore) รอผู้พัฒนาต้นทางอัปเดต

## โมดูล Chiller Plant (`/hvac`) กับข้อมูลจริง

`/hvac` ต้อง login ด้วยอีเมลและรหัสผ่าน และแสดงข้อมูลจริงของโปรเจคที่บัญชีได้รับสิทธิ์ สิทธิ์ให้ผ่าน**ลูกค้า** (org): ลูกค้า 1 รายมีได้หลายโรงงาน (1 โปรเจค = 1 โรงงาน) บัญชีที่สังกัดลูกค้าเห็นทุกโรงงานของลูกค้านั้น รวมถึงโรงงานที่เพิ่มภายหลัง

```
PLC → EMQX → services/ingest → Firestore (ค่าล่าสุด, alarm ที่ยังเกิดอยู่) ──onSnapshot──▶ browser
                             └→ TimescaleDB (ประวัติ, alarm ทั้งหมด) ──/api/hvac/*──▶ browser
```

### สิ่งที่ตั้งไว้แล้วใน `pdm-app-87193` (9 ต.ค. 2026)

- **Firebase Authentication:** เปิดใช้ Email/Password ไม่มีหน้าสมัครสาธารณะ บัญชีสร้างโดยผู้ดูแลเท่านั้น
- **`firestore.rules`:** ผู้ใช้ที่ login อ่าน `projects/{project}/**` ได้เฉพาะโปรเจคที่บัญชีมีสิทธิ์ เขียนจาก browser ไม่ได้ ส่วน collection อื่นยังปิดเหมือนเดิม
  - ชุด rules ก่อนหน้า (`2dc1ea09…`) ยังอยู่ ถ้าต้องย้อนกลับ ให้เลือกใน Firebase console → Firestore → Rules → History
  - ชุดที่ deploy ไว้ยังเป็นแบบรายโปรเจค ชุดใน repo ตอนนี้รองรับสิทธิ์ตามลูกค้าแล้ว ดูหัวข้อถัดไป
- **การยกเว้น index:** ฟิลด์ `devices` ของ collection group `gateways` ไม่ถูกทำ index ตาม `firestore.indexes.json`

### เปลี่ยนเป็นสิทธิ์ตามลูกค้า (ทำครั้งเดียว ยังไม่ได้ทำ)

custom claims ของบัญชีมีได้ 3 แบบ ตั้งด้วย `npm run access` ใน `services/ingest`:

| claim | ใช้กับ | เห็นอะไร |
|---|---|---|
| `orgs: ["acme"]` | ผู้ใช้ของลูกค้า (วิธีหลัก) | ทุกโปรเจคที่ `projects/{project}.org` เป็นลูกค้านั้น |
| `projects: ["hq-chiller"]` | กรณียกเว้น เช่น ผู้รับเหมาที่ดูแลโรงงานเดียว | เฉพาะโปรเจคที่ระบุ |
| `admin: true` | ทีมดูแลระบบ | ทุกโปรเจค เลือกได้จากเมนูบัญชี จัดกลุ่มตามลูกค้า |

rules ใหม่ยังรับ claim `projects` เดิม บัญชีที่มีอยู่จึงใช้งานได้ตลอดการย้าย ทำตามลำดับนี้:

1. **ทดสอบ rules ในเครื่อง:** เปิด emulator แล้วสั่ง `npm run test:rules` ใน `pdm-app` (ดูหัวข้อ "ทดสอบในเครื่องด้วย Firestore emulator")
2. **deploy rules** จากโฟลเดอร์ `pdm-app` ก่อนหรือพร้อมกับ push เว็บ:

   ```bash
   npx firebase-tools deploy --only firestore:rules --project pdm-app-87193
   ```

3. **สร้างลูกค้าและผูกโปรเจค** จากโฟลเดอร์ `services/ingest` (ตัวอย่างใช้รหัส `demo` สำหรับโปรเจคทดสอบ):

   ```bash
   npm run org -- --org demo --name "Demo customer" --project hq-chiller --project factory-b
   ```

4. **ย้ายบัญชีที่มีอยู่:** ดูรายชื่อด้วย `npm run access -- --list` แล้วให้แต่ละบัญชีสังกัดลูกค้า คำสั่งจะบอกว่าโปรเจครายตัวไหนซ้ำกับของลูกค้าแล้ว ให้ถอนออก

   ```bash
   npm run access -- --email name@company.co.th --org demo
   npm run access -- --email name@company.co.th --remove hq-chiller --remove factory-b
   ```

5. ผู้ใช้กด **ตรวจอีกครั้ง** หรือ login ใหม่

ค่าใช้จ่ายที่เพิ่ม: rules อ่านเอกสารโปรเจคเพิ่มราว 2 read ต่อการเปิดโรงงาน 1 ครั้ง สำหรับบัญชีที่ได้สิทธิ์ผ่านลูกค้า (โควตาฟรี 50,000 read ต่อวัน)

### หน้าจัดการลูกค้า โรงงาน และบัญชี (`/hvac/admin`)

ผู้ดูแลระบบ (claim `admin`) เห็นเมนู **ลูกค้า โรงงาน และบัญชี** ใน `/hvac` ทำได้ทุกอย่างที่ `npm run org`, `npm run access`, `npm run registry` และ `npm run set-profile` ทำ รวมถึงจัดการ register map ของแต่ละรุ่นและแต่ละอุปกรณ์ บัญชีอื่นไม่เห็นเมนูนี้ และถ้าเปิด URL ตรงจะขึ้น "เฉพาะผู้ดูแลระบบ"

| แท็บ | ทำอะไรได้ |
|---|---|
| ลูกค้า | เพิ่มลูกค้า (เสนอรหัสจากชื่อให้, เตือนถ้าชื่อซ้ำกับลูกค้าอื่น), เปลี่ยนชื่อ, เลือกโรงงานของลูกค้า (ย้ายจากลูกค้าอื่นได้ เลือกได้เฉพาะโรงงานที่ตั้งทะเบียนแล้ว), ลบลูกค้า (เฉพาะเมื่อไม่มีโรงงานและบัญชีเหลือ) และดูโรงงานที่ยังไม่มีลูกค้า |
| โรงงาน | ดูโรงงานที่ตั้งทะเบียนแล้วพร้อมลูกค้าเจ้าของและจำนวนอุปกรณ์, **เพิ่มโรงงาน** (ชื่อ, รหัสโรงงาน = รหัสโปรเจคใน topic ของ PLC, ลูกค้าเจ้าของ, โลโก้เจ้าของ และอุปกรณ์), ปุ่ม **แก้ไข** ของโรงงาน (ชื่อ ลูกค้าเจ้าของ โลโก้ และอุปกรณ์ในตาราง: เพิ่ม ลบ เลื่อนลำดับ, เลือกประเภท รุ่นอุปกรณ์ หน้าที่ของปั๊ม และ chiller ที่มิเตอร์วัด), นำเข้าหรือส่งออก JSON รูปแบบเดียวกับ `npm run registry`, เพิ่มอุปกรณ์ที่ส่งข้อมูลมาแล้วแต่ยังไม่อยู่ในรายการ และตั้งทะเบียนรหัสโปรเจคที่ PLC ส่งข้อมูลมาแล้วแต่ยังไม่มีโรงงาน ปุ่ม **Modbus** ของโรงงาน: แต่ละอุปกรณ์ต่อกับ gateway ไหน พอร์ต slave ID โมดูล และค่าสื่อสารที่ต่างจากรุ่น, register ที่แก้เฉพาะเครื่อง (เปลี่ยนค่า, ไม่อ่าน, หรือเพิ่ม register ของเครื่องนั้นเอง) และ **ส่งออก CSV** register map ของทุกอุปกรณ์ในโรงงานให้คนเขียนโปรแกรม PLC ปุ่ม **การแจ้งเตือน**: ผู้รับอีเมลแจ้งเตือน alarm ของโรงงาน ระดับ ภาษา และส่งอีเมลทดสอบ (ดูหัวข้อ "อีเมลแจ้งเตือน alarm") |
| รุ่นอุปกรณ์ | register map ของแต่ละรุ่น: รูปแบบ address ในเอกสาร (Modicon 30001/40001, เริ่มที่ 0 หรือ 1), ค่าสื่อสารตั้งต้น (RTU/TCP, baud, parity, slave ID), เครื่องแบบหลายโมดูล, ตาราง register (point key, function, register, ชนิดข้อมูล, ตัวคูณ, bit, ลำดับ word, อ่านจาก master หรือทุกโมดูล, สิ่งที่ต้องตรวจหน้างาน) และ fault bit (word, bit, รหัส alarm, ระดับ, ชื่อไทย/อังกฤษ) นำเข้าและส่งออก JSON ได้ ลบได้เฉพาะรุ่นที่ไม่มีอุปกรณ์ใช้และไม่เคยมี alarm |
| บัญชี | ค้นหาด้วยอีเมล, เพิ่มบัญชีพร้อมสิทธิ์, แก้สิทธิ์ (ลูกค้า, โรงงานรายตัว, ผู้ดูแลระบบ), ส่งอีเมลตั้งรหัสผ่านหรือสร้างลิงก์ตั้งรหัสผ่านไปส่งเอง, ปิดใช้หรือเปิดใช้บัญชี และเตือนเมื่อโรงงานรายตัวซ้ำกับที่ได้ผ่านลูกค้าอยู่แล้ว |
| บันทึกการเปลี่ยนแปลง | 50 รายการล่าสุด: เมื่อไร ใคร ทำอะไร ทั้งจากหน้านี้และจากคำสั่ง (ชื่อผู้ใช้@ชื่อเครื่อง) |

- **ทุกการเปลี่ยนแปลงผ่าน server:** browser เรียก `/api/hvac/admin` ซึ่งตรวจ token (รวมการถูกยกเลิก) และอ่าน claim `admin` จากบัญชีปัจจุบันทุกครั้ง ผู้ดูแลที่ถูกถอนสิทธิ์จึงใช้ token เก่าทำต่อไม่ได้ `firestore.rules` ยังห้าม browser เขียนทุกอย่างเหมือนเดิม
- **ตรวจแบบเดียวกับคำสั่ง** (โค้ดชุดเดียวกันใน `pdm-app/src/lib/access/`): รหัสลูกค้าและโปรเจค, ลูกค้าต้องมีอยู่, โรงงานต้องตั้งทะเบียนแล้ว, claims ไม่เกิน 1000 byte, ถอนสิทธิ์ผู้ดูแลระบบของตัวเองหรือปิดใช้บัญชีตัวเองไม่ได้ และรายการอุปกรณ์ (รหัสซ้ำ, ประเภท, รุ่นที่ไม่รู้จักหรือไม่ตรงประเภท, มิเตอร์ต้องวัด chiller ของโรงงานเดียวกัน, ไม่เกิน 500 ตัว)
- **บันทึกอุปกรณ์ต้องใช้ TimescaleDB (`DATABASE_URL` ชุดเดียวกับประวัติ):** server เขียนรุ่นอุปกรณ์ลง `devices.profile` ก่อน แล้วจึงเขียน Firestore ถ้าฐานข้อมูลใช้งานไม่ได้ หน้าเว็บแจ้งว่า "ไม่ได้บันทึกอะไร" ไม่มีการบันทึกครึ่งเดียว และถ้าเปิดรายการอุปกรณ์ตอนฐานข้อมูลใช้งานไม่ได้ หน้าเว็บจะเตือนและไม่ให้บันทึก (เพราะอ่านรุ่นเดิมไม่ได้ บันทึกไปจะลบรุ่นทิ้ง) โรงงานที่ยังไม่มีอุปกรณ์บันทึกได้โดยไม่ต้องใช้ฐานข้อมูล
- **register map อยู่ในฐานข้อมูล ไม่ใช่ในโค้ด:** ตาราง `profiles` (รุ่น), `fault_bits` (ความหมาย fault ของรุ่น) และคอลัมน์ `devices.modbus` (ค่าของแต่ละอุปกรณ์) ใน TimescaleDB การแก้ชื่อ fault บนหน้าเว็บมีผลกับ alarm ที่เกิดหลังจากนั้นทันที ไม่ต้องรีสตาร์ต ingestion และไม่ถูกเขียนทับตอนรีสตาร์ต รุ่น Carrier 30RAM ในโค้ด (`pdm-app/src/lib/telemetry/profiles/`) ถูกคัดลอกเข้าฐานข้อมูลครั้งเดียวตอน migrate ถ้ายังไม่มี
- **ต้อง migrate ฐานข้อมูลก่อนใช้แท็บรุ่นอุปกรณ์และปุ่ม Modbus:** สั่ง `npm run migrate` ใน `services/ingest` หรือรีสตาร์ต ingestion (ทำ migrate ตอนเริ่มอยู่แล้ว) ถ้ายังไม่ได้ทำ หน้าเว็บจะแจ้งว่า "ฐานข้อมูลประวัติยังไม่มีตารางรุ่นอุปกรณ์" และรายการอุปกรณ์ของโรงงานจะยังบันทึกไม่ได้
- **กันบันทึกทับกัน:** ถ้ามีคนบันทึกอุปกรณ์ของโรงงานเดียวกันระหว่างที่เปิดแก้อยู่ (จากหน้าเว็บหรือ `npm run registry`) การบันทึกจะถูกปฏิเสธ ให้เปิดโรงงานใหม่แล้วแก้อีกครั้ง ส่วนการกด Esc หรือยกเลิกขณะมีการแก้ที่ยังไม่บันทึก หน้าเว็บจะถามก่อนทิ้ง
- **บันทึกการเปลี่ยนแปลง** อยู่ใน Firestore collection `adminLog` (browser อ่านไม่ได้ ดูผ่านหน้านี้หรือ Firebase console)
- **บัญชีใหม่ไม่มีรหัสผ่าน:** ผู้ใช้ตั้งเองจากอีเมลตั้งรหัสผ่านของ Firebase Authentication (ส่งในภาษาของหน้าเว็บขณะนั้น ไม่ต้องติดตั้ง extension "Trigger Email") หรือจากลิงก์ที่ผู้ดูแลส่งให้เอง ลิงก์ใช้ได้ในเวลาจำกัด
- **ปิดใช้บัญชี:** เข้าสู่ระบบและต่ออายุไม่ได้, `/api/hvac/*` ปฏิเสธทันที ส่วนหน้าจอที่เปิดค้างไว้ยังเห็นค่าสดจาก Firestore ได้ไม่เกิน 1 ชั่วโมงจนกว่า token จะหมดอายุ
- **ผู้ดูแลที่ยังไม่มีโรงงานใดในระบบ** จะเจอหน้า "ยังไม่มีโปรเจคในระบบ" ก่อนถึงหน้านี้ ให้ตั้งทะเบียนโรงงานแรกของ Firebase project ใหม่ด้วย `npm run registry` ก่อน โรงงานถัดไปเพิ่มบนหน้านี้ได้

**ตั้งค่าครั้งเดียวก่อนใช้บน `pdm-app-87193`:**

1. **ให้ service account ของ App Hosting จัดการ Firebase Authentication ได้:** หน้านี้สร้างบัญชี, ตั้ง claims, ปิดใช้ และสร้างลิงก์ตั้งรหัสผ่าน และ `/api/hvac/*` ทุกตัวอ่านบัญชีเพื่อตรวจการยกเลิก token **ต้องทำก่อน push เวอร์ชันนี้** ไม่อย่างนั้น `/api/hvac/*` จะตอบ 503 "sign-in check unavailable" ชื่อ service account ดูได้ที่ Firebase console → App Hosting → backend `pop` → Settings (ค่าเริ่มต้นคือ `firebase-app-hosting-compute@pdm-app-87193.iam.gserviceaccount.com`)

   ```bash
   gcloud projects add-iam-policy-binding pdm-app-87193 --member="serviceAccount:firebase-app-hosting-compute@pdm-app-87193.iam.gserviceaccount.com" --role="roles/firebaseauth.admin"
   ```

   service account นี้เขียน Firestore ได้อยู่แล้ว (ใช้กับฟอร์มขอเดโม) จึงไม่ต้องเพิ่มสิทธิ์ Firestore
2. **(แนะนำ) ปรับอีเมลตั้งรหัสผ่าน:** Firebase console → Authentication → Templates → Password reset ตั้งชื่อผู้ส่งและข้อความ (มีทั้งภาษาไทยและอังกฤษ) อีเมลส่งจาก `noreply@pdm-app-87193.firebaseapp.com` แจ้งผู้ใช้ให้ดูโฟลเดอร์สแปมด้วย
3. ให้บัญชีของทีมดูแลระบบมี `admin` (`npm run access -- --email <อีเมล> --admin yes`) แล้วกด "ตรวจอีกครั้ง" หรือ login ใหม่

### เพิ่มลูกค้าใหม่

- **บนหน้าเว็บ:** `/hvac/admin` → แท็บลูกค้า → **เพิ่มลูกค้า**
- **ด้วยคำสั่ง** จากโฟลเดอร์ `services/ingest`:

  ```bash
  npm run org -- --org acme --name "ACME Co., Ltd."
  ```

  - `npm run org` แสดงลูกค้าทั้งหมดพร้อมโปรเจค และ `npm run org -- --org acme` แสดงโปรเจคและบัญชีของลูกค้านั้น
  - ใช้ `--name` อีกครั้งเพื่อเปลี่ยนชื่อ และ `--delete` เพื่อลบลูกค้าที่ไม่มีโปรเจคและบัญชีเหลือ

### เพิ่มโปรเจคใหม่

1. **ตั้งทะเบียนโรงงานและอุปกรณ์** ทำได้ 2 ทาง ซึ่งใช้โค้ดตรวจและบันทึกชุดเดียวกัน (`pdm-app/src/lib/access/registry.ts`)
   - **บนหน้าเว็บ:** `/hvac/admin` → แท็บโรงงาน → **เพิ่มโรงงาน** ใส่ชื่อโรงงาน รหัสโรงงาน (ต้องตรงกับรหัสโปรเจคใน topic ที่ PLC ส่ง) และโลโก้เจ้าของ (ไม่บังคับ) เพิ่มอุปกรณ์ในตาราง หรือกด **นำเข้า JSON** จากไฟล์รูปแบบเดียวกับคำสั่ง แล้วกด **ตั้งทะเบียนโรงงาน**
     - ถ้า PLC ส่งข้อมูลมาก่อนตั้งทะเบียน รหัสโปรเจคจะขึ้นในหัวข้อ "ส่งข้อมูลมาแต่ยังไม่มีโรงงาน" กด **ตั้งทะเบียน** ได้โดยไม่ต้องพิมพ์รหัส หน้าต่างตั้งทะเบียนแสดงอุปกรณ์ที่ส่งข้อมูลมาแล้ว กด **เพิ่ม** ทีละตัวหรือ **เพิ่มทั้งหมด** แล้วเลือกประเภทของแต่ละตัว (ขั้นตอนเต็มพร้อมภาพอยู่ใน [`NEW-PLANT.md`](NEW-PLANT.md))
     - แก้ภายหลังด้วยปุ่ม **อุปกรณ์** ของโรงงาน อุปกรณ์ที่ส่งข้อมูลมาแล้วแต่ยังไม่อยู่ในรายการจะขึ้นให้กด **เพิ่ม** และ **ส่งออก JSON** ได้ไฟล์ที่ใช้กับ `npm run registry` ได้ทันที
   - **ด้วยคำสั่ง:** จากโฟลเดอร์ `services/ingest` (รูปแบบไฟล์ดูใน `services/ingest/README.md` หัวข้อ "ทะเบียนอุปกรณ์ของโปรเจค")

     ```bash
     npm run registry -- --file my-project.json
     ```

   หน้า `/hvac` จะวาดผังตามทะเบียนนี้ อุปกรณ์ที่ส่งข้อมูลมาแต่ยังไม่อยู่ในทะเบียนจะแสดงแยกในหมวด "อุปกรณ์ที่ยังไม่อยู่ในรายชื่อ"
   - **รุ่นของอุปกรณ์:** เลือกในช่อง "รุ่นอุปกรณ์" ของรายการอุปกรณ์ ตัวเลือกมาจากแท็บ **รุ่นอุปกรณ์** ถ้ายังไม่มีรุ่นที่ต้องการ ให้เพิ่มรุ่นที่แท็บนั้นก่อน (หรือนำเข้า JSON)
   - **ชื่อและโลโก้ที่ลูกค้าเห็น:** ใส่ `name` (ชื่อโรงงานในตัวเลือกโปรเจค) และ `ownerLogo` (โลโก้เจ้าของ ไม่บังคับ) ในไฟล์เดียวกัน ลูกค้าที่มีหลายโรงงานจะเลือกโรงงานจากชื่อนี้
   - **โลโก้แบบไฟล์:** วางไฟล์ไว้ใน `pdm-app/public` (เช่น `public/hvac/owners/hq.png` แล้วใส่ `"/hvac/owners/hq.png"`) และ deploy เว็บใหม่ หรือใช้ URL `https://` ที่เปิดได้จากเครื่องลูกค้า
   - การตั้งทะเบียนทำซ้ำได้ และถูกบันทึกลง `adminLog` คำสั่ง `npm run registry` ไม่แตะลูกค้าเจ้าของโปรเจค (`org`) ส่วนหน้าเว็บเลือกลูกค้าเจ้าของได้ในหน้าต่างเดียวกัน (บันทึกเป็นการผูกโรงงานกับลูกค้าแยกอีกรายการ ตามข้อ 2)
2. **ผูกโปรเจคกับลูกค้า:** ผู้ใช้ทุกคนของลูกค้านั้นเห็นโรงงานใหม่ทันที ไม่ต้องแก้บัญชีใคร
   - **บนหน้าเว็บ:** `/hvac/admin` → แท็บลูกค้า → ปุ่ม **โรงงาน** ของลูกค้า → เลือกโรงงาน → บันทึก หรือแท็บโรงงาน → ปุ่ม **แก้ไข** → ช่อง **ลูกค้าเจ้าของ** (หลังเพิ่มลูกค้าใหม่ หน้าต่างจะไปต่อที่การเลือกโรงงานให้เลย)
   - **ด้วยคำสั่ง:**

     ```bash
     npm run org -- --org acme --project my-project
     ```

   - ต้องตั้งทะเบียน (ข้อ 1) ก่อน รหัสที่พิมพ์ผิดจึงถูกปฏิเสธ
   - ถ้าโปรเจคเป็นของลูกค้าอื่นอยู่ จะย้ายมาและแจ้งให้ทราบ ใช้ `--remove my-project` (หรือเอาเครื่องหมายออกบนหน้าเว็บ) เพื่อถอนออกจากลูกค้า
3. **register map ให้คนเขียนโปรแกรม PLC:** `/hvac/admin` → แท็บโรงงาน → ปุ่ม **Modbus** ของโรงงาน → **ตั้งค่า** ของแต่ละอุปกรณ์ (gateway, พอร์ต, slave ID, โมดูลของ chiller แบบหลายโมดูล และ register ที่ต่างจากรุ่น) → **ส่งออก CSV** ไฟล์มี 1 บรรทัดต่อ register พร้อม PDU address ที่คำนวณตามโมดูลแล้ว และใช้ค่าที่บันทึกแล้วเท่านั้น

### เพิ่มผู้ใช้

- **บนหน้าเว็บ:** `/hvac/admin` → แท็บบัญชี → **เพิ่มบัญชี** ใส่อีเมล เลือกลูกค้า (หรือโรงงานรายตัว) แล้วกด **ส่งอีเมลตั้งรหัสผ่าน** หรือ **สร้างลิงก์ตั้งรหัสผ่าน** ไปส่งให้ผู้ใช้เอง
- **ด้วยคำสั่ง** จากโฟลเดอร์ `services/ingest` (ใช้สิทธิ์ gcloud ของผู้ดูแล):

  ```bash
  npm run access -- --email name@company.co.th --create --org acme --reset-link
  ```

  - ไม่ใส่ `--create` เมื่อบัญชีมีอยู่แล้ว
  - ใช้ `--remove-org acme` เพื่อถอนสิทธิ์
  - กรณียกเว้นที่ให้ดูเฉพาะโรงงานเดียว: `--project hq-chiller` (ถอนด้วย `--remove hq-chiller`)
  - ใช้ `--admin yes` ให้เห็นทุกโปรเจค (สำหรับทีมดูแลระบบ)
  - ใช้ `--disabled yes` หรือ `no` เพื่อปิดหรือเปิดใช้บัญชี
  - `npm run access -- --list` แสดงทุกบัญชีที่มีสิทธิ์
- ผู้ใช้กด **ตรวจอีกครั้ง** ในหน้าเว็บ หรือ login ใหม่ เพื่อให้สิทธิ์มีผล
- **การถอนสิทธิ์:** มีผลกับหน้าเว็บที่เปิดค้างไว้เมื่อ token ต่ออายุ (ไม่เกิน 1 ชั่วโมง) การ**ปิดใช้บัญชี**ทำให้ login และต่ออายุไม่ได้ และ `/api/hvac/*` ปฏิเสธทันที แต่ค่าสดบนหน้าจอที่เปิดค้างไว้ยังอยู่ได้จนกว่า token หมดอายุ (ไม่เกิน 1 ชั่วโมง) เช่นกัน

### อีเมลแจ้งเตือน alarm

ผู้ดูแลตั้งผู้รับต่อโรงงานในหน้า `/hvac/admin` แท็บโรงงาน ปุ่ม **การแจ้งเตือน** ตัวส่งอยู่ใน ingestion ส่วนการส่งจริงเป็นของ extension "Trigger Email from Firestore" (ลำดับการทำงานดู [`FLOW.md`](FLOW.md) หัวข้อ B16)

**ตั้งครั้งแรก:**

1. **เลือกผู้ให้บริการ SMTP:**
   - Brevo ฟรี 300 ฉบับ/วัน
   - Resend ฟรี 3,000 ฉบับ/เดือน แต่ไม่เกิน 100 ฉบับ/วัน
   - Amazon SES ประมาณ 0.10 USD ต่อ 1,000 ฉบับ
2. **ให้ IT เพิ่ม DNS (SPF/DKIM) ของโดเมนผู้ส่ง:** `modernform.co.th` ใช้เมลเซิร์ฟเวอร์ของบริษัทเอง ถ้าส่งในนามโดเมนนี้ผ่านผู้ให้บริการข้างบนโดยไม่เพิ่ม DNS อีเมลจะเข้า spam หรือใช้ subdomain เช่น `alerts.modernform.co.th` แทน
3. **ติดตั้ง extension** (ถ้ายังไม่ได้ทำในขั้นที่ 6):
   - Extensions → Trigger Email from Firestore → Install
   - Email documents collection: `mail`
   - SMTP connection URI และรหัสผ่านจากผู้ให้บริการ (เก็บใน Secret Manager)
   - Default FROM: ที่อยู่ผู้ส่ง เช่น `BMS Alarm <alerts@modernform.co.th>`
4. **เปิด TTL ของ `mail`** ตามขั้นที่ 5 (`deleteAfter`) เพราะเอกสารมีอีเมลผู้รับ ระบบลบเอกสารหลัง 30 วัน
5. **ตั้งค่า ingestion ตัวที่รันตลอดเวลา (ตัวเดียวเท่านั้น):**
   - `NOTIFY_EMAIL=on`
   - `NOTIFY_SITE_URL=https://pop--pdm-app-87193.asia-southeast1.hosted.app` (ลิงก์ในอีเมล)
   - เครื่องพัฒนาที่ต่อ Firestore จริงให้ปล่อย `NOTIFY_EMAIL=off` ไว้ (แม้เปิดซ้ำก็ไม่ส่งซ้ำ แต่ลิงก์และ log จะสับสน)
6. **ในหน้า admin ใส่ผู้รับแล้วกด "ส่งอีเมลทดสอบ":** ถ้าไม่ได้รับ ให้ดู field `delivery` ในเอกสาร `mail` ล่าสุด (ผลจาก extension) แล้วกด **บันทึก** พร้อมติ๊ก "ส่งอีเมลแจ้งเตือน alarm ของโรงงานนี้"

**ข้อควรรู้:**

- **ข้อมูลที่ browser อ่านไม่ได้:** `notifyConfig` และ `notifyState` อ่านไม่ได้จาก browser เลย แม้บัญชีผู้ดูแล (rules ปิดทุก collection ที่ไม่ได้เปิดไว้) หน้า admin อ่านและเขียนผ่าน `/api/hvac/admin` ซึ่งลงบันทึกการเปลี่ยนแปลงทุกครั้ง
- **ingestion ต้องรันตลอดเวลา:** ถ้า ingestion ไม่รันก็ไม่มีอีเมล ควรตั้ง uptime check ที่ `/healthz` ให้แจ้งผู้ดูแลด้วย
- **alarm ค่าเกินเกณฑ์ยังไม่มีในโหมดข้อมูลจริง:** ตอนนี้อีเมลครอบคลุม fault จาก register profile และการขาดการสื่อสาร
- **ค่าใช้จ่าย:** อีเมล 1 ฉบับต่อผู้รับต่อรอบ (ไม่เกิน 1 รอบต่อนาทีต่อโรงงาน) ตัวส่งอ่าน Firestore เฉพาะตอนเอกสารของโรงงานที่เปิดแจ้งเตือนเปลี่ยน

### ก่อน push ขึ้น `main` (App Hosting deploy อัตโนมัติ)

1. **`apphosting.yaml` มีค่าตั้ง Firebase สาธารณะแล้ว** (`NEXT_PUBLIC_FIREBASE_*`) ค่าเหล่านี้ไม่ใช่ความลับ
2. **ตั้ง secret ของฐานข้อมูลประวัติ:** สั่งคำสั่งด้านล่าง วาง connection string ของ Tiger Cloud แล้วตอบให้ backend `pop` เข้าถึงได้ จากนั้นเอาคอมเมนต์หน้า `DATABASE_URL` ใน `apphosting.yaml` ออก

   ```bash
   firebase apphosting:secrets:set DATABASE_URL --project pdm-app-87193
   ```

   ถ้ายังไม่ตั้ง ค่าปัจจุบันกับ alarm ยังใช้งานได้ แต่หน้า trend, รายงาน, พลังงาน และประวัติ alarm จะขึ้น "โหลดข้อมูลไม่ได้"
3. **migrate TimescaleDB ด้วยโค้ดเวอร์ชันนี้:** `npm run migrate` ใน `services/ingest` (หรือรีสตาร์ต ingestion) เพื่อสร้างตาราง `profiles` และคอลัมน์ `devices.modbus` ก่อนเปิดใช้เว็บเวอร์ชันนี้ ไม่อย่างนั้นแท็บรุ่นอุปกรณ์และปุ่ม Modbus ใช้ไม่ได้ และรายการอุปกรณ์ของโรงงานบันทึกไม่ได้
4. **ingestion ต้องรันตลอดเวลา:** ตอนนี้รันบนเครื่องพัฒนาเท่านั้น การ deploy ขึ้น Cloud Run เป็นงานขั้นถัดไป ดู `services/ingest/README.md`
5. **service account ของ backend ต้องมี role `roles/firebaseauth.admin`:** ดูหัวข้อ "หน้าจัดการลูกค้า โรงงาน และบัญชี" ถ้ายังไม่ให้ `/api/hvac/*` ทุกตัวจะตอบ 503
6. **deploy `firestore.rules` ก่อนหรือพร้อมกัน:** ดูหัวข้อ "เปลี่ยนเป็นสิทธิ์ตามลูกค้า"
7. **(ถ้าเปิดอีเมลแจ้งเตือน)** ติดตั้ง extension และตั้ง `NOTIFY_EMAIL=on` ใน ingestion ตัวที่รันตลอดเวลา ดูหัวข้อ "อีเมลแจ้งเตือน alarm"

### พัฒนาในเครื่อง

- `pdm-app/.env.local` ต้องมี `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_HVAC_SOURCE=live` และ `DATABASE_URL` (ดู `.env.example`)
- ต้อง login gcloud สำหรับ API ฝั่ง server ด้วย `gcloud auth application-default login`
- ตั้ง `NEXT_PUBLIC_HVAC_SOURCE=sim` เพื่อใช้ข้อมูลจำลอง โหมดนี้ไม่ต้อง login เหมาะกับถ่ายภาพหน้าจอหรือเดโม
