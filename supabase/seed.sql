-- ข้อมูลตัวอย่าง (T3) — ใช้กับ dev/staging เท่านั้น
-- id รูปแบบ 0000…c1 (ลูกค้า) / …a1 (งาน) / …b1 (เว็บ)
create or replace function pg_temp.u(x text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(x, 12, '0'))::uuid $$;

insert into clients (id, name, kind, status, package, color, contact_name, channel, last_contact_at) values
 (pg_temp.u('c1'),'ครัวป้าแดง','ร้านอาหาร','active','Start','#f59e0b','คุณแดง','LINE', now() - interval '2 min'),
 (pg_temp.u('c2'),'บ้านสวนริมดอย','ที่พัก','active','Pro','#16a34a','คุณต้น','LINE', now() - interval '1 hour'),
 (pg_temp.u('c3'),'Lumière Clinic','คลินิก','active','Business','#7c3aed','คุณแอน','Email', now() - interval '15 min'),
 (pg_temp.u('c4'),'แอร์ดีเซอร์วิส','บริการ','care','Basic','#0b6cf0','ช่างต้น','LINE', now() - interval '2 day'),
 (pg_temp.u('c5'),'Moka House','คาเฟ่','care','Start','#7a4a2a','คุณมิ้น','LINE', now() - interval '5 day'),
 (pg_temp.u('c6'),'KidzLab','โรงเรียน','active','Basic','#f47aa5','คุณนุ่น','Web', now() - interval '3 hour'),
 (pg_temp.u('c7'),'PULSE Gym','บริการ','lead',null,'#141a2b','คุณบีม','FB', now() - interval '1 day'),
 (pg_temp.u('c8'),'ร้านข้าวมันไก่เจ๊หมวย','ร้านอาหาร','active','Start','#e11d48','เจ๊หมวย','LINE', now() - interval '12 min'),
 (pg_temp.u('c9'),'ร้านนวดสบายดี','บริการ','active','Basic','#0891b2','คุณนก','LINE', now() - interval '40 min');

insert into client_notes (client_id, note) values (pg_temp.u('c1'),'ชอบโทนแดงอบอุ่น'), (pg_temp.u('c5'),'ชอบโทนเขียว'), (pg_temp.u('c2'),'ไม่ตอบ 72 ชม. — ต้องโทร');

insert into sites (id, client_id, domain, template, status, version, config) values
 (pg_temp.u('b1'),pg_temp.u('c1'),'krua-padaeng.onedayeasy.app','T3','draft',3,'{"hero":{"title":"ครัวป้าแดง อร่อยแบบบ้านๆ","subtitle":"อาหารตามสั่งสูตรเด็ด ส่งไวในย่านลาดพร้าว","cta":"สั่งเลย"},"menu":{"items":[{"name":"กะเพราหมูกรอบ","price":60},{"name":"ต้มยำกุ้ง","price":120}]},"line":{"id":"@kruapadaeng"},"hours":{"days":"จ.–ส.","open":"08:00","close":"20:00"},"map":{"lat":13.81,"lng":100.6,"address":"ลาดพร้าว 71 กรุงเทพฯ"}}'),
 (pg_temp.u('b2'),pg_temp.u('c5'),'mokahouse.com','T1','live',7,'{"hero":{"title":"Moka House","subtitle":"Specialty coffee & bakery","cta":"ดูเมนู"},"line":{"id":"@mokahouse"}}'),
 (pg_temp.u('b3'),pg_temp.u('c4'),'airdservice.com','T5','live',4,'{"hero":{"title":"แอร์ดีเซอร์วิส","subtitle":"ล้างแอร์ ซ่อมแอร์ มาไวใน 2 ชม.","cta":"จองช่าง"}}'),
 (pg_temp.u('b4'),pg_temp.u('c8'),'yumyum.vercel.app','T3','down',1,'{"hero":{"title":"ข้าวมันไก่เจ๊หมวย","subtitle":"","cta":"สั่งเลย"}}');

-- insert ตรงด้วยขั้นปัจจุบัน (trigger ทำงานเฉพาะ update)
insert into jobs (id, client_id, site_id, title, stage, template, checks_passed, checklist_done, pdpa_consent, approved, edit_rounds, assignee, sla_due_at) values
 (pg_temp.u('a1'),pg_temp.u('c8'),pg_temp.u('b4'),'ร้านข้าวมันไก่เจ๊หมวย','template','T3',6,true,true,false,0,'มิ้น', now() + interval '2 hour'),
 (pg_temp.u('a2'),pg_temp.u('c9'),null,'ร้านนวดสบายดี','template',null,0,true,true,false,0,'ต้น', now() + interval '5 hour'),
 (pg_temp.u('a3'),pg_temp.u('c1'),pg_temp.u('b1'),'ครัวป้าแดง','client_review','T3',6,true,true,false,2,'มิ้น', now() + interval '21 hour'),
 (pg_temp.u('a4'),pg_temp.u('c6'),null,'KidzLab','intake',null,0,false,false,false,0,'ต้น', now() + interval '8 hour'),
 (pg_temp.u('a5'),pg_temp.u('c2'),null,'บ้านสวนริมดอย · เว็บที่ 3','client_review','T4',6,true,true,false,0,'มิ้น', now() - interval '48 hour'),
 (pg_temp.u('a6'),pg_temp.u('c3'),null,'Lumière Clinic','payment','T2',6,true,true,true,0,'มิ้น', now() - interval '1 hour'),
 (pg_temp.u('a7'),pg_temp.u('c5'),pg_temp.u('b2'),'Moka House','online','T1',6,true,true,true,0,'มิ้น', null),
 (pg_temp.u('a8'),pg_temp.u('c4'),pg_temp.u('b3'),'แอร์ดีเซอร์วิส','online','T5',6,true,true,true,0,'มิ้น', null),
 (pg_temp.u('a9'),pg_temp.u('c7'),null,'PULSE Gym','new_chat',null,0,false,false,false,0,'มิ้น', now() + interval '8 hour');

insert into catalog_items values
 ('PKG-START','แพ็ก Start · เว็บ 1 หน้า',159000,false,true), ('PKG-BASIC','แพ็ก Basic · หลายบล็อก + โดเมน',299000,false,true),
 ('PKG-PRO','แพ็ก Pro · จองห้อง/บริการ',599000,false,true), ('PKG-BIZ','แพ็ก Business',899000,false,true),
 ('CARE-Y','ดูแลรายปี + โฮสติ้ง',299000,true,true), ('EDIT-X','แก้เพิ่มเกินรอบ (ต่อครั้ง)',45000,false,true);

insert into documents (no, type, client_id, job_id, total_satang, paid_satang, status, revision, issued_at) values
 ('INV-2611-008','INV',pg_temp.u('c3'),pg_temp.u('a6'),745000,0,'issued',1,'2026-10-29'),
 ('RN-2611-004','RN',pg_temp.u('c5'),null,299000,0,'issued',1,'2026-11-01'),
 ('QT-2611-011','QT',pg_temp.u('c1'),pg_temp.u('a3'),359000,0,'issued',2,'2026-10-31'),
 ('RC-2610-031','RC',pg_temp.u('c4'),null,459000,459000,'paid',1,'2026-10-20');
insert into doc_sequences values ('INV','2611',8), ('RN','2611',4), ('QT','2611',11), ('RC','2610',31);
insert into slips (doc_no, amount_satang, status) values ('INV-2611-008',700000,'pending');

insert into conversations (client_id, channel) select id, channel from clients where id in (pg_temp.u('c1'),pg_temp.u('c3'),pg_temp.u('c8'),pg_temp.u('c7'));
insert into messages (conversation_id, sender, body, read_at, created_at)
 select cv.id, m.sender, m.body, m.read_at, m.at from (values
  ('c1','client','ขอเปลี่ยนรูปหน้าแรกเป็นรูปร้านจริงได้ไหมคะ',null::timestamptz, now() - interval '62 min'),
  ('c1','team','ได้เลยค่ะ ส่งรูปมาทาง LINE ได้เลย', now(), now() - interval '60 min'),
  ('c3','client','โอนแล้วนะคะ แนบสลิปค่ะ',null, now() - interval '55 min'),
  ('c8','client','อยากได้เว็บร้านข้าวมันไก่ค่ะ ทำได้ในวันเดียวไหม',null, now() - interval '80 min'),
  ('c7','client','สนใจแพ็กเว็บยิมครับ ราคาเท่าไร', now(), now() - interval '1 day')
 ) m(c, sender, body, read_at, at) join conversations cv on cv.client_id = pg_temp.u(m.c);

insert into tasks (job_id, name, idempotency_key, attempts, status, last_error) values
 (pg_temp.u('a8'),'line.push · แจ้งลิงก์เว็บ','a8:notify:v4',3,'dead','LINE API 429 rate limit'),
 (pg_temp.u('a4'),'draft.generate · Sonnet','a4:draft:v1',1,'running',null),
 (null,'document.send · RN-2611-004','RN-2611-004:send',1,'done',null),
 (null,'site.healthcheck · daily','hc:2026-11-01',1,'done',null);
