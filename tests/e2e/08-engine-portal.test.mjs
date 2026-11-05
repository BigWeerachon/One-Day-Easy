// Site Engine (เปิดเว็บตามโดเมน) · ลิงก์ดูตัวอย่างที่ลงลายเซ็น · Portal ลูกค้า
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, act, engineGet } from "./lib.mjs";

before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("Engine เปิดเว็บที่ออนไลน์ตาม Host · โดเมนไม่รู้จัก = 404", async () => {
  const ok = await engineGet("mokahouse.com");
  assert.equal(ok.status, 200);
  assert.match(ok.body, /Moka House/);
  assert.equal((await engineGet("unknown-e2e.com")).status, 404);
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
