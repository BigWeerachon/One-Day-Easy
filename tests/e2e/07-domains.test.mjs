// โดเมน: ผูกโดเมนลูกค้า → cron ตรวจ DNS/SSL → ใช้งาน · ซื้อโดเมน (owner เท่านั้น · เพดานราคา · พิมพ์ยืนยัน · ราคาเปลี่ยน)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, loginAs, act, mockPost, mockLog, sql, val, cron, errorText } from "./lib.mjs";

const S2 = "00000000-0000-0000-0000-0000000000b2";
before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });
const attachForm = (p) => p.locator("form", { has: p.locator("input[placeholder^='โดเมนที่ลูกค้ามี']") });
const attach = async (p, d) => { await attachForm(p).locator("input[name=domain]").fill(d); await act(p, attachForm(p).getByRole("button", { name: "ผูกโดเมน" })); };

test("โดเมนรูปแบบผิด / ถูกใช้ที่อื่น → แจ้งข้อผิดพลาด", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/builder?site=${S2}`);
  await attach(p, "not a domain");
  assert.ok(await errorText(p));
  await attach(p, "taken.com");
  assert.ok(await errorText(p));
});

test("ผูกโดเมน → รอ DNS → cron ตรวจ → active", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/builder?site=${S2}`);
  await attach(p, "https://www.MokaCafe.com/");
  assert.equal(await val(`select domain || ' ' || status from site_domains`), "mokacafe.com pending");
  const call = (await mockLog("vercel")).filter((l) => l.m === "POST" && l.p.endsWith("/domains")).at(-1);
  assert.equal(call.body.name, "mokacafe.com");
  assert.equal(call.team, "team_e2e");
  await mockPost("vercel", "/__dns", { domain: "mokacafe.com" });
  await sql(`update site_domains set checked_at = now() - interval '1 hour'`);
  assert.equal((await cron("domains")).status, 200);
  assert.equal(await val(`select status || ' ' || verified || ' ' || dns_ok || ' ' || ssl_ok from site_domains where domain = 'mokacafe.com'`), "active true true true");
});

test("builder ไม่เห็นปุ่มซื้อโดเมน", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/builder?site=${S2}`);
  assert.equal(await p.getByRole("button", { name: "เช็กราคา" }).count(), 0);
});

test("owner ซื้อโดเมน: เกินเพดาน → พิมพ์ยืนยันผิด → ราคาเปลี่ยน → สำเร็จ", async () => {
  const p = await loginAs("owner", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/builder?site=${S2}`);
  const quote = async (d) => { const f = p.locator("form", { has: p.getByRole("button", { name: "เช็กราคา" }) }); await f.locator("input[name=domain]").fill(d); await act(p, f.getByRole("button", { name: "เช็กราคา" })); };
  await quote("pricey.com");
  assert.equal(await p.getByRole("button", { name: /^ซื้อ/ }).count(), 0, "เกินเพดานต้องไม่มีปุ่มซื้อ");
  await quote("mokahouse-bkk.com");
  await p.fill("input[name=confirm]", "wrong.com");
  await act(p, p.getByRole("button", { name: /^ซื้อ/ }));
  assert.ok(await errorText(p));
  await quote("mokahouse-bkk.com");
  await mockPost("vercel", "/__price", { price: 13.5 });
  await p.fill("input[name=confirm]", "mokahouse-bkk.com");
  await act(p, p.getByRole("button", { name: /^ซื้อ/ }));
  assert.ok(await errorText(p), "ราคาเปลี่ยนต้องไม่ซื้อ");
  await quote("mokahouse-bkk.com");
  await p.fill("input[name=confirm]", "mokahouse-bkk.com");
  await act(p, p.getByRole("button", { name: /^ซื้อ/ }));
  assert.equal(await errorText(p), null);
  assert.equal(await val(`select source || ' ' || order_id from site_domains where domain = 'mokahouse-bkk.com'`), "purchase ord_mokahouse-bkk.com");
  // ราคาเปลี่ยนถูกจับได้ก่อนเรียก Vercel → มีคำสั่งซื้อจริงครั้งเดียว
  assert.equal((await mockLog("vercel")).filter((l) => l.p.endsWith("/buy")).length, 1);
});
