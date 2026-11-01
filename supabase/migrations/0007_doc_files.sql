-- hash ของ PDF ที่ออกจริงต่อรอบเอกสาร (P2) · แยกจาก document_revisions ซึ่ง append-only (update ไม่ได้)
create table document_files (
  doc_no text not null references documents,
  revision int not null,
  sha256 text not null,
  bytes int not null,
  created_at timestamptz default now(),
  primary key (doc_no, revision)
);
-- append-only ด้วย trigger (rule ใช้กับ insert ... on conflict ไม่ได้)
create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create trigger document_files_append_only before update or delete on document_files for each row execute function forbid_change();
alter table document_files enable row level security;
