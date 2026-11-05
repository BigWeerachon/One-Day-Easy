-- ระบบจองคิว · ตารางงาน · รันคิวหน้างาน · จองผ่าน LINE
-- เวลาเก็บเป็น timestamptz (UTC) · ตีความวัน/เวลาทำการตามเขตเวลา Asia/Bangkok
create extension if not exists btree_gist;

-- ค่าตั้งระบบ (แถวเดียว)
create table booking_settings (
  id int primary key default 1 check (id = 1),
  slot_step_min int not null default 30 check (slot_step_min between 5 and 240),      -- ระยะห่างของเวลาเริ่มที่ให้เลือก
  min_notice_min int not null default 120 check (min_notice_min >= 0),                -- จองล่วงหน้าอย่างน้อยกี่นาที
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 365),    -- จองล่วงหน้าได้ไม่เกินกี่วัน
  hold_min int not null default 10 check (hold_min between 1 and 60),                 -- กันที่ระหว่างรอลูกค้ากดยืนยันใน LINE
  cancel_cutoff_min int not null default 180 check (cancel_cutoff_min >= 0),          -- ยกเลิกเองผ่าน LINE ได้ถึงก่อนเริ่มกี่นาที
  remind_before_min int not null default 1440 check (remind_before_min >= 0),         -- ส่ง LINE เตือนก่อนเริ่มกี่นาที (0 = ไม่เตือน)
  line_enabled bool not null default true,                                            -- เปิดให้จองผ่านแชท LINE
  updated_at timestamptz default now()
);
insert into booking_settings (id) values (1);

-- คนหรือห้องที่ให้บริการ (1 resource รับได้ 1 คิวในเวลาเดียวกัน)
create table booking_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#4f46e5',
  active bool not null default true,
  sort int not null default 0
);

-- บริการที่จองได้
create table booking_services (
  code text primary key check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null,
  duration_min int not null check (duration_min between 5 and 720),
  buffer_min int not null default 0 check (buffer_min between 0 and 240),     -- เวลาเผื่อหลังจบคิว (เก็บของ/เตรียมคิวถัดไป)
  max_per_day int check (max_per_day > 0),                                     -- จำกัดจำนวนคิวต่อวันของบริการนี้ (null = ไม่จำกัด)
  price_satang bigint check (price_satang >= 0),
  line_bookable bool not null default true,                                    -- ลูกค้าจองเองผ่าน LINE ได้
  active bool not null default true,
  sort int not null default 0
);
create table booking_service_resources (
  service_code text not null references booking_services on delete cascade,
  resource_id uuid not null references booking_resources on delete cascade,
  primary key (service_code, resource_id)
);

-- เวลาทำการรายสัปดาห์ · resource_id null = ใช้กับทุก resource ที่ไม่ได้ตั้งของตัวเองไว้ในวันนั้น
create table booking_hours (
  id bigserial primary key,
  resource_id uuid references booking_resources on delete cascade,
  weekday int not null check (weekday between 0 and 6),                -- 0 = อาทิตย์
  open_time time not null,
  close_time time not null,
  check (close_time > open_time)
);
create index on booking_hours (weekday);

-- วันหยุด/ปิดรับ · resource_id null = ปิดทั้งร้าน
create table booking_closures (
  id bigserial primary key,
  resource_id uuid references booking_resources on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text not null,
  check (to_date >= from_date)
);

create sequence booking_code_seq;
create table bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('BK-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMM') || '-' || lpad(nextval('booking_code_seq')::text, 4, '0')),
  client_id uuid references clients,
  customer_name text not null,
  service_code text not null references booking_services,
  resource_id uuid not null references booking_resources,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  busy_until timestamptz not null,                     -- ends_at + buffer · ใช้กันจองซ้อน
  day date generated always as ((starts_at at time zone 'Asia/Bangkok')::date) stored,
  status text not null default 'confirmed' check (status in ('held','confirmed','checked_in','in_service','done','cancelled','no_show','expired')),
  queue_no int,                                        -- เลขคิวของวัน (ออกตอนยืนยัน)
  source text not null check (source in ('line','staff','walkin','portal')),
  hold_expires_at timestamptz,
  note text,
  cancel_reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  reminded_at timestamptz,
  check (ends_at > starts_at and busy_until >= ends_at),
  check (status <> 'held' or hold_expires_at is not null),
  -- ห้ามจองซ้อน: resource เดียวกัน ช่วงเวลาทับกัน ขณะที่คิวยังมีผล
  constraint bookings_no_overlap exclude using gist (resource_id with =, tstzrange(starts_at, busy_until, '[)') with &&)
    where (status in ('held','confirmed','checked_in','in_service'))
);
create unique index bookings_day_queue on bookings (day, queue_no) where queue_no is not null;
create index on bookings (day, status);
create index on bookings (client_id, starts_at);
create index on bookings (status, hold_expires_at) where status = 'held';

-- ประวัติการเปลี่ยนสถานะ (append-only)
create table booking_events (
  id bigserial primary key,
  booking_id uuid not null references bookings,   -- ห้ามลบคิว (ใช้ยกเลิกแทน)
  from_status text,
  to_status text not null,
  actor text not null,
  note text,
  created_at timestamptz not null default now()
);
create rule booking_events_no_update as on update to booking_events do instead nothing;
create rule booking_events_no_delete as on delete to booking_events do instead nothing;

-- เปลี่ยนสถานะได้ตามลำดับเท่านั้น
create or replace function enforce_booking_status() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'held' and new.status in ('confirmed','cancelled','expired')) or
    (old.status = 'confirmed' and new.status in ('checked_in','cancelled','no_show')) or
    (old.status = 'checked_in' and new.status in ('in_service','confirmed','cancelled','no_show')) or
    (old.status = 'in_service' and new.status in ('done','checked_in')) or
    (old.status = 'no_show' and new.status = 'checked_in')
  ) then
    raise exception 'เปลี่ยนสถานะคิว % → % ไม่ได้', old.status, new.status;
  end if;
  return new;
end $$;
create trigger bookings_status before update of status on bookings for each row execute function enforce_booking_status();

-- สถานะสนทนาจองคิวใน LINE (ต่อ userId)
create table line_booking_sessions (
  line_user_id text primary key,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['booking_settings','booking_resources','booking_services','booking_service_resources','booking_hours','booking_closures','bookings','booking_events','line_booking_sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
