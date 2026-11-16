-- ขายในแชท LINE: รูปจากแชท (รูปร้าน / ภาพตัวอย่างเว็บที่ชอบ) · มัดจำ · ร่างเว็บอัตโนมัติ
alter table client_files drop constraint client_files_kind_check;
alter table client_files
  add constraint client_files_kind_check check (kind in ('photo','logo','ref')),
  add column source text not null default 'portal' check (source in ('portal','line')),
  add column line_message_id text unique,        -- กัน webhook ส่งรูปเดิมซ้ำ
  add column tagged bool not null default true;  -- รูปจากแชทรอให้ลูกค้าบอกว่าเป็นรูปร้านหรือภาพ ref
alter table jobs
  add column deposit_doc text references documents(no),   -- ใบแจ้งหนี้มัดจำ (ถ้ามี)
  add column draft_status text check (draft_status in ('running','done','failed')),
  add column draft_error text;
