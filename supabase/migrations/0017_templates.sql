-- ระบบเทมเพลตสำเร็จรูป (เฟส 1)
-- เทมเพลต 1 ตัว (key เช่น R1) มีหลายเวอร์ชัน · ร่าง → ตรวจอัตโนมัติ → Owner อนุมัติ → ล็อก (แก้ทับไม่ได้)
-- เว็บผูกกับเวอร์ชันที่ใช้อยู่ · ทีมเลือกอัปเกรดทีละร้านหลังดูตัวอย่าง
create table template_versions (
  id          bigserial primary key,
  key         text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  version     int  not null check (version >= 1),
  name        text not null check (length(name) between 1 and 60),
  business    text not null check (business in ('restaurant','cafe')),
  spec        jsonb not null,           -- { blocks:[{type,variant}], required:[], palette, fonts, radius }
  status      text not null default 'draft' check (status in ('draft','approved','retired')),
  checks      jsonb,                    -- ผลตรวจอัตโนมัติล่าสุด
  created_by  text not null,
  created_at  timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  unique (key, version)
);
-- เวอร์ชันที่อนุมัติแล้วแก้เนื้อหาไม่ได้ · เปลี่ยนได้อย่างเดียวคือเลิกใช้ (retired)
create function template_versions_lock() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and (new.spec is distinct from old.spec or new.name is distinct from old.name
      or new.business is distinct from old.business or new.key is distinct from old.key or new.version is distinct from old.version
      or (old.status = 'retired') or (new.status = 'draft')) then
    raise exception 'เทมเพลตเวอร์ชันนี้อนุมัติแล้ว แก้ไม่ได้ ให้สร้างเวอร์ชันใหม่';
  end if;
  return new;
end $$;
create trigger template_versions_lock before update on template_versions for each row execute function template_versions_lock();
create function template_versions_nodelete() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then raise exception 'ลบเทมเพลตที่อนุมัติแล้วไม่ได้'; end if;
  return old;
end $$;
create trigger template_versions_nodelete before delete on template_versions for each row execute function template_versions_nodelete();

-- เว็บผูกกับเวอร์ชันที่อนุมัติแล้วเท่านั้น
alter table sites add column template_version_id bigint references template_versions(id);
create function sites_template_approved() returns trigger language plpgsql as $$
begin
  if new.template_version_id is not null and new.template_version_id is distinct from old.template_version_id
     and not exists (select 1 from template_versions where id = new.template_version_id and status = 'approved') then
    raise exception 'ใช้ได้เฉพาะเทมเพลตที่อนุมัติแล้ว';
  end if;
  return new;
end $$;
create trigger sites_template_approved before insert or update of template_version_id on sites for each row execute function sites_template_approved();

-- เทมเพลตตั้งต้น 2 ชุด (อนุมัติแล้ว)
insert into template_versions (key, version, name, business, spec, status, created_by, approved_by, approved_at) values
('R1', 1, 'ครัวไทยสีสด', 'restaurant', '{"blocks":[{"type":"hero","variant":"cover"},{"type":"menu","variant":"cards"},{"type":"sets","variant":"cards"},{"type":"reviews","variant":"quote"},{"type":"gallery","variant":"grid"},{"type":"faq","variant":"accordion"},{"type":"hours","variant":"default"},{"type":"line","variant":"default"},{"type":"map","variant":"default"},{"type":"promptpay","variant":"default"}],"required":["hero","menu","hours","line","map"],"palette":"chili","fonts":"bold","radius":16}', 'approved', 'ระบบ', 'ระบบ', now()),
('C1', 1, 'คาเฟ่อบอุ่น', 'cafe', '{"blocks":[{"type":"hero","variant":"split"},{"type":"menu","variant":"list"},{"type":"gallery","variant":"strip"},{"type":"reviews","variant":"cards"},{"type":"hours","variant":"default"},{"type":"line","variant":"default"},{"type":"map","variant":"default"}],"required":["hero","menu","hours","line","map"],"palette":"coffee","fonts":"classic","radius":18}', 'approved', 'ระบบ', 'ระบบ', now());
