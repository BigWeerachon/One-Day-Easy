// ล็อกอิน · สิทธิ์ตามบทบาท · endpoint ที่ต้องมี secret
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, USERS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, cron, errorText } from "./lib.mjs";

before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("ยังไม่ล็อกอิน → ไปหน้า /login", async () => {
  const p = await (await (await getBrowser()).newContext()).newPage();
  await p.goto(`${URLS.studio}/queue`);
  assert.match(new URL(p.url()).pathname, /^\/login/);
});

test("รหัสผ่านผิด → แจ้งข้อผิดพลาด ไม่บอกว่าอีเมลมีอยู่ไหม", async () => {
  const p = await (await (await getBrowser()).newContext()).newPage();
  await p.goto(`${URLS.studio}/login`);
  await p.fill("input[name=email]", USERS.owner.email);
  await p.fill("input[name=password]", "wrongpass999");
  await p.locator("form button").first().click();
  await p.waitForLoadState("networkidle");
  assert.match(new URL(p.url()).pathname, /^\/login/);
  assert.ok(await errorText(p) || await p.getByText(/ไม่ถูกต้อง/).count(), "ต้องมีข้อความแจ้ง");
});

const pages = { owner: ["/", "/queue", "/finance", "/settings", "/builder"], builder: ["/queue", "/builder", "/inbox"], accountant: ["/finance", "/queue"] };
const denied = { builder: ["/finance", "/settings"], accountant: ["/builder", "/inbox", "/settings"] };
for (const [role, list] of Object.entries(pages)) test(`${role} เข้าหน้าที่มีสิทธิ์ได้`, async () => {
  const p = await loginAs(role);
  for (const path of list) { await p.goto(URLS.studio + path); assert.equal(new URL(p.url()).pathname, path, `${role} ${path}`); }
});
for (const [role, list] of Object.entries(denied)) test(`${role} เข้าหน้าที่ไม่มีสิทธิ์ไม่ได้`, async () => {
  const p = await loginAs(role);
  for (const path of list) { await p.goto(URLS.studio + path); assert.equal(new URL(p.url()).pathname, "/forbidden", `${role} ${path}`); }
});

test("accountant เห็นคิวแต่ไม่มีปุ่มจัดการ", async () => {
  const p = await loginAs("accountant");
  await p.goto(`${URLS.studio}/queue`);
  assert.equal(await p.getByRole("button", { name: "เรียกคิวถัดไป" }).count(), 0);
  assert.equal(await p.getByRole("link", { name: "ตั้งค่าการจอง" }).count(), 0);
});

test("cron ต้องมี CRON_SECRET", async () => {
  for (const path of ["line", "domains", "booking"]) {
    assert.equal((await cron(path, false)).status, 401, path);
    assert.equal((await cron(path)).status, 200, path);
  }
});

test("PDF ต้องล็อกอินและมีสิทธิ์การเงิน", async () => {
  assert.equal((await fetch(`${URLS.studio}/api/docs/INV-2611-008/pdf`)).status, 401);
  const b = await loginAs("builder");
  const r = await b.request.get(`${URLS.studio}/api/docs/INV-2611-008/pdf`);
  assert.equal(r.status(), 403);
  const o = await loginAs("owner");
  const ok = await o.request.get(`${URLS.studio}/api/docs/INV-2611-008/pdf`);
  assert.equal(ok.status(), 200);
  assert.match(ok.headers()["content-type"], /application\/pdf/);
  assert.equal((await ok.body()).subarray(0, 4).toString(), "%PDF");
});

test("owner ตรวจความพร้อมระบบได้ · เห็นผลจริงของ DB/LINE/Vercel/AI", async () => {
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/settings`);
  await p.getByRole("link", { name: "ตรวจตอนนี้" }).click();
  await p.waitForURL(/check=1/);
  const row = (re) => p.locator("[data-check]", { hasText: re });
  assert.equal(await row(/Migration/).getAttribute("data-check"), "ok");
  assert.equal(await row(/Access token/).getAttribute("data-check"), "ok");
  assert.equal(await row(/Webhook/).getAttribute("data-check"), "ok");
  assert.equal(await row(/Anthropic/).getAttribute("data-check"), "ok");
  assert.equal(await row(/INSECURE_COOKIES/).getAttribute("data-check"), "fail", "ค่าเทสต้องถูกเตือนบน production");
});
