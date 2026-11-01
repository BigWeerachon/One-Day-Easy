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

```bash
npm test     # unit tests กฎเงิน/ขั้นงาน/schema
```
