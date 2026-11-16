-- เพิ่ม Agent 2 ตำแหน่ง: Design (กำหนดหน้าตาเว็บจากภาพ ref/รูปร้าน) · Dev (ตรวจทางเทคนิคว่าหน้าเว็บเปิดได้จริง)
alter table agent_runs drop constraint agent_runs_agent_check;
alter table agent_runs add constraint agent_runs_agent_check check (agent in ('sales','intake','design','builder','qa','dev','ops'));
alter table jobs add column design_brief jsonb;         -- ผลของ Design Agent: เทมเพลต สี ฟอนต์ โทนภาษา รูปหน้าแรก เหตุผล
alter table sites add column checked_at timestamptz, add column check_error text;   -- Dev Agent ตรวจเว็บที่ออนไลน์แล้ว
