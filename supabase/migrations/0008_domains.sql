-- โดเมนของลูกค้า (J7): ผูกโดเมนที่มีอยู่ หรือซื้อใหม่ผ่าน Vercel · SSL ออกโดย Vercel อัตโนมัติเมื่อ DNS ถูก
create table site_domains (
  id bigserial primary key,
  site_id uuid not null references sites,
  domain text not null unique check (domain = lower(domain)),
  source text not null check (source in ('attach','purchase')),
  status text not null default 'pending' check (status in ('pending','active','error','removed')),
  verified bool not null default false,       -- Vercel ยืนยันความเป็นเจ้าของแล้ว
  dns_ok bool not null default false,         -- DNS ชี้มาที่ Vercel ถูกต้อง (misconfigured = false)
  ssl_ok bool not null default false,         -- เปิด https ได้จริง
  dns_hint jsonb,                             -- เรคคอร์ดที่ลูกค้าต้องตั้ง / challenge ยืนยัน
  last_error text,
  order_id text,                              -- เลขคำสั่งซื้อโดเมน (กรณีซื้อ)
  price_usd numeric(10,2),
  created_by text not null,
  created_at timestamptz default now(),
  checked_at timestamptz,
  activated_at timestamptz
);
create index on site_domains (status);
alter table site_domains enable row level security;
create policy staff_all on site_domains for all to authenticated using (true) with check (true);
