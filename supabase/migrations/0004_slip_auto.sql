-- ตรวจสลิปอัตโนมัติ: เก็บรูป · ผลอ่านจาก AI · ผลตรวจแต่ละกฎ · กันสลิปซ้ำด้วยเลขอ้างอิง
alter table slips
  alter column doc_no drop not null,                        -- สลิปที่ยังจับคู่ใบแจ้งหนี้ไม่ได้
  alter column amount_satang drop not null,
  add column client_id uuid references clients,
  add column source text not null default 'manual' check (source in ('manual','line','upload')),
  add column ref text,                                      -- เลขอ้างอิงธุรกรรมบนสลิป
  add column bank text,
  add column paid_at timestamptz,                           -- วันเวลาโอนบนสลิป
  add column read jsonb,                                    -- ผลอ่านจาก Claude
  add column checks jsonb,                                  -- [{ rule, ok, detail }]
  add column decided_by text,                               -- 'auto' | ชื่อคน
  add column line_message_id text unique;
create unique index slips_ref_key on slips (ref) where ref is not null and status <> 'rejected';
create table slip_images (
  slip_id bigint primary key references slips on delete cascade,
  mime text not null,
  bytes bytea not null check (octet_length(bytes) <= 5 * 1024 * 1024)
);
alter table slip_images enable row level security;
create policy staff_all on slip_images for all to authenticated using (true) with check (true);
