# One Day Easy

- What it is: บริการทำเว็บไซต์ให้ร้านอาหารและคาเฟ่ในไทย สั่ง เสนอราคา ยืนยัน ส่งข้อมูล ตรวจตัวอย่าง และจ่ายเงิน ทั้งหมดผ่านแชท LINE · ทีม AI agent (Sales, Intake, Design, Builder, QA, Dev, Ops) ร่าง ตรวจ และส่งตัวอย่างเว็บให้อัตโนมัติ คนตรวจเฉพาะงานที่ agent ส่งต่อ และตรวจสลิปเอง
- Who it is for: ร้านอาหารและคาเฟ่ขนาดเล็กในไทยที่ยังไม่มีเว็บไซต์ (เริ่มจากกลุ่มนี้กลุ่มเดียว)
- What it sells, at what price (ราคาจากแคตตาล็อกตัวอย่างในระบบ · ยังไม่ยืนยันกับตลาด):
  - Start เว็บ 1 หน้า 1,590 บาท · Basic หลายบล็อก + โดเมน 2,990 บาท · Pro จองโต๊ะ/บริการ 5,990 บาท · Business 8,990 บาท
  - ดูแลรายปี + โฮสติ้ง 2,990 บาท/ปี · แก้เกินรอบ 450 บาท/ครั้ง (แก้ฟรี 2 รอบ)
  - มัดจำ 50% ก่อนเริ่ม จ่ายส่วนที่เหลือก่อนเว็บออนไลน์ ผ่าน PromptPay QR ในแชท
- Where and how: ออนไลน์ ลูกค้าทัก LINE OA · เว็บส่งบน Site Engine ของตัวเองบน Vercel (ที่อยู่ฟรีของ Vercel ไปก่อน โดเมนลูกค้าเพิ่มได้) · ช่องทางหาลูกค้า: ยังไม่ระบุ
- Budget and constraints: ยังไม่ระบุงบ · เจ้าของต้องการให้แทบทุกอย่างอัตโนมัติ ทำได้อย่างน้อยวันละ 5 เว็บ · ใช้ Vercel และ Supabase แผนฟรี · เทมเพลตยังเป็น mockup (เจ้าของจะออกแบบเองภายหลัง) · ยังไม่มีลูกค้าจริงและยังไม่ได้ deploy ขึ้นระบบจริง · ระบบผ่าน test อัตโนมัติ (unit 66 + e2e 88) กับบริการจำลอง

## Context for the board
- The board reviewed an earlier version of this idea and scored it 3.7/10 (3x FUND IF). Its prior memos are in founder/board/prev/ for reference. Since then: the target narrowed to restaurants and cafes only, a chat-first LINE sales flow was built, and an AI agent pipeline was added (Design → Builder draft → QA up to 2 fix rounds → Dev technical check → preview sent to customer; escalate to a human otherwise; Ops follows up silent customers and sends a daily digest).
- Still true: no paying customer, no acquisition channel, no production deploy, "one day" delivery never timed on a real job.
- The owner said they do not care about competitors.
