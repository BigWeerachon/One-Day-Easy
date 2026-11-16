-- แจ้งเตือนทางอีเมล: กล่องขาออก (ลองส่งซ้ำได้) + ค่าที่แต่ละคนเลือกรับ
create table email_outbox (
  id bigserial primary key,
  event text not null,                          -- เช่น booking.created, payment.received
  to_addr text not null check (to_addr = lower(to_addr)),
  subject text not null,
  html text not null,
  text_body text not null,
  attach_doc text references documents(no),     -- แนบ PDF เอกสารนี้ตอนส่ง (สร้างใหม่ทุกครั้ง ไม่เก็บไฟล์ซ้ำ)
  idempotency_key text not null unique,         -- กันส่งซ้ำเมื่อ event เดิมถูกเรียกหลายครั้ง
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','dead','skipped')),
  attempts int not null default 0,
  last_error text,
  provider_id text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on email_outbox (status, run_after) where status in ('queued','failed');
create index on email_outbox (created_at desc);

-- null = ใช้ค่าเริ่มต้นตามบทบาท · {"booking": false, ...} = ปิดเฉพาะกลุ่มนั้น
alter table staff add column email_prefs jsonb not null default '{}';

alter table email_outbox enable row level security;
create policy staff_all on email_outbox for all to authenticated using (true) with check (true);
