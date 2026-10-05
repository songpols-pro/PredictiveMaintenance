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
