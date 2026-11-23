-- เชื่อมเว็บร้านกับระบบร้าน Sabai (POS/จอครัว)
-- เมนูบนเว็บดึงจาก Sabai (ราคา ของหมด) และลูกค้าสั่งจากเว็บได้ ออเดอร์เข้าจอครัวในช่องทาง "เว็บไซต์" ไม่มี GP
-- คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (Engine ส่งต่อให้ Sabai) ไม่ส่งไปที่เบราว์เซอร์
alter table sites add column if not exists sabai_api text check (sabai_api is null or sabai_api ~ '^https://'),
                  add column if not exists sabai_key text check (sabai_key is null or sabai_key ~ '^sbw_[0-9a-f]{48}$');

-- ข้อเสนอแบบรวม: เว็บร้าน + โดเมน + สั่งออนไลน์ผ่าน Sabai (ค่าระบบร้านคิดตามออเดอร์ที่ Sabai: 0.50 บาท ไม่เกิน 990/สาขา/เดือน)
insert into catalog_items (code, name, price_satang, recurring, active)
values ('ADD-SABAI', 'เชื่อมระบบร้าน Sabai · เมนูอัปเดตเอง + สั่งออนไลน์ไม่มี GP', 0, false, true)
on conflict (code) do update set name = excluded.name, price_satang = excluded.price_satang, active = true;
