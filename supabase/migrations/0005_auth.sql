-- ล็อกอินทีม + สิทธิ์ตามบทบาท
create table staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null,
  role text not null check (role in ('owner','builder','accountant')),
  password_hash text not null,                 -- scrypt$N$r$p$salt$hash
  active bool not null default true,
  must_change_password bool not null default false,
  created_at timestamptz default now()
);
create table staff_sessions (
  token_hash text primary key,                 -- sha256 ของ token ในคุกกี้ · ไม่เก็บ token จริง
  staff_id uuid not null references staff on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index on staff_sessions (staff_id);
create table login_attempts (
  email text primary key,
  failures int not null default 0,
  locked_until timestamptz
);
alter table staff enable row level security;
alter table staff_sessions enable row level security;
alter table login_attempts enable row level security;
-- ไม่มี policy = role authenticated อ่านไม่ได้ · แอปใช้ connection ฝั่ง server เท่านั้น
