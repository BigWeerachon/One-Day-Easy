# เช็กลิสต์ตั้งค่า Vercel + Supabase (เปิดระบบจริง)

ทำตามลำดับ ติ๊กทีละข้อ · รายละเอียดเพิ่มเติมอยู่ใน [USAGE.md §15](USAGE.md#15-deploy-ขึ้น-vercel--supabase) และ [§19](USAGE.md#19-ภาคผนวก-environment-variables)
ตัวแปรในเอกสารนี้ไล่จากโค้ดจริง (`process.env.*` ใน `apps/studio`, `apps/engine`, `packages/blocks`)

> ใส่ secret ใน Vercel → Settings → Environment Variables เท่านั้น ห้าม commit และห้ามส่งในแชท

---

## 0. เตรียมก่อนเริ่ม

- [ ] โดเมนบริษัท (สำหรับหน้าขาย) เช่น `onedayeasy.com`
- [ ] โดเมนแพลตฟอร์ม (ที่อยู่ฟรีของร้าน) เช่น `onedayeasy.app` → ร้านได้ `ชื่อร้าน.onedayeasy.app`
- [ ] LINE OA + LINE Developers channel (Messaging API)
- [ ] Supabase project (แผนฟรีได้)
- [ ] Anthropic API key (ถ้าจะใช้ AI agent และตรวจสลิปอัตโนมัติ)
- [ ] Resend API key (ถ้าจะส่งอีเมล)
- [ ] Vercel token + Team ID (สำหรับผูกโดเมนลูกค้าอัตโนมัติ)

## 1. Supabase

- [ ] คัดลอก connection string แบบ **Transaction pooler (port 6543)** สำหรับ Vercel
- [ ] รัน migration ทั้งหมดจากเครื่อง (รวม `0019_hotel_camp.sql` และ `0020_general_landing.sql` ใหม่):
  ```bash
  DATABASE_URL=<direct connection 5432> npm run db:setup -w apps/studio
  ```
- [ ] ตรวจว่ามีเทมเพลตตั้งต้นครบ 8 ชุด: R1 C1 D1 H1 + ทั่วไป G1 G2 G3 G4 (หน้า Studio → เทมเพลต)

## 2. Vercel โปรเจกต์ Studio (`apps/studio`)

Root Directory = `apps/studio` · Region `sin1` (ตั้งไว้แล้วใน `vercel.json`)

### บังคับ
| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | Supabase pooler (6543) |
| `STUDIO_URL` | `https://studio.<โดเมนบริษัท>` |
| `ENGINE_URL` | URL ของโปรเจกต์ Engine |
| `PREVIEW_SECRET` | สุ่มยาว ≥ 32 ตัว · **ต้องตรงกับ Engine** |
| `CRON_SECRET` | สุ่มยาว ≥ 32 ตัว · ใส่ใน GitHub Secrets ด้วย (ข้อ 5) |
| `LINE_CHANNEL_SECRET` | จาก LINE Developers |
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE Developers (long-lived) |
| `PLATFORM_DOMAIN` | เช่น `onedayeasy.app` |
| `PROMPTPAY_ID` | เบอร์/เลขบัตรรับเงิน |

### ข้อมูลผู้ขาย (ใบเสนอราคา/ใบเสร็จ)
`SELLER_NAME` · `SELLER_ADDRESS` · `SELLER_PHONE` · `SELLER_TAX_ID` · `SELLER_VAT_REGISTERED` (true/false)

### ตรวจสลิป
`SHOP_RECEIVER_NAMES` (ชื่อบัญชีรับเงิน คั่นด้วย ,) · `SHOP_RECEIVER_ACCOUNTS` · `SLIP_AUTO_APPROVE` (true เพื่ออนุมัติอัตโนมัติ) · `SLIP_MAX_AGE_DAYS`

### AI / agent (ไม่บังคับ)
`ANTHROPIC_API_KEY` · `ANTHROPIC_MODEL` · `AGENTS` (on/off) · `SALES_AGENT` (on/off) · `SALES_FACTS_EXTRA` · `AUTO_DRAFT` · `ORDER_BOT`

### อีเมล (ไม่บังคับ)
`RESEND_API_KEY` · `EMAIL_FROM` · `EMAIL_REPLY_TO`

### ผูกโดเมนลูกค้า (ไม่บังคับ)
`VERCEL_TOKEN` · `VERCEL_TEAM_ID` · `ENGINE_PROJECT_ID` · `DOMAIN_MAX_PRICE_USD` · `REGISTRANT_*` (ดู USAGE §19)

### อื่นๆ
`PORTAL_BASE_URL` (ถ้า Portal ใช้โดเมนแยก) · `ORDER_DEPOSIT_PERCENT`

**ห้ามตั้งบนระบบจริง:** `INSECURE_COOKIES` · `LINE_ALLOW_HTTP_IMAGES` · `TICK_ON_REQUEST` · `*_API_BASE` (ใช้กับเทสเท่านั้น)

- [ ] Domains: ผูก `studio.<โดเมนบริษัท>`

## 3. Vercel โปรเจกต์ Engine (`apps/engine`)

Root Directory = `apps/engine`

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | Supabase pooler (6543) |
| `PREVIEW_SECRET` | **ค่าเดียวกับ Studio** |
| `STUDIO_URL` | URL ของ Studio |
| `MARKETING_HOST` | **ใหม่** · โดเมนหน้าขาย คั่นด้วย , เช่น `onedayeasy.com,www.onedayeasy.com` |
| `LINE_OA_ID` | **ใหม่** · LINE OA บริษัท เช่น `@onedayeasy` (ปุ่มบนหน้าขาย) |
| `SITE_CACHE_MS` | ไม่บังคับ (ค่าเริ่มต้น 30000) |

**ห้ามตั้งบนระบบจริง:** `ENGINE_DEV_HOST`

- [ ] Domains: ผูก `onedayeasy.com` + `www.onedayeasy.com` (หน้าขาย)
- [ ] Domains: ผูก wildcard `*.onedayeasy.app` (ต้องใช้ Vercel nameservers สำหรับ wildcard)
- [ ] จด Project ID ไปใส่ `ENGINE_PROJECT_ID` ใน Studio

## 4. LINE

- [ ] Webhook URL = `https://studio.<โดเมนบริษัท>/api/line/webhook` → Verify → เปิด Use webhook
- [ ] LINE OA Manager: ปิด Auto-reply และ Greeting message (ระบบตอบเอง)

## 5. GitHub (cron ทุก 5 นาที)

Vercel Hobby รัน cron ได้วันละครั้ง ระบบใช้ GitHub Actions เรียกทุก 5 นาทีแทน
- [ ] Repo → Settings → Secrets and variables → Actions: `STUDIO_URL`, `CRON_SECRET`

## 6. บัญชีแรก

- [ ] สร้าง Owner คนแรก:
  ```bash
  DATABASE_URL=<direct> npm run user:create -w apps/studio
  ```

## 7. ทดสอบหลัง deploy

- [ ] **Studio → ตั้งค่า → ตรวจความพร้อมระบบ → ตรวจตอนนี้** · ทุกแถวต้องไม่มี "ต้องแก้" (ตรวจค่าตั้ง, migration, เทมเพลต, บัญชี Owner, LINE token + webhook URL, Engine, Vercel wildcard, Anthropic key)
- [ ] เปิด `https://onedayeasy.com` → เห็นหน้าขาย ปุ่ม LINE ชี้ OA ถูก
- [ ] ล็อกอิน Studio
- [ ] ทัก OA "สนใจทำเว็บ" → ข้อความเข้ากล่องข้อความ
- [ ] เทมเพลต → เปิดตัวอย่าง R1 / H1 (ข้อมูลตัวอย่าง/ยาวสุด/ว่าง)
- [ ] เรียก cron ครั้งหนึ่ง:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://studio.<โดเมนบริษัท>/api/cron/all
  ```
- [ ] สร้างเว็บทดลอง 1 ร้าน → เปิด `ชื่อร้าน.onedayeasy.app` ได้

## หมายเหตุ

- Next.js อัปเกรดเป็น 16.4.6 แล้ว (แก้ประกาศช่องโหว่ของ 16.4.3)
