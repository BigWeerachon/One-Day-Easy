-- ลูกค้าแก้เว็บเองได้ 1 ปีนับจากวันเว็บออนไลน์ (ต่อได้ด้วยค่าดูแลรายปี)
alter table sites add column live_at timestamptz;
update sites set live_at = now() where status in ('live','down') and live_at is null;
