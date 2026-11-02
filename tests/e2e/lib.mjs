// ตัวช่วยสำหรับ e2e test · ใช้กับ tests/e2e/run.mjs ซึ่งตั้ง env และเปิด server ให้แล้ว
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const env = process.env;
export const URLS = {
  studio: env.E2E_STUDIO_URL ?? "http://127.0.0.1:3100",
  engine: env.E2E_ENGINE_URL ?? "http://127.0.0.1:3101",
  line: `http://127.0.0.1:${env.MOCK_LINE_PORT ?? 3200}`,
  claude: `http://127.0.0.1:${env.MOCK_CLAUDE_PORT ?? 3300}`,
  vercel: `http://127.0.0.1:${env.MOCK_VERCEL_PORT ?? 3400}`,
};
export const SECRETS = { line: env.LINE_CHANNEL_SECRET ?? "e2e-line-secret", cron: env.CRON_SECRET ?? "e2e-cron-secret" };
// บัญชีทดสอบ (สร้างใหม่ทุกครั้งที่ resetDb)
export const USERS = {
  owner: { email: "owner@e2e.test", name: "Big", password: "ownerpass123" },
  builder: { email: "builder@e2e.test", name: "มิ้น", password: "builderpass1" },
  accountant: { email: "accountant@e2e.test", name: "แอน", password: "accountpass1" },
};

// ---------- ฐานข้อมูล ----------
let pool;
const db = () => (pool ??= new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 }));
export async function sql(text, params = []) { return (await db().query(text, params)).rows; }
export async function val(text, params = []) { const r = (await sql(text, params))[0]; return r ? Object.values(r)[0] : undefined; }
export async function closeDb() { await pool?.end(); pool = undefined; }

/** ล้างฐานข้อมูล → migrations → seed → สร้างบัญชีทดสอบ 3 บทบาท · เรียกใน before() ของทุกไฟล์ */
export async function resetDb() {
  const studio = join(ROOT, "apps/studio");
  const run = (args, extra = {}) => {
    const r = spawnSync(process.execPath, args, { cwd: studio, env: { ...env, ...extra }, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  };
  run(["scripts/db-setup.mjs", "--reset", "--seed"]);
  for (const [role, u] of Object.entries(USERS))
    run(["--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/create-user.mts", u.email, u.name, role], { STUDIO_PASSWORD: u.password });
  await resetMocks();
}

// ---------- mocks ----------
export const mockLog = async (name) => (await fetch(`${URLS[name]}/__log`)).json();
export const mockPost = (name, path, body = "") => fetch(`${URLS[name]}${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
export const resetMocks = () => Promise.all(["line", "claude", "vercel"].map((n) => mockPost(n, "/__reset")));
/** ข้อความที่ระบบ push ไปหาลูกค้าทาง LINE (ล่าสุดอยู่ท้าย) */
export async function linePushes(to) {
  return (await mockLog("line")).filter((l) => l.url.includes("/message/push") && (!to || l.body.to === to)).map((l) => ({ ...l.body.messages[0], to: l.body.to, retryKey: l.retryKey }));
}
export const quick = (m) => m?.quickReply?.items.map((i) => i.action) ?? [];

// ---------- LINE webhook ----------
let seq = 0;
export const sign = (body, secret = SECRETS.line) => crypto.createHmac("sha256", secret).update(body).digest("base64");
export async function webhook(events, { signature } = {}) {
  const body = JSON.stringify({ destination: "Ubot", events });
  const res = await fetch(`${URLS.studio}/api/line/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature ?? sign(body) }, body });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const base = (userId) => ({ timestamp: Date.now(), webhookEventId: `E2E${Date.now()}${++seq}`, source: { type: "user", userId }, deliveryContext: { isRedelivery: false } });
export const lineText = (userId, text, id = `m${Date.now()}${++seq}`) => webhook([{ ...base(userId), type: "message", message: { id, type: "text", text } }]);
export const lineImage = (userId, id = `img${Date.now()}${++seq}`) => webhook([{ ...base(userId), type: "message", message: { id, type: "image" } }]);
export const linePostback = (userId, data) => webhook([{ ...base(userId), type: "postback", postback: { data } }]);

/** ส่งข้อความแล้วรอให้บอทตอบ (งานบอททำหลังตอบ webhook) · คืนข้อความล่าสุดที่ push ถึง userId */
export async function chat(userId, send) {
  const before = (await linePushes(userId)).length;
  const r = await send();
  if (r.status !== 200) throw new Error(`webhook ${r.status}`);
  return waitFor(async () => { const p = await linePushes(userId); return p.length > before ? p.at(-1) : null; }, { message: "บอทไม่ตอบ" });
}

// ---------- ทั่วไป ----------
export async function waitFor(fn, { timeout = 10_000, interval = 150, message = "หมดเวลารอ" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(message);
    await new Promise((r) => setTimeout(r, interval));
  }
}
export const cron = (path, auth = true) => fetch(`${URLS.studio}/api/cron/${path}`, { headers: auth ? { authorization: `Bearer ${SECRETS.cron}` } : {} });

/** GET ไปที่ Site Engine พร้อม Host header (fetch ตั้ง Host เองไม่ได้) */
export function engineGet(host, path = "/") {
  const u = new URL(URLS.engine);
  return new Promise((resolve, reject) => {
    http.get({ hostname: u.hostname, port: u.port, path, headers: { host } }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    }).on("error", reject);
  });
}

// ---------- เบราว์เซอร์ ----------
let browser;
export async function getBrowser() {
  const { chromium } = await import("playwright");
  return (browser ??= await chromium.launch(env.PW_CHROMIUM_PATH ? { executablePath: env.PW_CHROMIUM_PATH } : {}));
}
export async function closeBrowser() { await browser?.close(); browser = undefined; }
/** เปิดหน้าใหม่ที่ login แล้วด้วยบทบาทที่ระบุ */
export async function loginAs(role, viewport = { width: 1440, height: 1000 }) {
  const u = USERS[role];
  const ctx = await (await getBrowser()).newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(`${URLS.studio}/login`);
  await p.fill("input[name=email]", u.email);
  await p.fill("input[name=password]", u.password);
  await Promise.all([p.waitForURL((x) => !x.pathname.startsWith("/login")), p.locator("form button").first().click()]);
  return p;
}
/** กดปุ่มที่ส่ง Server Action แล้วรอหน้าโหลดใหม่ */
export async function act(page, locator) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), locator.click()]);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300); // ให้ React แสดงผลหน้าที่ได้จาก redirect ให้เสร็จ
}
export const errorText = (page) => page.locator(".err").first().innerText({ timeout: 2000 }).catch(() => null);
