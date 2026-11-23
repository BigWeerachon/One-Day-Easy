// ลูกค้าแก้เว็บเองหลังออนไลน์: รูป/ข้อความหน้าแรก · เมนู (เพิ่ม/แก้/ลบ/รูป) · เวลาเปิด · ย้อนกลับ · สิทธิ์ 1 ปี/ต่อค่าดูแล · ขอลิงก์ทาง LINE
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, act, chat, lineText, sql, val } from "./lib.mjs";

const C = "00000000-0000-0000-0000-0000000000c5"; // Moka House · ออนไลน์แล้ว · เทมเพลต T1 (มีเมนู)
const U = "Ue2emoka000000000000000000000001";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let editUrl, page;
const cfg = () => val(`select config from sites where client_id = $1`, [C]);
const ver = () => val(`select version from sites where client_id = $1`, [C]);
before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("ส่งลิงก์ Portal ให้ร้านที่ออนไลน์แล้ว → มีปุ่มแก้เว็บเอง → เปิดหน้าแก้เว็บบนมือถือได้", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/clients/${C}`);
  await act(p, p.getByRole("button", { name: "ส่งลิงก์ Portal" }));
  const url = (await p.locator(".note .mono").innerText()).trim();
  const { devices } = await import("playwright");
  page = await (await (await getBrowser()).newContext({ ...devices["iPhone 13"] })).newPage();
  await page.goto(url);
  await page.getByRole("link", { name: /แก้เว็บเอง/ }).click();
  await page.waitForURL(/\/edit$/);
  editUrl = page.url();
  assert.match(await page.locator("body").innerText(), /แก้เว็บของร้าน[\s\S]*แก้เองได้ถึง/);
});

// ทุกครั้งก่อนกรอก เปิดหน้าใหม่แบบไม่มี ?ok/?err เพื่อให้รอผลการบันทึกครั้งนี้ได้ถูก
const fresh = (p = page) => p.goto(editUrl);
const save = (name) => Promise.all([page.waitForURL(/[?&](ok|err)=/), page.getByRole("button", { name }).click()]);

test("แก้หน้าแรก: หัวข้อ คำโปรย รูปใหม่ → เว็บจริงเปลี่ยน · เก็บเวอร์ชันเดิม", async () => {
  const v = await ver();
  await fresh();
  await page.fill("#h-title", "Moka House สาขาใหม่");
  await page.fill("#h-sub", "กาแฟคั่วเอง ขนมอบทุกเช้า");
  await page.locator("input[name=image]").setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: PNG });
  await save("บันทึกหน้าแรก");
  assert.match(await page.locator(".pt-note").innerText(), /บันทึกหน้าแรกแล้ว/);
  const c = await cfg();
  assert.equal(c.hero.title, "Moka House สาขาใหม่");
  assert.equal(c.hero.subtitle, "กาแฟคั่วเอง ขนมอบทุกเช้า");
  assert.match(c.hero.image, /^file:\d+$/);
  assert.equal(c.hero.cta, "ดูเมนู", "ฟิลด์อื่นของหน้าแรกต้องอยู่ครบ");
  assert.equal(c.line.id, "@mokahouse", "บล็อกอื่นไม่ถูกแตะ");
  assert.equal(await ver(), v + 1);
  assert.equal(await val(`select actor from site_versions where version = $1 and site_id = (select id from sites where client_id = $2)`, [v, C]), "ลูกค้า (แก้เอง)");
  // หน้าเว็บจริงบน Engine ใช้ค่าใหม่ (แคชสูงสุด 30 วินาที)
  const slug = (await val(`select domain from sites where client_id = $1`, [C])).split(".")[0];
  assert.equal(slug, "mokahouse");
});

test("เมนู: เพิ่ม 2 รายการพร้อมรูป → แก้ราคา → ลบ · ราคาผิดไม่บันทึก", async () => {
  await fresh();
  await page.fill("input[name=name0]", "ลาเต้เย็น");
  await page.fill("input[name=price0]", "65");
  await page.locator("input[name=image0]").setInputFiles({ name: "latte.png", mimeType: "image/png", buffer: PNG });
  await page.fill("input[name=name1]", "ครัวซองต์");
  await page.fill("input[name=price1]", "1,200 บาท");
  await save("บันทึกเมนู");
  let items = (await cfg()).menu.items;
  assert.deepEqual(items.map((i) => [i.name, i.price]), [["ลาเต้เย็น", 65], ["ครัวซองต์", 1200]]);
  assert.match(items[0].img, /^file:\d+$/);
  assert.equal(items[1].img, undefined);
  // ราคาเป็นตัวหนังสือ → ไม่บันทึก แจ้งชื่อรายการ
  const before = await ver();
  await fresh();
  await page.fill("input[name=price1]", "แพง");
  await save("บันทึกเมนู");
  assert.match(await page.locator(".pt-err").innerText(), /"ครัวซองต์": ราคาไม่ถูกต้อง/);
  assert.equal(await ver(), before);
  // แก้ราคา + ลบรายการแรก · รายการที่เหลือไม่เสียรูป
  await fresh();
  await page.fill("input[name=price1]", "85");
  await page.locator("input[name=del0]").check();
  await save("บันทึกเมนู");
  items = (await cfg()).menu.items;
  assert.deepEqual(items.map((i) => [i.name, i.price]), [["ครัวซองต์", 85]]);
});

test("รูปของร้านอื่นใส่ไม่ได้ (แก้ฟอร์มเอง)", async () => {
  const other = await val(`insert into client_files (client_id, mime, bytes, kind) values ('00000000-0000-0000-0000-0000000000c1','image/png',$1,'photo') returning id`, [PNG]);
  await fresh();
  await page.locator("input[name=img0]").evaluate((el, v) => { el.value = v; }, `file:${other}`);
  await save("บันทึกเมนู");
  assert.match(await page.locator(".pt-err").innerText(), /รูปไม่ถูกต้อง/);
});

test("เวลาเปิด-ปิด → ย้อนกลับการแก้ล่าสุดได้ · งานของทีมย้อนไม่ได้", async () => {
  await fresh();
  await page.fill("#hr-days", "ทุกวัน ยกเว้นพุธ");
  await page.fill("#hr-open", "07:30");
  await page.fill("#hr-close", "18:00");
  await save("บันทึกเวลาเปิด-ปิด");
  await fresh();
  assert.deepEqual((await cfg()).hours, { days: "ทุกวัน ยกเว้นพุธ", open: "07:30", close: "18:00" });
  await save("ย้อนกลับการแก้ล่าสุด");
  assert.match(await page.locator(".pt-note").innerText(), /ย้อนกลับ/);
  assert.equal((await cfg()).hours, undefined);
  assert.equal((await cfg()).menu.items[0].name, "ครัวซองต์", "ย้อนเฉพาะครั้งล่าสุด");
  // การแก้ล่าสุดเป็นการย้อนกลับ ไม่ใช่การแก้ของลูกค้า → ไม่มีปุ่มย้อนอีก
  assert.equal(await page.getByRole("button", { name: "ย้อนกลับการแก้ล่าสุด" }).count(), 0);
});

test("เปิดสองแท็บ: แท็บเก่าบันทึกทับไม่ได้", async () => {
  const old = await (await (await getBrowser()).newContext()).newPage();
  await old.goto(editUrl);
  await fresh();
  await page.fill("#h-title", "ชื่อจากแท็บใหม่");
  await save("บันทึกหน้าแรก");
  await old.fill("#h-title", "ชื่อจากแท็บเก่า");
  await Promise.all([old.waitForURL(/[?&](ok|err)=/), old.getByRole("button", { name: "บันทึกหน้าแรก" }).click()]);
  assert.match(await old.locator(".pt-err").innerText(), /โหลดหน้าใหม่/);
  assert.equal((await cfg()).hero.title, "ชื่อจากแท็บใหม่");
});

test("ครบ 1 ปีหลังออนไลน์ → แก้เองไม่ได้ (เว็บยังออนไลน์) · ต่อค่าดูแลรายปีแล้วแก้ได้อีก", async () => {
  await sql(`update sites set live_at = now() - interval '400 day' where client_id = $1`, [C]);
  await page.goto(editUrl);
  assert.match(await page.locator("body").innerText(), /สิทธิ์แก้เว็บเองหมดแล้ว[\s\S]*ยังออนไลน์/);
  assert.equal(await page.getByRole("button", { name: "บันทึกหน้าแรก" }).count(), 0);
  // ชำระใบต่ออายุ (RN) → แก้ได้อีก 1 ปีนับจากวันชำระ
  await sql(`update documents set status = 'paid', paid_satang = total_satang where no = 'RN-2611-004'`);
  await sql(`insert into payments (doc_no, amount_satang, method) values ('RN-2611-004', 299000, 'test')`);
  await page.goto(editUrl);
  assert.equal(await page.getByRole("button", { name: "บันทึกหน้าแรก" }).count(), 1);
});

test("พิมพ์ \"แก้เว็บ\" ในแชท LINE → ได้ลิงก์หน้าแก้เว็บ · ร้านที่ยังไม่ออนไลน์ไม่ได้ลิงก์นี้", async () => {
  await sql(`insert into contacts (client_id, channel, value, name) values ($1,'LINE',$2,'Moka')`, [C, U]);
  const m = await chat(U, () => lineText(U, "แก้เมนูหน่อยค่ะ"));
  assert.match(m.text, /ลิงก์แก้เว็บของร้าน/);
  const url = m.text.match(/http\S+\/p\/[\w-]+\/edit/)[0];
  const p = await (await (await getBrowser()).newContext()).newPage();
  await p.goto(url);
  assert.equal(await p.getByRole("button", { name: "บันทึกหน้าแรก" }).count(), 1);
  // หมดสิทธิ์ → บอกวิธีต่อ แทนการส่งลิงก์
  await sql(`delete from payments where doc_no = 'RN-2611-004'`);
  const no = await chat(U, () => lineText(U, "แก้เว็บ"));
  assert.match(no.text, /สิทธิ์แก้เว็บเองหมดแล้ว/);
});
