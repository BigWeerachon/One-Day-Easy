-- LINE Messaging API: ผูก userId กับลูกค้า · กันข้อความซ้ำ · สถานะการส่ง
alter table contacts add constraint contacts_channel_value_key unique (channel, value);
alter table messages
  add column external_id text unique,                 -- LINE message id (ขาเข้า) · กัน webhook ส่งซ้ำ
  add column delivery text not null default 'none'    -- ขาออก: none | pending | sent | failed
    check (delivery in ('none','pending','sent','failed')),
  add column delivery_error text;
alter table tasks add column payload jsonb;           -- เช่น { "message_id": 12, "to": "U..." }
