// เต็นท์รถ: ฟอร์ม "ขายรถให้เรา" บนเว็บ → Engine ส่งต่อ Studio (ลงลายเซ็น) → บันทึก + แจ้งร้านทาง LINE → ร้านดู/อัปเดตสถานะใน Portal
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, chat, lineText, linePushes, waitFor, sql, val, mockPost } from "./lib.mjs";

const C = "00000000-0000-0000-0000-0000000000c5"; // ใช้ร้าน Moka House (ออนไลน์แล้ว) เป็นเต็นท์รถ
const U = "Ue2emoka000000000000000000000001";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
before(async () => {
  await resetDb();
  await sql(`update sites set template_version_id = (select id from template_versions where key = 'D1' and version = 1),
    config = config || '{"cars":{"items":[{"brand":"Toyota","model":"Yaris","year":2019,"mileage":52000,"price":359000}]},"sellcar":{"title":"ขายรถให้เรา","note":"ประเมินฟรี"}}'::jsonb where client_id = $1`, [C]);
  await sql(`insert into contacts (client_id, channel, value, name) values ($1,'LINE',$2,'Moka')`, [C, U]);
  await chat(U, () => lineText(U, "สวัสดีค่ะ")); // ร้านจริงทักมาทาง LINE ก่อนเสมอ (มีห้องแชท)
});
after(async () => { await closeBrowser(); await closeDb(); });

test("ไม่มีลายเซ็น → Studio ไม่รับ", async () => {
  const r = await fetch(`${URLS.studio}/api/leads`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  assert.equal(r.status, 403);
});

test("ลูกค้ากรอกฟอร์มขายรถบนมือถือ → บันทึกพร้อมรูป → ร้านได้ LINE ทันที", async () => {
  const { devices } = await import("playwright");
  const p = await (await (await getBrowser()).newContext({ ...devices["iPhone 13"] })).newPage();
  await p.goto(`${URLS.engine}/s/mokahouse`);
  await p.getByRole("link", { name: "ส่งข้อมูลรถ" }).click();
  await p.waitForURL(/\/s\/mokahouse\/sell$/);
  await p.getByLabel("ชื่อ", { exact: true }).fill("สมชาย ขายรถ");
  await p.getByLabel("เบอร์โทร").fill("081-234-5678");
  await p.getByLabel("จังหวัดที่รถอยู่").fill("นนทบุรี");
  await p.getByLabel("ยี่ห้อ").fill("Honda");
  await p.getByLabel("รุ่น").fill("City 1.0 Turbo");
  await p.getByLabel("ปีรถ (ค.ศ.)").fill("2021");
  await p.getByLabel("เลขไมล์ (กม.)").fill("40,000");
  await p.getByLabel("ออโต้").check();
  // รูปไม่ครบ → บอกชัดเจน ไม่ส่ง
  await p.getByRole("button", { name: "ส่งข้อมูลรถ" }).click();
  assert.match(await p.locator("form [role=alert]").innerText(), /แนบรูปรถ 4–10 รูป/);
  await p.locator("input[name=photos]").setInputFiles([1, 2, 3, 4].map((i) => ({ name: `car${i}.png`, mimeType: "image/png", buffer: PNG })));
  await p.getByRole("button", { name: "ส่งข้อมูลรถ" }).click();
  assert.match(await p.locator("form [role=alert]").innerText(), /ยอมรับการเก็บข้อมูล/);
  await p.getByLabel(/ยินยอมให้ร้านเก็บ/).check();
  await p.getByRole("button", { name: "ส่งข้อมูลรถ" }).click();
  await p.getByText("ส่งข้อมูลรถแล้ว").waitFor();

  const l = (await sql(`select id, name, phone, data, status, consent_at is not null consent, notified_at is not null notified, (select count(*)::int from lead_files f where f.lead_id = l.id) photos from site_leads l where client_id = $1`, [C]))[0];
  assert.equal(l.name, "สมชาย ขายรถ"); assert.equal(l.phone, "0812345678");
  assert.equal(l.data.brand, "Honda"); assert.equal(l.data.mileage, 40000); assert.equal(l.photos, 4);
  assert.ok(l.consent && l.notified); assert.equal(l.status, "new");
  const m = await waitFor(async () => (await linePushes(U)).find((x) => /Honda City/.test(x.text ?? "")));
  assert.match(m.text, /0812345678/);
});

test("พิมพ์ \"ดูข้อเสนอ\" ใน LINE → ลิงก์ Portal → เห็นรูป อัปเดตสถานะได้", async () => {
  const m = await chat(U, () => lineText(U, "ดูข้อเสนอ"));
  const url = m.text.match(/http\S+\/p\/[\w-]+\/leads/)[0];
  const p = await (await (await getBrowser()).newContext()).newPage();
  await p.goto(url);
  assert.match(await p.locator("body").innerText(), /Honda City 1\.0 Turbo 2021/);
  const img = p.getByRole("img", { name: "รูปรถที่ 1" });
  const r = await p.request.get(new URL(await img.getAttribute("src"), url).href);
  assert.equal(r.status(), 200);
  await p.getByLabel("สถานะ").selectOption("inspecting");
  await p.getByLabel("บันทึก (ไม่บังคับ)").fill("นัดดูรถเสาร์นี้");
  await p.getByRole("button", { name: "บันทึกสถานะ" }).click();
  await p.getByText("บันทึกแล้ว").waitFor();
  assert.equal(await val(`select status from site_leads where client_id = $1`, [C]), "inspecting");
  // รูปของร้านอื่นเปิดไม่ได้
  const bad = await p.request.get(url.replace(/\/leads$/, "/leads/file/999999"));
  assert.equal(bad.status(), 404);
});

test("LINE ส่งไม่ออก → ข้อมูลยังบันทึก แต่ไม่ถูกนับว่าแจ้งร้านแล้ว", async () => {
  await mockPost("line", "/__mode", "400");
  try {
    const { devices } = await import("playwright");
    const p = await (await (await getBrowser()).newContext({ ...devices["iPhone 13"] })).newPage();
    await p.goto(`${URLS.engine}/s/mokahouse/sell`);
    for (const [l, v] of [["ชื่อ", "สมหญิง"], ["เบอร์โทร", "0899999999"], ["จังหวัดที่รถอยู่", "ปทุมธานี"], ["ยี่ห้อ", "Mazda"], ["รุ่น", "2 Sport"], ["ปีรถ (ค.ศ.)", "2018"], ["เลขไมล์ (กม.)", "80000"]])
      await p.getByLabel(l, { exact: true }).fill(v);
    await p.getByLabel("ธรรมดา").check();
    await p.locator("input[name=photos]").setInputFiles([1, 2, 3, 4].map((i) => ({ name: `c${i}.png`, mimeType: "image/png", buffer: PNG })));
    await p.getByLabel(/ยินยอมให้ร้านเก็บ/).check();
    await p.getByRole("button", { name: "ส่งข้อมูลรถ" }).click();
    await p.getByText("ส่งข้อมูลรถแล้ว").waitFor();
    assert.equal(await val(`select notified_at is null from site_leads where phone = '0899999999'`), true, "ไม่ถึง LINE = ไม่ตั้ง notified_at");
  } finally { await mockPost("line", "/__mode", "ok"); }
});

test("ช่องกรอกและปุ่มบนหน้าขายรถสูงอย่างน้อย 44px", async () => {
  const p = await (await (await getBrowser()).newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await p.goto(`${URLS.engine}/s/mokahouse/sell`);
  const small = await p.locator("form input:not([type=checkbox]):not([type=radio]):not([type=hidden]), form textarea, form button, form label.check")
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(small, []);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "ไม่มีเลื่อนแนวนอนบนมือถือ");
});
