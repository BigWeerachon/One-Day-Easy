-- ราคาจริงชุดแรก (พ.ย. 2026): ไม่เก็บมัดจำ · ดูตัวอย่างบนที่อยู่ฟรีก่อน ถูกใจค่อยจ่าย
-- Start 990 = เว็บร้านบนที่อยู่ฟรี · Basic 1,490 = รวมโดเมนของร้าน · ดูแลรายปี 990 (ไม่บังคับต่อ)
insert into catalog_items (code, name, price_satang, recurring, active) values
  ('PKG-START', 'เว็บร้าน · ใช้ที่อยู่ฟรี', 99000, false, true),
  ('PKG-BASIC', 'เว็บร้าน + โดเมนของร้าน', 149000, false, true),
  ('CARE-Y', 'ดูแลรายปี + โฮสติ้ง (ไม่บังคับต่อ)', 99000, true, true),
  ('EDIT-X', 'แก้เพิ่มเกินรอบ (ต่อครั้ง)', 45000, false, true)
on conflict (code) do update set name = excluded.name, price_satang = excluded.price_satang, recurring = excluded.recurring, active = true;
update catalog_items set active = false where code in ('PKG-PRO', 'PKG-BIZ');
