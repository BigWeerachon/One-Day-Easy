-- เต็นท์รถมือสอง: ประเภทธุรกิจใหม่ + ฟอร์ม "ขายรถให้เรา" (lead) จากเว็บร้าน
-- โครงสร้างกลาง (site_leads) ใช้กับฟอร์มรับข้อมูลแบบอื่นในอนาคตได้ (kind)
alter table template_versions drop constraint template_versions_business_check;
alter table template_versions add constraint template_versions_business_check check (business in ('restaurant','cafe','car_dealer'));

create table site_leads (
  id          bigserial primary key,
  site_id     uuid not null references sites on delete cascade,
  client_id   uuid not null references clients on delete cascade,   -- ร้าน (ลูกค้าของเรา) เจ้าของเว็บ
  kind        text not null check (kind in ('sell_car')),
  name        text not null check (length(name) between 1 and 60),
  phone       text not null check (phone ~ '^[0-9+]{9,15}$'),
  data        jsonb not null,                                        -- ข้อมูลตามชนิดฟอร์ม (ผ่านการตรวจแล้ว)
  status      text not null default 'new' check (status in ('new','contacted','inspecting','bought','declined')),
  note        text check (length(note) <= 500),                      -- บันทึกของร้าน
  consent_at  timestamptz not null,                                  -- ยอมรับนโยบายข้อมูลส่วนบุคคล (PDPA)
  ip_hash     text,                                                  -- กันสแปม (ไม่เก็บ IP จริง)
  notified_at timestamptz,                                           -- แจ้งร้านทาง LINE แล้ว
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on site_leads (client_id, created_at desc);
create index on site_leads (notified_at) where notified_at is null;

-- รูปที่แนบมากับ lead: เก็บแยกจากรูปร้าน (ไม่โผล่ในคลังรูปร้าน และลบตาม lead ได้)
create table lead_files (
  id         bigserial primary key,
  lead_id    bigint not null references site_leads on delete cascade,
  mime       text not null check (mime in ('image/jpeg','image/png','image/webp')),
  bytes      bytea not null check (octet_length(bytes) <= 3 * 1024 * 1024),
  created_at timestamptz default now()
);
create index on lead_files (lead_id);

-- เทมเพลตตั้งต้นเต็นท์รถ (อนุมัติแล้ว)
insert into template_versions (key, version, name, business, spec, status, created_by, approved_by, approved_at) values
('D1', 1, 'เต็นท์รถมั่นใจ', 'car_dealer', '{"blocks":[{"type":"hero","variant":"cover"},{"type":"cars","variant":"cards"},{"type":"sellcar","variant":"default"},{"type":"reviews","variant":"cards"},{"type":"faq","variant":"accordion"},{"type":"hours","variant":"default"},{"type":"line","variant":"default"},{"type":"map","variant":"default"}],"required":["hero","cars","sellcar","hours","line","map"],"palette":"ocean","fonts":"modern","radius":12}', 'approved', 'ระบบ', 'ระบบ', now());
