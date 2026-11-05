// จองคิวผ่านแชท LINE: จอง → ยืนยัน → ดูคิว → เลื่อน → ยกเลิก · วันปิด · แย่งคิว · ข้อความที่ไม่ใช่เรื่องคิว
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resetDb, closeDb, chat, lineText, linePostback, linePushes, quick, sql, val, cron, waitFor } from "./lib.mjs";

const U = "Ue2ebook0000000000000000000000001";
const U2 = "Ue2ebook0000000000000000000000002";
// วันพุธถัดไปที่ห่างจากวันนี้อย่างน้อย 2 วัน (เวลาไทย) · ร้านเปิด จ.–ส. 09:00–18:00 ใน seed
const bkkToday = new Date(Date.now() + 7 * 3600e3);
const wed = new Date(bkkToday); wed.setUTCDate(wed.getUTCDate() + 2); while (wed.getUTCDay() !== 3) wed.setUTCDate(wed.getUTCDate() + 1);
const ISO = wed.toISOString().slice(0, 10), DM = `${wed.getUTCDate()}/${wed.getUTCMonth() + 1}`;
const thu = new Date(wed); thu.setUTCDate(thu.getUTCDate() + 1); const THU = thu.toISOString().slice(0, 10);

before(async () => {
  await resetDb();
  await lineText(U, "สวัสดีค่ะ"); // สร้างลูกค้าก่อน (ข้อความทั่วไป บอทไม่ตอบ)
  await lineText(U2, "สวัสดีครับ");
});
after(closeDb);
// ผู้ให้บริการแยกสำหรับเทสต์ที่ใช้เวลา "ตอนนี้" · กันชนกับคิวตัวอย่างใน seed ไม่ว่ารันตอนกี่โมง
const freeResource = async () => (await sql(`insert into booking_resources (name) values ('e2e-' || gen_random_uuid()) returning id`))[0].id;

test("ข้อความทั่วไป → บอทไม่ตอบ และยังอยู่ในกล่องข้อความ (ยังไม่อ่าน)", async () => {
  await new Promise((r) => setTimeout(r, 800));
  assert.equal((await linePushes(U)).length, 0);
  assert.equal(await val(`select count(*)::int from messages m join conversations c on c.id = m.conversation_id join contacts ct on ct.client_id = c.client_id where ct.value = $1 and m.read_at is null`, [U]), 1);
});

test("หลายบริการ ไม่ระบุ → ถามบริการพร้อมปุ่ม", async () => {
  const m = await chat(U, () => lineText(U, "อยากจองคิวค่ะ"));
  assert.match(m.text, /บริการไหน/);
  assert.deepEqual(quick(m).map((a) => a.data), ["bk:svc:CONSULT", "bk:svc:ONEDAY", "bk:svc:PHOTO"]);
});

let bookingId;
test("ระบุบริการ วัน เวลา ที่ว่าง → กันที่ทันที → กดยืนยัน → ได้เลขคิว", async () => {
  const m = await chat(U, () => lineText(U, `ขอจองคิวปรึกษา ${DM} 10 โมงค่ะ`));
  assert.match(m.text, /กันที่ไว้ให้แล้ว/);
  assert.match(m.text, /10:00–10:30/);
  const ok = quick(m).find((a) => a.data.startsWith("bk:ok:"));
  bookingId = ok.data.split(":")[2];
  assert.equal(await val(`select status from bookings where id = $1`, [bookingId]), "held");
  const done = await chat(U, () => linePostback(U, ok.data));
  assert.match(done.text, /จองคิวสำเร็จ/);
  const b = (await sql(`select status, queue_no, source, to_char(starts_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') t from bookings where id = $1`, [bookingId]))[0];
  assert.deepEqual([b.status, b.source, b.t], ["confirmed", "line", `${ISO} 10:00`]);
  assert.ok(b.queue_no >= 1);
  // ข้อความที่บอทตอบแล้ว ถูกทำเป็นอ่านแล้ว
  assert.equal(await val(`select read_at is not null from messages where body = $1`, [`ขอจองคิวปรึกษา ${DM} 10 โมงค่ะ`]), true);
});

test("เวลาที่ขอไม่ว่าง → เสนอเวลาใกล้เคียง", async () => {
  // จองซ้อน 10:00 กับทั้ง 2 คน → เวลานี้ไม่ว่าง
  await sql(`insert into bookings (customer_name, service_code, resource_id, starts_at, ends_at, busy_until, status, source, created_by, queue_no)
    select 'block', 'CONSULT', id, ($1 || ' 10:00+07')::timestamptz, ($1 || ' 10:30+07')::timestamptz, ($1 || ' 10:40+07')::timestamptz, 'confirmed', 'staff', 'test', 90 + sort
    from booking_resources where id not in (select resource_id from bookings where id = $2)`, [ISO, bookingId]);
  const m = await chat(U2, () => lineText(U2, `ขอจองปรึกษา ${DM} 10 โมง`));
  assert.match(m.text, /ไม่ว่าง/);
  const times = quick(m).map((a) => a.label).filter((l) => /^\d\d:\d\d$/.test(l));
  assert.ok(times.length >= 2 && !times.includes("10:00"), times.join());
});

test("ถามวันว่าง (ไม่ระบุวัน) → แสดงวันที่ว่าง + ปุ่มวันถัดไป · ไม่มีวันอาทิตย์", async () => {
  const m = await chat(U2, () => lineText(U2, "ถ่ายรูปร้าน ว่างวันไหนบ้าง"));
  assert.match(m.text, /วันที่ว่างสำหรับ ถ่ายรูปร้าน/);
  const days = quick(m).filter((a) => a.data.startsWith("bk:day:PHOTO:")).map((a) => a.data.split(":")[3]);
  assert.ok(days.length >= 5);
  for (const d of days) assert.notEqual(new Date(d + "T00:00:00Z").getUTCDay(), 0, `${d} เป็นวันอาทิตย์`);
  assert.ok(quick(m).some((a) => a.data.startsWith("bk:more:")));
});

test("วันปิด/เกินช่วงจอง → บอกเหตุผลและเสนอวันอื่น", async () => {
  await sql(`insert into booking_closures (from_date, to_date, reason) values ($1, $1, 'ทีมไปอบรม')`, [THU]);
  const thuDM = `${thu.getUTCDate()}/${thu.getUTCMonth() + 1}`;
  const m = await chat(U2, () => lineText(U2, `จองปรึกษา ${thuDM}`));
  assert.match(m.text, /ปิดรับคิว \(ทีมไปอบรม\)/);
  assert.ok(quick(m).length > 0);
  const far = new Date(bkkToday); far.setUTCDate(far.getUTCDate() + 60);
  const m2 = await chat(U2, () => lineText(U2, `จองปรึกษา ${far.getUTCDate()}/${far.getUTCMonth() + 1}/${far.getUTCFullYear()}`));
  assert.match(m2.text, /ล่วงหน้าไม่เกิน 30 วัน/);
});

test("สองคนกดเวลาเดียวกันพร้อมกัน → ได้คนเดียว อีกคนได้ข้อความว่าไม่ว่าง", async () => {
  const t = new Date(`${ISO}T15:00:00+07:00`).getTime();
  const before1 = (await linePushes(U)).length, before2 = (await linePushes(U2)).length;
  await Promise.all([linePostback(U, `bk:slot:PHOTO:${t}`), linePostback(U2, `bk:slot:PHOTO:${t}`)]);
  await waitFor(async () => (await linePushes(U)).length > before1 && (await linePushes(U2)).length > before2);
  assert.equal(await val(`select count(*)::int from bookings where service_code = 'PHOTO' and starts_at = $1 and status = 'held'`, [new Date(t)]), 1);
  const replies = [(await linePushes(U)).at(-1).text, (await linePushes(U2)).at(-1).text];
  assert.equal(replies.filter((x) => /กันที่ไว้ให้แล้ว/.test(x)).length, 1);
  assert.equal(replies.filter((x) => /ไม่ว่าง|ถูกจองไป/.test(x)).length, 1);
});

test("กันที่แล้วไม่ยืนยัน → cron ปล่อยที่ (expired) · กดยืนยันทีหลังไม่ได้", async () => {
  const held = await val(`select id from bookings where status = 'held' limit 1`);
  const owner = await val(`select ct.value from bookings b join contacts ct on ct.client_id = b.client_id where b.id = $1`, [held]);
  await sql(`update bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [held]);
  const r = await (await cron("booking")).json();
  assert.ok(r.expired >= 1);
  assert.equal(await val(`select status from bookings where id = $1`, [held]), "expired");
  const m = await chat(owner, () => linePostback(owner, `bk:ok:${held}`));
  assert.match(m.text, /หมดเวลายืนยัน/);
});

test("คิวของฉัน → เลื่อนคิว → เลือกวัน/เวลาใหม่", async () => {
  const m = await chat(U, () => lineText(U, "คิวของฉัน"));
  assert.match(m.text, /คิวของคุณ/);
  const mv = quick(m).find((a) => a.data === `bk:mv:${bookingId}`);
  const days = await chat(U, () => linePostback(U, mv.data));
  assert.match(days.text, /เลือกวันใหม่/);
  const slots = await chat(U, () => linePostback(U, quick(days).find((a) => a.data.endsWith(ISO)).data));
  const pick = quick(slots).find((a) => a.data.startsWith(`bk:mvok:${bookingId}:`) && a.label === "13:00");
  const done = await chat(U, () => linePostback(U, pick.data));
  assert.match(done.text, /เลื่อนคิวแล้ว/);
  assert.equal(await val(`select to_char(starts_at at time zone 'Asia/Bangkok', 'HH24:MI') from bookings where id = $1`, [bookingId]), "13:00");
  assert.equal(await val(`select count(*)::int from booking_events where booking_id = $1 and note like 'เลื่อนจาก%'`, [bookingId]), 1);
});

test("ยกเลิกคิว → ถามยืนยัน → ยกเลิก", async () => {
  const ask = await chat(U, () => lineText(U, "ขอยกเลิกคิวค่ะ"));
  assert.match(ask.text, /ยืนยันยกเลิก/);
  const done = await chat(U, () => linePostback(U, quick(ask).find((a) => a.data.startsWith("bk:xq:")).data));
  assert.match(done.text, /ยกเลิกคิว BK-/);
  assert.equal(await val(`select status from bookings where id = $1`, [bookingId]), "cancelled");
});

test("ใกล้เวลานัดเกินกำหนด → ยกเลิกเองไม่ได้", async () => {
  const id = (await sql(`insert into bookings (client_id, customer_name, service_code, resource_id, starts_at, ends_at, busy_until, status, queue_no, source, created_by)
    select ct.client_id, 'x', 'CONSULT', $2::uuid, now() + interval '1 hour', now() + interval '90 minute', now() + interval '100 minute', 'confirmed', 77, 'line', 'test'
    from contacts ct where ct.value = $1 returning id`, [U2, await freeResource()]))[0].id;
  const m = await chat(U2, () => linePostback(U2, `bk:xq:${id}`));
  assert.match(m.text, /ยกเลิกเองได้ถึง/);
  assert.equal(await val(`select status from bookings where id = $1`, [id]), "confirmed");
});

test("ปุ่มของลูกค้าคนอื่นใช้ไม่ได้", async () => {
  const other = await val(`select id from bookings where client_id is not null and client_id <> (select client_id from contacts where value = $1) and status = 'confirmed' limit 1`, [U]);
  const m = await chat(U, () => linePostback(U, `bk:xq:${other}`));
  assert.match(m.text, /ไม่พบคิวนี้/);
});

test("ปิดจองผ่าน LINE → บอทเงียบ ข้อความเข้ากล่องข้อความ", async () => {
  await sql(`update booking_settings set line_enabled = false`);
  const n = (await linePushes(U)).length;
  await lineText(U, "จองคิวพรุ่งนี้");
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal((await linePushes(U)).length, n);
  await sql(`update booking_settings set line_enabled = true`);
});

test("cron ส่งเตือนก่อนถึงคิวครั้งเดียว", async () => {
  const id = (await sql(`insert into bookings (client_id, customer_name, service_code, resource_id, starts_at, ends_at, busy_until, status, queue_no, source, created_by, created_at)
    select ct.client_id, 'x', 'CONSULT', $2::uuid, now() + interval '5 hour', now() + interval '330 minute', now() + interval '340 minute', 'confirmed', 78, 'line', 'test', now() - interval '3 day'
    from contacts ct where ct.value = $1 returning id`, [U2, await freeResource()]))[0].id;
  await cron("booking");
  await cron("booking");
  assert.ok(await val(`select reminded_at is not null from bookings where id = $1`, [id]));
  assert.equal((await linePushes(U2)).filter((m) => /แจ้งเตือนคิว/.test(m.text)).length, 1);
});
