-- One Day Easy · Studio core schema (Architecture v2 · 19 tables)
create type job_stage as enum ('new_chat','intake','template','client_review','invoice','payment','online','care','paused');
create type actor_kind as enum ('system','human','client');
create type doc_type as enum ('QT','INV','RC','RN','CN');

create table clients (id uuid primary key default gen_random_uuid(), name text not null, kind text, status text not null default 'lead' check (status in ('lead','active','care')), package text, tax_id text, address text, color text not null default '#4f46e5', contact_name text, channel text not null default 'LINE' check (channel in ('LINE','Email','Web','FB','Phone')), last_contact_at timestamptz default now(), created_at timestamptz default now());
create table contacts (id uuid primary key default gen_random_uuid(), client_id uuid not null references clients on delete cascade, channel text not null check (channel in ('LINE','Email','Web','FB','Phone')), value text not null, name text);
create table sites (id uuid primary key default gen_random_uuid(), client_id uuid not null references clients, domain text unique, template text not null, status text not null default 'draft', version int not null default 1, config jsonb not null default '{}');
create table site_versions (id bigserial primary key, site_id uuid not null references sites, version int not null, config jsonb not null, actor text, note text, created_at timestamptz default now(), unique (site_id, version));
create table jobs (id uuid primary key default gen_random_uuid(), client_id uuid not null references clients, title text not null, site_id uuid references sites, stage job_stage not null default 'new_chat', paused_from job_stage, template text, checks_passed int not null default 0 check (checks_passed between 0 and 6), checklist_done bool not null default false, pdpa_consent bool not null default false, approved bool not null default false, edit_rounds int not null default 0, assignee text, sla_due_at timestamptz, created_at timestamptz default now());
create table conversations (id uuid primary key default gen_random_uuid(), client_id uuid not null unique references clients, channel text not null);
create table messages (id bigserial primary key, conversation_id uuid not null references conversations, sender text not null check (sender in ('client','team','system')), body text, read_at timestamptz, created_at timestamptz default now());
create table files (id uuid primary key default gen_random_uuid(), client_id uuid references clients, path text not null, mime text, created_at timestamptz default now());
create table catalog_items (code text primary key, name text not null, price_satang bigint not null check (price_satang >= 0), recurring bool not null default false, active bool not null default true);
create table doc_sequences (type doc_type, period text, last int not null default 0, primary key (type, period));
create table documents (no text primary key, type doc_type not null, client_id uuid not null references clients, job_id uuid references jobs, total_satang bigint not null check (total_satang >= 0), paid_satang bigint not null default 0, status text not null default 'issued' check (status in ('draft','issued','paid','voided','expired')), revision int not null default 1, issued_at date not null default current_date, expires_at date);
create table document_revisions (id bigserial primary key, doc_no text not null references documents, revision int not null, snapshot jsonb not null, pdf_path text, hash text, reason text, created_at timestamptz default now());
create table document_events (id bigserial primary key, doc_no text not null references documents, kind text not null check (kind in ('issued','sent','viewed','accepted','paid','voided')), created_at timestamptz default now());
create table payments (id bigserial primary key, doc_no text not null references documents, amount_satang bigint not null, method text, created_at timestamptz default now());
create table slips (id bigserial primary key, doc_no text not null references documents, amount_satang bigint not null, image_path text, status text not null default 'pending' check (status in ('pending','verified','rejected')), verified_by text, created_at timestamptz default now());
create table events (id bigserial primary key, name text not null, job_id uuid references jobs, actor text not null, source text not null check (source in ('human','system')), before jsonb, after jsonb, created_at timestamptz default now());
create table lessons (id bigserial primary key, problem text, cause text, fix text, auto_check text, created_at timestamptz default now());
create table client_notes (id bigserial primary key, client_id uuid not null references clients, note text not null, created_at timestamptz default now());
create table workflow_runs (id uuid primary key default gen_random_uuid(), job_id uuid references jobs, started_at timestamptz default now());
create table tasks (id bigserial primary key, run_id uuid references workflow_runs, job_id uuid references jobs, name text not null, idempotency_key text unique not null, attempts int not null default 0, status text not null default 'queued' check (status in ('queued','running','done','failed','dead')), last_error text, run_after timestamptz default now());
create table runbooks (id bigserial primary key, problem text not null, steps text not null);
create table decisions (code text primary key, title text not null, status text not null default 'approved', decided_at date);

-- P2: append-only events & documents history
create rule events_no_update as on update to events do instead nothing;
create rule events_no_delete as on delete to events do instead nothing;
create rule docrev_no_update as on update to document_revisions do instead nothing;

-- N4: allowed transitions — DB rejects anything not in this table
create table stage_transitions (from_stage job_stage, to_stage job_stage, actor actor_kind, condition text, primary key (from_stage, to_stage, actor));
insert into stage_transitions values
 ('new_chat','intake','system','สร้าง client แล้ว'), ('intake','template','system','เช็กลิสต์ครบ + ยินยอม PDPA'),
 ('template','client_review','human','ตรวจผ่าน 6/6'), ('client_review','template','client','ขอแก้ · นับรอบ'),
 ('client_review','invoice','client','กดอนุมัติ'), ('invoice','payment','system','ใบแจ้งหนี้ออกแล้ว'),
 ('payment','online','system','ชำระครบ + อนุมัติแล้ว'), ('online','care','system','ครบ 11 เดือน');

create or replace function enforce_job_transition() returns trigger language plpgsql as $$
declare unpaid int;
begin
  if new.stage = old.stage then return new; end if;
  if new.stage = 'paused' then new.paused_from := old.stage; return new; end if;
  if old.stage = 'paused' and new.stage = old.paused_from then new.paused_from := null; return new; end if;
  if not exists (select 1 from stage_transitions where from_stage = old.stage and to_stage = new.stage) then
    raise exception 'transition % -> % not allowed', old.stage, new.stage;
  end if;
  if new.stage = 'template' and old.stage = 'intake' and not (new.checklist_done and new.pdpa_consent) then raise exception 'checklist/PDPA incomplete'; end if;
  if new.stage = 'client_review' and new.checks_passed < 6 then raise exception 'checks % /6', new.checks_passed; end if;
  if new.stage = 'online' then
    select count(*) into unpaid from documents where job_id = new.id and type = 'INV' and status <> 'voided' and paid_satang < total_satang;
    if unpaid > 0 or not new.approved then raise exception 'not fully paid/approved'; end if;
  end if;
  if old.stage = 'client_review' and new.stage = 'template' then new.edit_rounds := old.edit_rounds + 1; end if;
  return new;
end $$;
create trigger jobs_transition before update of stage on jobs for each row execute function enforce_job_transition();

-- P1: document number allocated inside the transaction (e.g. INV-2611-008)
create or replace function next_doc_no(t doc_type) returns text language plpgsql as $$
declare p text := to_char(now(), 'YYMM'); n int;
begin
  insert into doc_sequences values (t, p, 1) on conflict (type, period) do update set last = doc_sequences.last + 1 returning last into n;
  return t || '-' || p || '-' || lpad(n::text, 3, '0');
end $$;

-- M1: RLS on — only authenticated staff
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', r.tablename);
    execute format('create policy staff_all on %I for all to authenticated using (true) with check (true)', r.tablename);
  end loop;
end $$;
