-- ประเภทธุรกิจใหม่: ที่พัก / แคมป์ (บล็อกบังคับ rooms) + เทมเพลตตั้งต้น H1
alter table template_versions drop constraint template_versions_business_check;
alter table template_versions add constraint template_versions_business_check check (business in ('restaurant','cafe','car_dealer','hotel_camp'));

insert into template_versions (key, version, name, business, spec, status, created_by, approved_by, approved_at) values
('H1', 1, 'บ้านพักริมน้ำ', 'hotel_camp', '{"blocks":[{"type":"hero","variant":"cover"},{"type":"rooms","variant":"cards"},{"type":"gallery","variant":"strip"},{"type":"reviews","variant":"quote"},{"type":"faq","variant":"accordion"},{"type":"hours","variant":"default"},{"type":"line","variant":"default"},{"type":"map","variant":"default"},{"type":"promptpay","variant":"default"}],"required":["hero","rooms","hours","line","map"],"palette":"bronze","fonts":"google-sans","radius":12}', 'approved', 'ระบบ', 'ระบบ', now());
