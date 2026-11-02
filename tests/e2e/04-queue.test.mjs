// หน้าคิว & ตารางงาน (ทีม): รันคิว · จองให้ลูกค้า · walk-in · ยกเลิก · ตารางสัปดาห์ · ตั้งค่า · กฎในฐานข้อมูล
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, loginAs, act, sql, val, errorText } from "./lib.mjs";

const bkk = new Date(Date.now() + 7 * 3600e3);
const wed = new Date(bkk); wed.setUTCDate(wed.getUTCDate() + 2); while (wed.getUTCDay() !== 3) wed.setUTCDate(wed.getUTCDate() + 1);
const ISO = wed.toISOString().slice(0, 10);
const MIN = "b0000000-0000-4000-8000-000000000001", BIG = "b0000000-0000-4000-8000-000000000002";
const status = (name) => val(`select status from bookings where customer_name = $1 order by created_at desc limit 1`, [name]);

before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("KPI และหน้างานแสดงตามข้อมูลวันนี้", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue`);
  assert.equal(await errorText(p), null);
  const kpi = async (label) => (await p.locator(".kpi", { hasText: label }).locator(".v").innerText()).trim();
  assert.equal(await kpi("คิวทั้งหมด"), "6");
  assert.equal(await kpi("มาถึงแล้ว"), "2");
  assert.equal(await kpi("กำลังให้บริการ"), "2");
  assert.match(await p.locator(".col", { hasText: "มิ้น" }).innerText(), /คิว 2/);
});

test("เสร็จ → เรียกคิวถัดไป (เรียงตามเวลานัด) → เสร็จ", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/queue`);
  const card = () => p.locator(".col", { hasText: "มิ้น" });
  await act(p, card().getByRole("button", { name: "เสร็จ" }));
  assert.equal(await status("Lumière Clinic"), "done");
  await act(p, card().getByRole("button", { name: "เรียกคิวถัดไป" }));
  assert.equal(await status("ร้านข้าวมันไก่เจ๊หมวย"), "in_service");
  assert.match(await card().innerText(), /คิว 3/);
  // ไม่มีคนรอแล้ว → ปุ่มเรียกคิวกดไม่ได้หลังเสร็จ
  await act(p, card().getByRole("button", { name: "เสร็จ" }));
  assert.ok(await card().getByRole("button", { name: "เรียกคิวถัดไป" }).isDisabled());
});

test("มาถึงแล้ว → เริ่มให้บริการ ผ่านตาราง · ไม่มา", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue`);
  const row = () => p.locator("tr", { hasText: "แอร์ดีเซอร์วิส" });
  await act(p, row().getByRole("button", { name: "มาถึงแล้ว" }));
  assert.equal(await status("แอร์ดีเซอร์วิส"), "checked_in");
  await act(p, row().getByRole("button", { name: "ไม่มา" }));
  assert.equal(await status("แอร์ดีเซอร์วิส"), "no_show");
  assert.ok(await val(`select count(*)::int from booking_events e join bookings b on b.id = e.booking_id where b.customer_name = 'แอร์ดีเซอร์วิส'`) >= 2);
});

test("ยกเลิกต้องใส่เหตุผล และบันทึกเหตุผล", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue`);
  const row = p.locator("tr", { hasText: "คุณนก" });
  await row.locator("summary", { hasText: "ยกเลิก" }).click();
  await row.locator("input[name=reason]").fill("ลูกค้าขอเลื่อนเอง");
  await act(p, row.getByRole("button", { name: "ยืนยันยกเลิก" }));
  assert.equal(await val(`select status || '|' || cancel_reason from bookings where customer_name = 'คุณนก (walk-in)'`), "cancelled|ลูกค้าขอเลื่อนเอง");
});

test("ทีมจองคิวให้ลูกค้า (เลือกบริการ → เวลาว่าง → จอง)", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/queue?day=${ISO}&svc=PHOTO`);
  const slot = await p.locator("select[name=slot] option").first().getAttribute("value");
  await p.selectOption("select[name=client]", { label: "ครัวป้าแดง" });
  await p.fill("input[name=note]", "ถ่ายเมนูใหม่");
  await act(p, p.getByRole("button", { name: "จองคิว", exact: true }));
  assert.equal(await errorText(p), null);
  const b = (await sql(`select status, source, queue_no, service_code, note, starts_at from bookings where customer_name = 'ครัวป้าแดง' and day = $1`, [ISO]))[0];
  assert.deepEqual([b.status, b.source, b.service_code, b.note], ["confirmed", "staff", "PHOTO", "ถ่ายเมนูใหม่"]);
  assert.equal(b.starts_at.getTime(), Number(slot));
  assert.equal(b.queue_no, 1);
  // เวลานั้นหายจากตัวเลือก
  await p.goto(`${URLS.studio}/queue?day=${ISO}&svc=PHOTO`);
  assert.equal(await p.locator(`select[name=slot] option[value="${slot}"]`).count(), 0);
});

test("รับ walk-in ตอนนี้ → มาถึงแล้วทันที (แทรกคิวได้)", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue`);
  await p.fill("input[placeholder='ชื่อลูกค้า walk-in']", "ลูกค้าเดินเข้า");
  await p.locator("form", { hasText: "รับ walk-in" }).locator("input[name=force]").check();
  await act(p, p.getByRole("button", { name: "รับ walk-in ตอนนี้" }));
  assert.equal(await errorText(p), null);
  assert.equal(await status("ลูกค้าเดินเข้า"), "checked_in");
});

test("ตารางสัปดาห์แสดงคิวและวันปิด", async () => {
  await sql(`insert into booking_closures (resource_id, from_date, to_date, reason) values ($1, $2, $2, 'ลาพักร้อน')`, [BIG, ISO]);
  const p = await loginAs("accountant");
  await p.goto(`${URLS.studio}/queue?view=week&day=${ISO}`);
  const big = p.locator("tr", { hasText: "Big" });
  assert.match(await big.innerText(), /ลาพักร้อน/);
  assert.match(await p.locator("tr", { hasText: "มิ้น" }).innerText(), /ครัวป้าแดง/);
});

test("ตั้งค่า: เพิ่มบริการ · เวลาทำการ · วันหยุด · กฎการจอง (owner เท่านั้น)", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue?view=setup`);
  const svc = p.locator("form", { hasText: "บันทึกบริการ" });
  await svc.locator("input[name=code]").fill("NAILS");
  await svc.locator("input[name=name]").fill("ทำเล็บ");
  await svc.locator("input[name=durationMin]").fill("45");
  await svc.locator("input[name=maxPerDay]").fill("5");
  await act(p, svc.getByRole("button", { name: "บันทึกบริการ" }));
  assert.equal(await errorText(p), null);
  assert.equal(await val(`select duration_min || '/' || max_per_day || '/' || (select count(*) from booking_service_resources where service_code = 'NAILS') from booking_services where code = 'NAILS'`), "45/5/2");
  // รหัสผิดรูปแบบ
  await svc.locator("input[name=code]").fill("ผิด");
  await svc.locator("input[name=name]").fill("x");
  await act(p, svc.getByRole("button", { name: "บันทึกบริการ" }));
  assert.match(await errorText(p), /รหัสบริการ/);
  // เวลาปิดก่อนเปิด
  const hours = p.locator("form", { hasText: "เพิ่มช่วงเวลา" });
  await hours.locator("input[name=open]").fill("18:00"); await hours.locator("input[name=close]").fill("09:00");
  await act(p, hours.getByRole("button", { name: "เพิ่มช่วงเวลา" }));
  assert.match(await errorText(p), /เวลาปิดต้องหลังเวลาเปิด/);
  // กฎ
  const rules = p.locator("form", { hasText: "เปิดให้จองผ่านแชท LINE" });
  await rules.locator("input[name=holdMin]").fill("15");
  await act(p, rules.getByRole("button", { name: "บันทึก" }));
  assert.equal(await val(`select hold_min from booking_settings`), 15);
  // builder ไม่เห็นแท็บตั้งค่า
  const b = await loginAs("builder");
  await b.goto(`${URLS.studio}/queue?view=setup`);
  assert.equal(await b.locator("form", { hasText: "บันทึกบริการ" }).count(), 0);
});

test("ฐานข้อมูลกันจองซ้อนและกันสถานะข้ามขั้น", async () => {
  const ins = (start, end) => sql(`insert into bookings (customer_name, service_code, resource_id, starts_at, ends_at, busy_until, status, source, created_by) values ('dbtest','CONSULT',$1,$2,$3,$3,'confirmed','staff','t') returning id`, [MIN, start, end]);
  const [a] = await ins(`${ISO} 16:00+07`, `${ISO} 16:30+07`);
  await assert.rejects(ins(`${ISO} 16:15+07`, `${ISO} 16:45+07`), /bookings_no_overlap/);
  await assert.rejects(sql(`update bookings set status = 'done' where id = $1`, [a.id]), /เปลี่ยนสถานะคิว/);
  await sql(`update bookings set status = 'cancelled' where id = $1`, [a.id]);
  await ins(`${ISO} 16:15+07`, `${ISO} 16:45+07`); // คิวที่ยกเลิกแล้วไม่กันเวลา
  await sql(`delete from booking_events`); // rule "do instead nothing" → ลบไม่ได้
  assert.ok(await val(`select count(*)::int from booking_events`) > 0);
});
