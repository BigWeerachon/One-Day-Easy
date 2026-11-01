-- ผลสรุปข้อมูลลูกค้าจาก AI (H1) · ข้อเสนอแก้เว็บที่รอคนอนุมัติ (B1)
alter table clients add column intake jsonb, add column intake_at timestamptz;
create table patch_proposals (
  id bigserial primary key,
  site_id uuid not null references sites,
  base_version int not null,              -- เวอร์ชันที่ AI เห็นตอนเสนอ · ถ้าเว็บเปลี่ยนแล้วจะใช้ไม่ได้
  instruction text not null,
  summary text,
  ops jsonb not null,                     -- [{ block, data }]
  errors jsonb not null default '[]',     -- ผลตรวจ schema ต่อ op
  model text, input_tokens int, output_tokens int, cache_read_tokens int,
  status text not null default 'proposed' check (status in ('proposed','applied','rejected','stale')),
  created_at timestamptz default now()
);
alter table patch_proposals enable row level security;
create policy staff_all on patch_proposals for all to authenticated using (true) with check (true);
