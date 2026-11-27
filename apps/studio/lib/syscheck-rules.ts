// กฎตรวจค่าตั้งระบบ (pure · ทดสอบได้) · ใช้ในหน้า ตั้งค่า → ตรวจความพร้อมระบบ
export type Level = "ok" | "warn" | "fail";
export interface Check { group: string; name: string; level: Level; detail: string }

/** migration ล่าสุดที่โค้ดนี้ต้องการ · business.test ตรวจว่าตรงกับไฟล์สุดท้ายใน supabase/migrations */
export const LATEST_MIGRATION = "0019_hotel_camp.sql";
export const REQUIRED_TEMPLATES = ["R1", "C1", "D1", "H1"];

type Env = Record<string, string | undefined>;
const REQUIRED: [string, string][] = [
  ["DATABASE_URL", "ฐานข้อมูล Supabase"], ["STUDIO_URL", "ลิงก์ Studio"], ["ENGINE_URL", "ลิงก์ Engine"],
  ["PREVIEW_SECRET", "ลิงก์ตัวอย่างเว็บ (ต้องตรงกับ Engine)"], ["CRON_SECRET", "งานตามเวลา"],
  ["LINE_CHANNEL_SECRET", "ตรวจลายเซ็น webhook"], ["LINE_CHANNEL_ACCESS_TOKEN", "ส่งข้อความ LINE"],
  ["PLATFORM_DOMAIN", "ที่อยู่ฟรีของร้าน"], ["PROMPTPAY_ID", "QR รับเงิน"],
];
const OPTIONAL: [string, string][] = [
  ["ANTHROPIC_API_KEY", "AI agent และอ่านสลิป"], ["SELLER_NAME", "ชื่อบนใบเสร็จ"], ["SHOP_RECEIVER_NAMES", "ตรวจชื่อผู้รับในสลิป"],
  ["RESEND_API_KEY", "ส่งอีเมล"], ["VERCEL_TOKEN", "ผูกโดเมนลูกค้าอัตโนมัติ"], ["ENGINE_PROJECT_ID", "ผูกโดเมนลูกค้าอัตโนมัติ"],
];
const FORBIDDEN = ["INSECURE_COOKIES", "LINE_ALLOW_HTTP_IMAGES", "TICK_ON_REQUEST", "LINE_API_BASE", "LINE_DATA_API_BASE", "VERCEL_API_BASE", "EMAIL_API_BASE", "ANTHROPIC_BASE_URL", "ENGINE_DEV_HOST"];

const httpsUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" && !/localhost|127\.0\.0\.1/.test(u.hostname); } catch { return false; } };

export function envChecks(env: Env, production: boolean): Check[] {
  const out: Check[] = [];
  const add = (name: string, level: Level, detail: string) => out.push({ group: "ค่าตั้ง", name, level, detail });
  for (const [k, d] of REQUIRED) add(k, env[k] ? "ok" : "fail", env[k] ? d : `ยังไม่ตั้ง · ${d}`);
  for (const [k, d] of OPTIONAL) add(k, env[k] ? "ok" : "warn", env[k] ? d : `ยังไม่ตั้ง (ไม่บังคับ) · ${d}`);
  for (const k of ["PREVIEW_SECRET", "CRON_SECRET"]) if (env[k] && env[k]!.length < 32) add(k, "fail", "สั้นเกินไป ต้องยาว ≥ 32 ตัว");
  for (const k of ["STUDIO_URL", "ENGINE_URL"]) if (env[k] && production && !httpsUrl(env[k]!)) add(k, "fail", "ต้องเป็น https:// และไม่ใช่ localhost");
  const db = env.DATABASE_URL;
  if (db && production && /supabase\.(co|com)/.test(db) && !/:6543\b|pooler/.test(db)) add("DATABASE_URL", "warn", "แนะนำ Transaction pooler (port 6543) บน Vercel");
  const pd = env.PLATFORM_DOMAIN;
  if (pd && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(pd)) add("PLATFORM_DOMAIN", "fail", "ใส่แค่ชื่อโดเมน เช่น onedayeasy.app (ไม่มี https:// หรือ /)");
  if (env.VERCEL_TOKEN && !env.ENGINE_PROJECT_ID) add("ENGINE_PROJECT_ID", "fail", "ตั้ง VERCEL_TOKEN แล้วแต่ไม่มี ENGINE_PROJECT_ID");
  if (production) for (const k of FORBIDDEN) if (env[k]) add(k, "fail", "ค่าสำหรับเทสเท่านั้น ลบออกจากระบบจริง");
  return out;
}

/** เทียบ webhook ที่ LINE ตั้งไว้ กับที่ควรเป็น */
export function webhookCheck(endpoint: string | undefined, active: boolean | undefined, studioUrl: string | undefined): Check {
  const want = studioUrl ? studioUrl.replace(/\/+$/, "") + "/api/line/webhook" : undefined;
  const c = (level: Level, detail: string): Check => ({ group: "LINE", name: "Webhook", level, detail });
  if (!endpoint) return c("fail", `ยังไม่ได้ตั้ง Webhook URL ใน LINE Developers${want ? ` · ใส่ ${want}` : ""}`);
  if (want && endpoint !== want) return c("fail", `ตั้งไว้ ${endpoint} · ควรเป็น ${want}`);
  if (active === false) return c("fail", "ยังไม่ได้เปิด Use webhook");
  return c("ok", endpoint);
}

export const worst = (cs: Check[]): Level => cs.some((c) => c.level === "fail") ? "fail" : cs.some((c) => c.level === "warn") ? "warn" : "ok";
