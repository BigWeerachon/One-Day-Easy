-- Portal ฝั่งลูกค้า: ลิงก์ส่วนตัว 7 วัน · ข้อมูลออกเอกสาร · รูปจากลูกค้า
create table portal_links (
  token_hash text primary key,                 -- sha256 ของ token ใน URL
  client_id uuid not null references clients,
  job_id uuid not null references jobs,
  expires_at timestamptz not null,
  revoked bool not null default false,
  created_by text not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz
);
create index on portal_links (job_id);
alter table clients
  add column phone text,
  add column opening_hours text,
  add column customer_type text not null default 'person' check (customer_type in ('person','company','government','foreigner')),
  add column legal_name text,
  add column branch text,                      -- 'สำนักงานใหญ่' หรือเลขสาขา
  add column po_no text,
  add column wht bool not null default false;  -- หัก ณ ที่จ่าย 3%
create table client_files (
  id bigserial primary key,
  client_id uuid not null references clients,
  kind text not null default 'photo' check (kind in ('photo','logo')),
  mime text not null,
  bytes bytea not null check (octet_length(bytes) <= 5 * 1024 * 1024),
  created_at timestamptz default now()
);
create index on client_files (client_id);
alter table jobs add column edit_requests jsonb not null default '[]';  -- [{ round, text, paid, at }]
alter table slips drop constraint slips_source_check;
alter table slips add constraint slips_source_check check (source in ('manual','line','upload','portal'));
alter table portal_links enable row level security;
alter table client_files enable row level security;
create policy staff_all on client_files for all to authenticated using (true) with check (true);
