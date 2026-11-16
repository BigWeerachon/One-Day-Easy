-- ทีม Agent: บันทึกทุกครั้งที่ Agent ทำงาน (ตรวจย้อนหลังได้ · คิดค่าใช้จ่ายต่อเว็บ) + สถานะงานฝั่ง Agent
create table agent_runs (
  id bigserial primary key,
  job_id uuid references jobs,
  client_id uuid references clients,
  agent text not null check (agent in ('sales','intake','builder','qa','ops')),
  outcome text not null,                       -- เช่น pass, fail, fixed, asked, replied, handoff, escalated, error
  detail jsonb not null default '{}',
  model text, input_tokens int not null default 0, output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index on agent_runs (job_id, id desc);
create index on agent_runs (created_at desc);
create rule agent_runs_no_update as on update to agent_runs do instead nothing;
create rule agent_runs_no_delete as on delete to agent_runs do instead nothing;

alter table jobs
  add column agent_status text check (agent_status in ('running','waiting_customer','needs_human','sent')),
  add column agent_note text,
  add column followed_up_at timestamptz;

-- QA Agent ผ่านแล้วส่งให้ลูกค้าตรวจเองได้ (เดิมต้องเป็นคนกด)
insert into stage_transitions values ('template','client_review','system','QA Agent ตรวจผ่าน + ตรวจผ่าน 6/6');

alter table agent_runs enable row level security;
create policy staff_all on agent_runs for all to authenticated using (true) with check (true);
