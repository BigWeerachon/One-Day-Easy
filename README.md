# One Day Easy · Studio (หลังบ้าน)

ระบบหลังบ้านตามดีไซน์ Page Studio (Studio-*.dc.html): Next.js App Router + Server Actions

| หน้า | path | ทำอะไรได้ |
|---|---|---|
| งานวันนี้ | `/` | KPI · แจ้งเตือนเว็บล่ม · คิวที่ต้องมีคนทำ (เรียงตาม SLA) · บอร์ดการ์ดงาน |
| กล่องข้อความ | `/inbox` | แชท LINE/อีเมลรวม · ตอบกลับ · นับยังไม่อ่าน |
| ลูกค้า | `/clients`, `/clients/[id]` | ค้นหา/กรอง · เพิ่มลูกค้า (สร้างงานอัตโนมัติ) · เปลี่ยนขั้นงาน · client_notes · ไทม์ไลน์ |
| สร้างเว็บ | `/builder` | แก้ config ทีละบล็อกตาม block schema (N1) · ตรวจ 6 ข้อ · เวอร์ชัน + ย้อนกลับ |
| การเงิน | `/finance` | ออกเอกสาร QT/INV/RN/CN (เลขที่ต่อเนื่อง) · ตรวจสลิป · ครบยอด → ออกใบเสร็จ + ขึ้นออนไลน์อัตโนมัติ |
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

```bash
npm test     # unit tests กฎเงิน/ขั้นงาน/schema
```
