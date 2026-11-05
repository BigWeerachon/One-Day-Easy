// ตัวรัน e2e: ล้างฐานข้อมูลทดสอบ → build → เปิด mocks + Studio + Engine → node --test tests/e2e/*.test.mjs → ปิดทั้งหมด
// ใช้: TEST_DATABASE_URL=postgresql://... npm run test:e2e   [-- ชื่อไฟล์ เช่น booking]
//   E2E_SKIP_BUILD=1  ไม่ build ใหม่ (ใช้ .next เดิม)
//   E2E_KEEP=1        เปิด server ค้างไว้หลังจบ (ดูผลด้วยตัวเอง)
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { startMocks } from "../mocks/mocks.mjs";
import { ROOT } from "./lib.mjs";

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) { console.error("ต้องตั้ง TEST_DATABASE_URL (ฐานข้อมูลสำหรับทดสอบ · จะถูกล้างทุกครั้ง)"); process.exit(2); }
if (/supabase\.(co|com)|pooler/.test(dbUrl) && process.env.E2E_ALLOW_REMOTE !== "1") {
  console.error("TEST_DATABASE_URL ดูเหมือนฐานข้อมูลจริง (Supabase) · e2e จะลบข้อมูลทั้งหมด · ถ้าตั้งใจจริงให้ตั้ง E2E_ALLOW_REMOTE=1"); process.exit(2);
}
const P = { studio: 3100, engine: 3101, line: 3200, claude: 3300, vercel: 3400 };
const env = {
  ...process.env, NODE_ENV: "production",
  DATABASE_URL: dbUrl, INSECURE_COOKIES: "1",
  STUDIO_URL: `http://127.0.0.1:${P.studio}`, ENGINE_URL: `http://127.0.0.1:${P.engine}`, PREVIEW_SECRET: "e2e-preview-secret",
  LINE_CHANNEL_SECRET: "e2e-line-secret", LINE_CHANNEL_ACCESS_TOKEN: "e2e-line-token", CRON_SECRET: "e2e-cron-secret",
  LINE_API_BASE: `http://127.0.0.1:${P.line}`, LINE_DATA_API_BASE: `http://127.0.0.1:${P.line}`,
  ANTHROPIC_API_KEY: "e2e-anthropic-key", ANTHROPIC_BASE_URL: `http://127.0.0.1:${P.claude}`,
  VERCEL_TOKEN: "vtok", VERCEL_TEAM_ID: "team_e2e", ENGINE_PROJECT_ID: "engine-e2e", VERCEL_API_BASE: `http://127.0.0.1:${P.vercel}`, PLATFORM_DOMAIN: "onedayeasy.app",
  DOMAIN_SSL_PROBE: "off",
  PROMPTPAY_ID: "0812345678", SHOP_RECEIVER_NAMES: "บจก. วันเดย์ อีซี่", SHOP_RECEIVER_ACCOUNTS: "123-4-56789-0", SLIP_AUTO_APPROVE: "on", SLIP_MAX_AGE_DAYS: "3",
  SELLER_NAME: "บริษัท วันเดย์ อีซี่ จำกัด", SELLER_TAX_ID: "0105555555555",
  REGISTRANT_FIRST_NAME: "Big", REGISTRANT_LAST_NAME: "Test", REGISTRANT_EMAIL: "ops@e2e.test", REGISTRANT_PHONE: "+66.812345678", REGISTRANT_ADDRESS: "1 Test Rd", REGISTRANT_ZIP: "10110", REGISTRANT_CITY: "Bangkok", REGISTRANT_STATE: "Bangkok", REGISTRANT_COMPANY: "One Day Easy Co., Ltd.", REGISTRANT_COUNTRY: "TH",
};
Object.assign(process.env, env);

const children = [];
function start(name, cwd, port) {
  const c = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  c.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  c.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(c);
}
async function waitHttp(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  throw new Error(`server ไม่ขึ้น: ${url}`);
}
const stop = async (mocks) => { for (const c of children) c.kill("SIGTERM"); await mocks?.close(); };

const apps = [["studio", join(ROOT, "apps/studio"), P.studio, "/login"], ["engine", join(ROOT, "apps/engine"), P.engine, "/"]];
if (process.env.E2E_SKIP_BUILD !== "1" || apps.some(([, d]) => !existsSync(join(d, ".next/BUILD_ID")))) {
  for (const [name, dir] of apps) {
    console.log(`build ${name}…`);
    const r = spawnSync(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "build"], { cwd: dir, env, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
const mocks = await startMocks({ line: P.line, claude: P.claude, vercel: P.vercel });
let code = 1;
try {
  // ฐานข้อมูลต้องมีตารางก่อน server เริ่ม (แต่ละไฟล์ทดสอบจะล้างใหม่เองอีกครั้ง)
  const setup = spawnSync(process.execPath, ["scripts/db-setup.mjs", "--reset", "--seed"], { cwd: join(ROOT, "apps/studio"), env, encoding: "utf8" });
  if (setup.status !== 0) throw new Error(setup.stderr);
  for (const [name, dir, port] of apps) start(name, dir, port);
  for (const [, , port, path] of apps) await waitHttp(`http://127.0.0.1:${port}${path}`);
  const filter = process.argv.slice(2);
  const files = readdirSync(join(ROOT, "tests/e2e")).filter((f) => f.endsWith(".test.mjs") && (!filter.length || filter.some((x) => f.includes(x)))).sort().map((f) => join(ROOT, "tests/e2e", f));
  console.log(`รัน ${files.length} ไฟล์`);
  // ต้องไม่ใช้ spawnSync: mocks ทำงานใน process นี้ ถ้า event loop ถูกบล็อก mocks จะไม่ตอบ
  const t = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=90000", "--test-reporter=spec", ...files], { env, stdio: "inherit" });
  code = await new Promise((r) => t.on("exit", (c) => r(c ?? 1)));
} catch (e) { console.error(e); }
if (process.env.E2E_KEEP === "1") { console.log("E2E_KEEP=1 · server ยังเปิดอยู่ · Ctrl+C เพื่อปิด"); process.on("SIGINT", async () => { await stop(mocks); process.exit(code); }); }
else { await stop(mocks); process.exit(code); }
