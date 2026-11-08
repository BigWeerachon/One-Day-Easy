# One Day Easy · Studio (หลังบ้าน)

ระบบหลังบ้านตามดีไซน์ Page Studio (Studio-*.dc.html): Next.js App Router + Server Actions

📘 **คู่มือการใช้งานทั้งหมด + การทดสอบอัตโนมัติ: [docs/USAGE.md](docs/USAGE.md)**

```bash
npm run test:unit                                          # unit tests (ไม่ต้องมีฐานข้อมูล)
TEST_DATABASE_URL=postgresql://localhost/studio_e2e npm run test:e2e   # end-to-end (Postgres + Chromium + mocks)
```

| หน้า | path | ทำอะไรได้ |
|---|---|---|
| งานวันนี้ | `/` | KPI · แจ้งเตือนเว็บล่ม · คิวที่ต้องมีคนทำ (เรียงตาม SLA) · บอร์ดการ์ดงาน |
| กล่องข้อความ | `/inbox` | แชท LINE/อีเมลรวม · ตอบกลับ · นับยังไม่อ่าน |
| ลูกค้า | `/clients`, `/clients/[id]` | ค้นหา/กรอง · เพิ่มลูกค้า (สร้างงานอัตโนมัติ) · เปลี่ยนขั้นงาน · client_notes · ไทม์ไลน์ |
| สร้างเว็บ | `/builder` | แก้ config ทีละบล็อกตาม block schema (N1) · ตรวจ 6 ข้อ · เวอร์ชัน + ย้อนกลับ |
| การเงิน | `/finance` | ออกเอกสาร QT/INV/RN/CN (เลขที่ต่อเนื่อง) · ตรวจสลิป · ครบยอด → ออกใบเสร็จ + ขึ้นออนไลน์อัตโนมัติ |
| คิว & ตารางงาน | `/queue` | รันคิวหน้างาน (เรียกคิว/มาถึง/เสร็จ/ไม่มา) · ตารางรายสัปดาห์ · จองให้ลูกค้า · walk-in · ตั้งบริการ/เวลาทำการ/วันหยุด · ลูกค้าจองเองผ่านแชท LINE |
| Workflow | `/workflow` | คิวงาน/dead-letter/retry · ตารางเปลี่ยนขั้น (N4) · event log |
| สเปก · ตั้งค่า | `/spec`, `/settings` | Roadmap, block schema, event catalog · ทีม/การเชื่อมต่อ/SLA |

กฎหลักอยู่ใน `apps/studio/lib/` — `workflow.ts` (state machine ห้ามข้ามขั้น), `blocks.ts` (schema 16 บล็อก + T1–T10), `events.ts` (catalog), `money.ts` (สตางค์ + เลขที่เอกสาร)
ฐานข้อมูล Supabase: `supabase/migrations/0001_core.sql` (19 ตาราง, trigger บังคับการเปลี่ยนขั้น, append-only, RLS) · ข้อมูลตัวอย่าง `supabase/seed.sql`

## เชื่อม Supabase

1. Supabase → **Project Settings → Database → Connection string → URI** คัดลอกมา (Session pooler, port 5432)
2. สร้างไฟล์ `apps/studio/.env.local` (ดูตัวอย่าง `.env.example`):
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
3. สร้างตาราง + ข้อมูลตัวอย่าง แล้วเปิดใช้:
   ```bash
   npm install
   npm run db:seed -w apps/studio     # migrations + seed (ข้าม seed ถ้ามีข้อมูลแล้ว)
   npm run dev                        # http://localhost:3000
   ```
   - `db:setup` = migrations อย่างเดียว (ใช้กับ production) · `db:reset` = **ลบทุกตาราง** แล้วสร้างใหม่ + seed
   - บน Vercel ตั้ง `DATABASE_URL` เป็น Transaction pooler (port 6543)

แอปต่อ Postgres ตรงจากฝั่ง server (`lib/db.ts`, ไลบรารี `pg`) — รหัสผ่านไม่ถูกส่งไป browser. ทุกการเปลี่ยนเงิน/ขั้นงานอยู่ใน transaction เดียว และ trigger ในฐานข้อมูลตรวจการเปลี่ยนขั้นซ้ำอีกชั้น

## โดเมน + SSL อัตโนมัติ

การ์ด **โดเมน** ในหน้าสร้างเว็บ · ใช้ Vercel REST API กับโปรเจกต์ Site Engine · migration `0008_domains.sql`

- **ผูกโดเมนที่ลูกค้ามี** (Builder/Owner): เพิ่มเข้าโปรเจกต์ Engine → แสดงเรคคอร์ด DNS ที่ลูกค้าต้องตั้ง (TXT ยืนยัน + A/CNAME) → cron `/api/cron/domains` ตรวจทุก 10 นาที: ยืนยันเจ้าของ → DNS ถูก → https ใช้ได้ → **ใช้งาน** (Vercel ออก SSL ให้เอง) · Engine เปิดเว็บที่โดเมนนี้เมื่อพร้อมแล้วเท่านั้น
- **ซื้อโดเมนใหม่** (Owner เท่านั้น · สิทธิ์ `domains.buy`): เช็กว่าง+ราคา → พิมพ์ชื่อโดเมนยืนยัน → ซื้อด้วย `expectedPrice` เท่ากับราคาที่เห็น (ราคาเปลี่ยน = ไม่ซื้อ) · เพดาน `DOMAIN_MAX_PRICE_USD` · กันกดซ้ำ · จดในชื่อบริษัท (`REGISTRANT_*`)
- ถอดโดเมนได้ · event `domain.attached`, `ssl.issued`
- env: `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `ENGINE_PROJECT_ID`, `PLATFORM_DOMAIN`, `DOMAIN_MAX_PRICE_USD`, `REGISTRANT_*`

## PDF ใบแจ้งหนี้ / ใบเสร็จ

ปุ่ม **PDF** ในหน้าการเงินและหน้าลูกค้า (สิทธิ์ดูการเงิน) · ลูกค้าดาวน์โหลดใบแจ้งหนี้และใบเสร็จของตัวเองใน Portal

- หัวเอกสารจาก `SELLER_NAME`, `SELLER_ADDRESS`, `SELLER_TAX_ID`, `SELLER_PHONE` · ข้อมูลลูกค้า/บริษัท (เลขภาษี สาขา ที่อยู่ PO) จากที่ลูกค้ากรอกใน Portal
- จำนวนเงินเป็นตัวอักษรไทย · หมายเหตุหัก ณ ที่จ่าย 3% สำหรับลูกค้าที่หัก · ใบเสร็จแสดงการชำระ · เอกสารที่ยกเลิก/หมดอายุมีลายน้ำ
- ยังไม่จด VAT: พิมพ์ "ไม่ใช่ใบกำกับภาษี" · ตั้ง `SELLER_VAT_REGISTERED=1` เมื่อจดแล้ว (แยกภาษี 7%)
- ไฟล์สร้างซ้ำได้เหมือนเดิมทุกไบต์ · hash ของไฟล์แรกต่อรอบเอกสารเก็บใน `document_files` (append-only) · migration `0007_doc_files.sql`
- ฟอนต์ Sarabun (SIL OFL 1.1) อยู่ใน `apps/studio/assets/fonts`

## Site Engine (`apps/engine`)

แอปเดียวแสดงเว็บลูกค้าทุกเว็บ แยกตามโดเมน (A1) · อ่าน `sites.config` จากฐานข้อมูลเดียวกับ Studio แล้ววาดด้วยบล็อกกลาง + ธีมของเทมเพลต (T1–T10) จาก `packages/blocks`

- **เว็บจริง**: `Host` → `sites.domain` · แสดงเฉพาะเว็บที่ขึ้นออนไลน์แล้ว (งานถึงขั้น "ออนไลน์" → `sites.status = live` อัตโนมัติ) · รองรับ `www.` · แคช 30 วินาทีต่อโดเมน
- **ตัวอย่างร่าง**: `/preview/<siteId>?exp=…&sig=…` ลงลายเซ็น HMAC ด้วย `PREVIEW_SECRET` · ปุ่ม "ดูตัวอย่างเว็บ" ในหน้าสร้างเว็บ และ Portal แสดงเว็บจริงในกรอบให้ลูกค้าตรวจ · ไม่ถูก index
- **รูป**: ใช้ในบล็อกด้วย `file:<id>` (รูปที่ลูกค้าส่งผ่าน Portal) หรือ URL `https:` เท่านั้น · ไฟล์ส่งให้เฉพาะเว็บของเจ้าของ
- LINE (ปุ่ม + QR), QR พร้อมเพย์, แผนที่, เวลาเปิด, PDPA อยู่ในส่วนติดต่อ/ท้ายเว็บ

```bash
npm run dev:engine     # http://localhost:3001 (ตั้ง ENGINE_DEV_HOST เพื่อเลือกเว็บ)
```

Deploy เป็นอีกโปรเจกต์บน Vercel (Root Directory `apps/engine`) แล้วผูกโดเมนลูกค้าเข้าโปรเจกต์นี้ · ตั้ง `DATABASE_URL`, `PREVIEW_SECRET` (และ `ENGINE_URL`, `PREVIEW_SECRET` ฝั่ง Studio)

## ล็อกอินและสิทธิ์ทีม

ทุกหน้า ทุก server action และ `/api/slips/*` ต้องล็อกอิน (ยกเว้น `/login`, LINE webhook และ cron ซึ่งมีลายเซ็น/โทเค็นของตัวเอง)

1. รัน `npm run db:setup -w apps/studio` (migration `0005_auth.sql`)
2. สร้าง Owner คนแรก (ระบบจะถามรหัสผ่าน):
   ```bash
   npm run user:create -w apps/studio -- you@example.com "ชื่อ" owner
   ```
3. Owner เพิ่มสมาชิกอื่นได้ที่ **ตั้งค่า & ระบบ** · สมาชิกใหม่ต้องตั้งรหัสผ่านเองตอนเข้าครั้งแรก

| บทบาท | ทำอะไรได้ |
|---|---|
| Owner | ทุกอย่าง รวมถึงจัดการทีม |
| Builder | ลูกค้า แชท เปลี่ยนขั้นงาน สร้าง/แก้เว็บ ใช้ Claude · **ไม่เห็นการเงิน** |
| Accountant | การเงิน: ออกเอกสาร ตรวจ/ยืนยันสลิป · ไม่เห็นลูกค้า/แชท/เว็บ |

- รหัสผ่าน scrypt · session เก็บเฉพาะ hash · คุกกี้ httpOnly + SameSite=Lax (+ Secure บน production) · หมดอายุ 14 วัน
- ผิด 5 ครั้ง → ล็อกอีเมลนั้น 15 นาที · เปลี่ยนบทบาท/ปิดบัญชี/รีเซ็ตรหัส → ตัด session ทันที · ต้องมี Owner อย่างน้อย 1 คนเสมอ
- ลืมรหัสผ่าน: Owner รีเซ็ตให้ในหน้าตั้งค่า หรือรัน `user:create` ด้วยอีเมลเดิม

## Portal ฝั่งลูกค้า

ทีมกด **ส่งลิงก์ Portal** ในหน้าลูกค้า → ระบบสร้างลิงก์ส่วนตัว `/p/<token>` (ใช้ได้ 7 วัน, ลิงก์เก่ายกเลิก) และส่งทาง LINE ถ้าลูกค้ามี LINE · ลูกค้าไม่ต้องล็อกอิน

ตั้ง `STUDIO_URL` (ใช้สร้างลิงก์) และ `PROMPTPAY_ID` (QR พร้อมเพย์) แล้วรัน `npm run db:setup -w apps/studio` (migration `0006_portal.sql`)

หน้าเปลี่ยนตามขั้นงาน: **ข้อมูลร้าน** (+ ข้อมูลออกใบกำกับภาษีสำหรับบริษัท, รูปย่ออัตโนมัติ, PDPA) → **ตรวจเว็บ** (อนุมัติ / ขอแก้ ฟรี 2 รอบ, รอบถัดไปออกใบ EDIT-X) → **ชำระเงิน** (QR ยอดตรงทีละใบ + แนบสลิป → ตรวจอัตโนมัติ) → **เสร็จ** (ใบเสร็จ + ลิงก์เว็บ) · ลิงก์หมดอายุ → ขอลิงก์ใหม่ส่งไป LINE ที่ลงทะเบียนเท่านั้น (จำกัด 10 นาทีครั้ง)

- เก็บเฉพาะ hash ของ token · หน้า portal ไม่ถูก index และไม่ส่ง URL ผ่าน Referer
- อนุมัติเว็บ → ออกใบแจ้งหนี้ตามแพ็กเกจจากแคตตาล็อกอัตโนมัติ

## เชื่อม LINE OA (Messaging API)

1. LINE Developers → channel ของ OA → คัดลอก **Channel secret** (Basic settings) และออก **Channel access token (long-lived)** (Messaging API)
2. ใส่ใน `apps/studio/.env.local` (หรือ Vercel env): `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `CRON_SECRET` (สุ่มยาวๆ)
3. Messaging API → **Webhook URL** = `https://<โดเมน>/api/line/webhook` → กด Verify → เปิด **Use webhook** · ปิด Auto-reply messages ใน LINE Official Account Manager
4. รัน `npm run db:setup -w apps/studio` เพื่อเพิ่ม migration `0002_line.sql`

การทำงาน:
- ข้อความเข้า → ตรวจลายเซ็น → ลูกค้าใหม่สร้าง client + งานอัตโนมัติ (ชื่อจากโปรไฟล์ LINE) · webhook ส่งซ้ำไม่บันทึกซ้ำ
- ตอบในกล่องข้อความ → งาน `line.push` → ส่งทันที · แสดงสถานะ ✓ ส่งแล้ว / ✗ ส่งไม่สำเร็จ
- ล้มเหลวชั่วคราว (429/5xx/เครือข่าย) → ลองใหม่ด้วย backoff ผ่าน `/api/cron/line` (Vercel Cron ทุก 5 นาที ใน `apps/studio/vercel.json` · ตั้ง Root Directory ของโปรเจกต์ Vercel เป็น `apps/studio`) · ครบ 3 ครั้ง หรือ 4xx → dead-letter ให้คนกด "ลองใหม่" ในหน้า Workflow · ใช้ `X-Line-Retry-Key` เดิมทุกครั้ง LINE จึงไม่ส่งซ้ำ
- ลูกค้าที่เพิ่มด้วยมือยังไม่มี LINE userId → ส่งไม่ได้จนกว่าลูกค้าจะทัก OA มาก่อน (ข้อจำกัดของ LINE)

## Claude API

ตั้ง `ANTHROPIC_API_KEY` (จาก console.anthropic.com) แล้วรัน `npm run db:setup -w apps/studio` เพื่อเพิ่ม migration `0003_ai.sql` · โมเดลเริ่มต้น `claude-opus-5-5` (เปลี่ยนได้ด้วย `ANTHROPIC_MODEL`)

- **สรุปข้อมูลจากแชท** (หน้าโปรไฟล์ลูกค้า): อ่านแชทล่าสุด → ชื่อร้าน ประเภท ผู้ติดต่อ เมนู/ราคา เทมเพลตที่แนะนำ และ "ข้อมูลที่ยังขาด" · เติมเฉพาะช่องที่ว่าง · ความชอบด้านดีไซน์เข้า client_notes
- **ให้ Claude แก้** (หน้าสร้างเว็บ): พิมพ์สิ่งที่อยากแก้ → Claude เสนอ JSON ต่อบล็อก → ตรวจ block schema ทุกบล็อก → แสดงเดิม/ใหม่ → **คนกดใช้เอง** · ใช้ไม่ได้ถ้ามีบล็อกไม่ผ่าน schema หรือเว็บถูกแก้หลังจากเสนอ
- ใช้ structured outputs, prompt caching (system prompt), refusal fallback (`fallbacks: "default"`) · บันทึก token ทุกครั้ง → KPI "Token ต่อเว็บ" หน้างานวันนี้ · event ไม่เก็บข้อมูลส่วนบุคคล

## ตรวจสลิปอัตโนมัติ

ตั้ง `SHOP_RECEIVER_ACCOUNTS` (เลขบัญชี/พร้อมเพย์ของร้าน) และ/หรือ `SHOP_RECEIVER_NAMES` แล้วรัน `npm run db:setup -w apps/studio` (migration `0004_slip_auto.sql`)

- ลูกค้าที่มีใบแจ้งหนี้ค้างส่ง **รูปทาง LINE** → ระบบดาวน์โหลดรูป → Claude อ่านยอด เลขอ้างอิง วันเวลา ผู้รับ → ตรวจ 5 กฎ · หรือ **อัปโหลดรูป** ในหน้าการเงิน
- **อนุมัติเองเมื่อผ่านครบ 5 ข้อ** (เฉพาะเมื่อตั้ง `SLIP_AUTO_APPROVE=on`): เป็นสลิปจริง · ยอดตรงใบค้างพอดี · เลขอ้างอิงไม่เคยใช้ · โอนเข้าบัญชีร้าน · วันที่โอนไม่เกิน `SLIP_MAX_AGE_DAYS` (3) และไม่ก่อนวันออกใบ → ออกใบเสร็จ + ขึ้นออนไลน์ + แจ้งลูกค้าทาง LINE
- ไม่ผ่านข้อใด → รอคนตรวจ พร้อมรูปและเหตุผล · คนเลือกใบแจ้งหนี้เองได้ · ระบบไม่ยอมรับยอดที่เกินยอดค้าง (กันสลิปซ้ำ)
- ค่าเริ่มต้น (`SLIP_AUTO_APPROVE` ไม่ตั้งหรือ `off`) = ระบบอ่านและตรวจให้ แต่คนกดยืนยันทุกใบ · ตั้ง `SLIP_AUTO_APPROVE=on` เพื่อให้อนุมัติเองเมื่อผ่านครบ 5 ข้อ
- ⚠️ ระบบอ่านจากรูป ไม่ได้ถามธนาคาร · สลิปปลอมที่แก้รูปอย่างแนบเนียนอาจผ่านได้ · ควรกระทบยอดกับ statement ธนาคารเป็นประจำ หรือต่อบริการตรวจสลิปกับธนาคารเพิ่ม

```bash
npm test     # unit tests กฎเงิน/ขั้นงาน/schema
```
