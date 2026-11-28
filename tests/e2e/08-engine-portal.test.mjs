// Site Engine (เปิดเว็บตามโดเมน) · ลิงก์ดูตัวอย่างที่ลงลายเซ็น · Portal ลูกค้า
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, act, engineGet, sql } from "./lib.mjs";

before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("Engine เปิดเว็บที่ออนไลน์ตาม Host · โดเมนไม่รู้จัก = 404", async () => {
  const ok = await engineGet("mokahouse.com");
  assert.equal(ok.status, 200);
  assert.match(ok.body, /Moka House/);
  assert.equal((await engineGet("unknown-e2e.com")).status, 404);
});

test("โดเมนบริษัท → หน้าขายบริการ (ราคา + ปุ่ม LINE OA) · ไม่ใช่เว็บร้าน", async () => {
  const r = await engineGet("www.onedayeasy-e2e.com");
  assert.equal(r.status, 200);
  assert.match(r.body, /ดูตัวอย่างก่อน ถูกใจค่อยจ่าย/);
  assert.match(r.body, /990/);
  assert.match(r.body, /งานตามโจทย์ ราคาตามขอบเขตงาน/);
  assert.match(r.body, /line\.me\/R\/ti\/p\/%40onedayeasy/);
});

test("ฐานข้อมูลล่ม → เว็บร้านที่เคยเปิดแล้วยังเปิดได้ (ใช้ข้อมูลชุดล่าสุด) · CDN เก็บหน้าเว็บร้านได้", async () => {
  const before = await engineGet("mokahouse.com");
  assert.equal(before.status, 200);
  assert.match(before.headers["vercel-cdn-cache-control"] ?? "", /stale-if-error=604800/);
  // ทำให้ฐานข้อมูลตอบไม่ได้ชั่วคราว (ตาราง sites หาย)
  await sql(`alter table sites rename to sites_e2e_down`);
  try {
    const down = await engineGet("mokahouse.com");
    assert.equal(down.status, 200, "ยังเปิดได้");
    assert.match(down.body, /Moka House/);
    assert.notEqual((await engineGet("never-opened-e2e.com")).status, 200, "ร้านที่ไม่เคยเปิดในเครื่องนี้ ไม่มีของเดิมให้ใช้");
  } finally {
    await sql(`alter table sites_e2e_down rename to sites`);
  }
  // หน้าตัวอย่างไม่ให้ CDN เก็บ
  assert.equal((await engineGet("mokahouse.com", "/preview/x")).headers["vercel-cdn-cache-control"], undefined);
});

test("ลิงก์ดูตัวอย่างเว็บร่างจากหน้าสร้างเว็บเปิดได้ · ลายเซ็นผิดเปิดไม่ได้", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/builder?site=00000000-0000-0000-0000-0000000000b1`);
  const href = await p.getByRole("link", { name: /ดูตัวอย่างเว็บ/ }).getAttribute("href");
  const v = await (await (await getBrowser()).newContext()).newPage();
  const r = await v.goto(href);
  assert.equal(r.status(), 200);
  const bad = await v.goto(href.replace(/sig=[^&]+/, "sig=bad"));
  assert.notEqual(bad.status(), 200);
});

test("ส่งลิงก์ Portal → ลูกค้าเปิดบนมือถือได้", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/clients/00000000-0000-0000-0000-0000000000c1`);
  await act(p, p.getByRole("button", { name: "ส่งลิงก์ Portal" }));
  const url = (await p.locator(".note .mono").innerText()).trim();
  assert.match(url, /\/p\/[\w-]+$/);
  const { devices } = await import("playwright");
  const m = await (await (await getBrowser()).newContext({ ...devices["iPhone 13"] })).newPage();
  const r = await m.goto(url);
  assert.equal(r.status(), 200);
  assert.match(await m.locator("body").innerText(), /ตรวจเว็บ/); // ครัวป้าแดงอยู่ขั้น "ลูกค้าตรวจ" ใน seed
});
