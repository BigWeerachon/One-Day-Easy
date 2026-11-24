// ระบบเทมเพลตสำเร็จรูป: ประกอบ → ตรวจอัตโนมัติ → Owner อนุมัติ → ล็อก · ใช้กับเว็บ/อัปเกรดทีละร้าน · ลูกค้าแก้ทุกบล็อก เปิด/ปิดบล็อก โลโก้
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, act, sql, val, engineGet } from "./lib.mjs";

const C = "00000000-0000-0000-0000-0000000000c5"; // Moka House · ออนไลน์แล้ว
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const cfg = () => val(`select config from sites where client_id = $1`, [C]);
before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

let owner, newId;
test("เทมเพลตตั้งต้น 2 ชุดอนุมัติแล้ว · Builder สร้างร่างได้แต่อนุมัติไม่ได้", async () => {
  owner = await loginAs("owner");
  await owner.goto(`${URLS.studio}/templates`);
  const body = await owner.locator("main, body").first().innerText();
  assert.match(body, /R1 v1[\s\S]*ครัวไทยสีสด/);
  assert.match(body, /C1 v1[\s\S]*คาเฟ่อบอุ่น/);

  const b = await loginAs("builder");
  await b.goto(`${URLS.studio}/templates?new=1`);
  await b.fill("input[name=name]", "ร้านข้าวมันไก่");
  await act(b, b.getByRole("button", { name: "บันทึกร่าง" }));
  newId = new URL(b.url()).searchParams.get("id");
  assert.ok(newId, "ไปหน้าร่างใหม่");
  await act(b, b.getByRole("button", { name: "ตรวจ" }));
  assert.match(await b.locator("body").innerText(), /มีบล็อกบังคับครบ/);
  assert.equal(await b.getByRole("button", { name: /อนุมัติ/ }).count(), 0, "Builder ไม่มีปุ่มอนุมัติ");
});

test("ร่างที่ขาดบล็อกบังคับไม่ผ่านการตรวจ · Owner อนุมัติไม่ได้จนกว่าจะแก้", async () => {
  await owner.goto(`${URLS.studio}/templates?id=${newId}`);
  await owner.getByRole("checkbox", { name: "ใช้บล็อกแผนที่" }).uncheck();
  await act(owner, owner.getByRole("button", { name: "บันทึกร่าง" }));
  await act(owner, owner.getByRole("button", { name: "ตรวจ" }));
  assert.match(await owner.locator("body").innerText(), /✗ ไม่ผ่าน มีบล็อกบังคับครบ · map/);
  assert.ok(await owner.getByRole("button", { name: "อนุมัติและล็อกเวอร์ชันนี้" }).isDisabled());

  await owner.getByRole("checkbox", { name: "ใช้บล็อกแผนที่" }).check();
  await owner.getByLabel("หน้าตาของเมนู").selectOption("list");
  await act(owner, owner.getByRole("button", { name: "บันทึกร่าง" }));
  await act(owner, owner.getByRole("button", { name: "ตรวจ" }));
  assert.doesNotMatch(await owner.locator("body").innerText(), /✗ ไม่ผ่าน/);
  await act(owner, owner.getByRole("button", { name: "อนุมัติและล็อกเวอร์ชันนี้" }));
  assert.match(await owner.locator("body").innerText(), /อนุมัติแล้ว เทมเพลตเวอร์ชันนี้ถูกล็อก/);
  const row = (await sql(`select key, version, status, spec from template_versions where id = $1`, [newId]))[0];
  assert.deepEqual([row.key, row.version, row.status], ["R2", 1, "approved"]);
  assert.equal(row.spec.blocks.find((x) => x.type === "menu").variant, "list");
});

test("เวอร์ชันที่อนุมัติแล้วแก้ทับไม่ได้ (ทั้งหน้าจอและฐานข้อมูล) · แก้ต่อ = เวอร์ชันใหม่", async () => {
  assert.equal(await owner.getByRole("button", { name: "บันทึกร่าง" }).count(), 0);
  await assert.rejects(sql(`update template_versions set spec = '{}' where id = $1`, [newId]), /อนุมัติแล้ว แก้ไม่ได้/);
  await assert.rejects(sql(`delete from template_versions where id = $1`, [newId]), /ลบเทมเพลตที่อนุมัติแล้วไม่ได้/);
  await owner.getByRole("link", { name: "สร้างเวอร์ชันใหม่จากอันนี้" }).click();
  await owner.waitForURL(/from=/);
  await act(owner, owner.getByRole("button", { name: "บันทึกร่าง" }));
  assert.equal(await val(`select max(version) from template_versions where key = 'R2'`), 2);
});

test("ใช้เทมเพลตกับเว็บ: ขาดข้อมูลบล็อกบังคับ → ไม่ให้เปลี่ยน · ครบ → เว็บจริงเปลี่ยนหน้าตาตามเทมเพลต", async () => {
  const c1 = await val(`select id::text from template_versions where key = 'C1'`);
  await owner.goto(`${URLS.studio}/templates?id=${c1}`);
  await owner.getByLabel("เลือกเว็บที่จะใช้เทมเพลตนี้").selectOption(await val(`select id::text from sites where client_id = $1`, [C]));
  await act(owner, owner.getByRole("button", { name: "ใช้เทมเพลตนี้กับเว็บ" }));
  assert.match(await owner.locator(".err").innerText(), /ยังไม่มีข้อมูลของบล็อกบังคับ/);
  assert.equal(await val(`select template_version_id from sites where client_id = $1`, [C]), null);

  await sql(`update sites set config = config || $2 where client_id = $1`, [C, JSON.stringify({
    menu: { items: [{ name: "ลาเต้เย็น", price: 65 }] }, hours: { days: "ทุกวัน", open: "07:30", close: "18:00" },
    map: { lat: 13.75, lng: 100.5, address: "ริมคลอง" }, reviews: { rating: 4.8, count: 20, items: [{ name: "มิน", text: "อร่อยมาก" }] },
  })]);
  await owner.goto(`${URLS.studio}/templates?id=${c1}`);
  await owner.getByLabel("เลือกเว็บที่จะใช้เทมเพลตนี้").selectOption(await val(`select id::text from sites where client_id = $1`, [C]));
  await act(owner, owner.getByRole("button", { name: "ใช้เทมเพลตนี้กับเว็บ" }));
  assert.match(await owner.locator(".note").innerText(), /เปลี่ยนเทมเพลตของเว็บแล้ว/);
  const html = (await engineGet("mokahouse.com")).body;
  assert.match(html, /class="vlist"/, "C1 ใช้เมนูแบบรายการ");
  assert.match(html, /--p:#7a4a2a/i, "สีจากชุดสีของเทมเพลต");
});

let page, editUrl;
test("ลูกค้า: แก้รีวิว · ซ่อนรีวิวได้แต่ซ่อนบล็อกบังคับไม่ได้ · ใส่โลโก้", async () => {
  await owner.goto(`${URLS.studio}/clients/${C}`);
  await act(owner, owner.getByRole("button", { name: "ส่งลิงก์ Portal" }));
  const url = (await owner.locator(".note .mono").innerText()).trim();
  page = await (await (await getBrowser()).newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(url.replace(/\/?$/, "/edit"));
  editUrl = page.url();
  const save = (name) => Promise.all([page.waitForURL(/[?&](ok|err)=/), page.getByRole("button", { name }).click()]);

  await page.getByLabel("รีวิวที่ 1 ข้อความ").fill("กาแฟหอมมาก บรรยากาศดี");
  await page.getByLabel("รีวิวที่ 2 ชื่อผู้รีวิว").fill("ต้น");
  await page.getByLabel("รีวิวที่ 2 ข้อความ").fill("ขนมอร่อย");
  await save("บันทึกรีวิว");
  assert.match(await page.locator(".pt-note").innerText(), /บันทึกแล้ว/);
  assert.deepEqual((await cfg()).reviews.items.map((r) => r.text), ["กาแฟหอมมาก บรรยากาศดี", "ขนมอร่อย"]);

  await page.goto(editUrl);
  await page.getByLabel("รีวิวที่ 2 ข้อความ").fill("");
  await save("บันทึกรีวิว");
  assert.match(await page.locator(".pt-err").innerText(), /รีวิวที่ 2: ต้องใส่ข้อความ/);

  await page.goto(editUrl);
  assert.ok(await page.getByRole("checkbox", { name: /หน้าแรก \(จำเป็น\)/ }).isDisabled());
  await page.getByRole("checkbox", { name: "รีวิว", exact: true }).uncheck();
  await save("บันทึกการเปิด/ปิด");
  assert.deepEqual((await cfg()).hidden, ["reviews"]);
  // ปลอมฟอร์มให้ซ่อนหน้าแรกก็ไม่ได้: ระบบเก็บเฉพาะบล็อกที่ไม่บังคับ
  const html = (await engineGet("mokahouse.com", "/s/mokahouse")).body; // คนละแคชกับหน้าแรก
  assert.doesNotMatch(html, /รีวิวจากลูกค้า/);
  assert.match(html, /class="hero/);

  await page.goto(editUrl);
  await page.locator("input[name=logo]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await save("บันทึกโลโก้");
  assert.match((await cfg()).brand.logo, /^file:\d+$/);
});
