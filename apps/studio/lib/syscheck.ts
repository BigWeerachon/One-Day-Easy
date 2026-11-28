import "server-only";
import { q } from "./db";
import { envChecks, webhookCheck, LATEST_MIGRATION, REQUIRED_TEMPLATES, type Check } from "./syscheck-rules";

// ตรวจการเชื่อมต่อจริง (ฐานข้อมูล · LINE · Engine · Vercel · Anthropic) · ใช้เวลาไม่เกิน ~8 วินาที
const T = 8000;
const lineBase = () => process.env.LINE_API_BASE || "https://api.line.me";
async function getJson(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(T), cache: "no-store" });
  const text = await r.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch { /* ไม่ใช่ JSON */ }
  return { status: r.status, ok: r.ok, json: json as Record<string, unknown> | null };
}
const msg = (e: unknown) => (e as Error).message?.slice(0, 160) ?? String(e);

async function dbChecks(): Promise<Check[]> {
  const g = "ฐานข้อมูล";
  try {
    const mig = await q<{ name: string }>("select name from _migrations order by name desc limit 1");
    const last = mig[0]?.name;
    const out: Check[] = [{ group: g, name: "Migration", level: last === LATEST_MIGRATION ? "ok" : "fail",
      detail: last === LATEST_MIGRATION ? `ล่าสุด ${last}` : `ล่าสุดในฐานข้อมูล ${last ?? "ไม่มี"} · ต้องถึง ${LATEST_MIGRATION} (รัน npm run db:setup -w apps/studio)` }];
    if (last === LATEST_MIGRATION) {
      const rows = await q<{ key: string }>("select distinct key from template_versions where status = 'approved'");
      const have = new Set(rows.map((r) => r.key)), miss = REQUIRED_TEMPLATES.filter((k) => !have.has(k));
      out.push({ group: g, name: "เทมเพลตที่อนุมัติ", level: miss.length ? "warn" : "ok", detail: miss.length ? `ยังไม่มีเวอร์ชันอนุมัติ: ${miss.join(" ")}` : REQUIRED_TEMPLATES.join(" ") });
      const owners = await q<{ n: number }>("select count(*)::int n from staff where role = 'owner' and active");
      out.push({ group: g, name: "บัญชี Owner", level: owners[0]?.n ? "ok" : "fail", detail: owners[0]?.n ? `${owners[0].n} บัญชี` : "ยังไม่มี · รัน npm run user:create -w apps/studio" });
    }
    return out;
  } catch (e) { return [{ group: g, name: "เชื่อมต่อ", level: "fail", detail: msg(e) }]; }
}

async function lineChecks(): Promise<Check[]> {
  const g = "LINE", token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return [{ group: g, name: "Access token", level: "fail", detail: "ยังไม่ตั้ง LINE_CHANNEL_ACCESS_TOKEN" }];
  const h = { Authorization: `Bearer ${token}` };
  try {
    const info = await getJson(`${lineBase()}/v2/bot/info`, h);
    if (!info.ok) return [{ group: g, name: "Access token", level: "fail", detail: `LINE ตอบ ${info.status} · token ผิดหรือหมดอายุ` }];
    const out: Check[] = [{ group: g, name: "Access token", level: "ok", detail: `บอท ${info.json?.displayName ?? ""} ${info.json?.basicId ?? ""}`.trim() }];
    const wh = await getJson(`${lineBase()}/v2/bot/channel/webhook/endpoint`, h);
    out.push(webhookCheck(wh.json?.endpoint as string | undefined, wh.json?.active as boolean | undefined, process.env.STUDIO_URL));
    const oa = process.env.LINE_OA_ID;
    if (oa && info.json?.basicId && oa !== info.json.basicId && oa !== info.json.premiumId) out.push({ group: g, name: "LINE_OA_ID", level: "warn", detail: `ตั้งไว้ ${oa} แต่บอทคือ ${info.json.basicId} · ตรวจค่าใน Engine` });
    return out;
  } catch (e) { return [{ group: g, name: "เชื่อมต่อ", level: "fail", detail: msg(e) }]; }
}

async function urlCheck(group: string, url: string | undefined, path: string): Promise<Check> {
  if (!url) return { group, name: "เปิดได้", level: "fail", detail: "ยังไม่ตั้ง URL" };
  try {
    const r = await fetch(url.replace(/\/+$/, "") + path, { redirect: "manual", signal: AbortSignal.timeout(T), cache: "no-store" });
    return { group, name: "เปิดได้", level: r.status < 500 ? "ok" : "fail", detail: `${url} ตอบ ${r.status}` };
  } catch (e) { return { group, name: "เปิดได้", level: "fail", detail: `${url} · ${msg(e)}` }; }
}

async function vercelCheck(): Promise<Check[]> {
  const token = process.env.VERCEL_TOKEN, pid = process.env.ENGINE_PROJECT_ID, g = "Vercel";
  if (!token || !pid) return [{ group: g, name: "ผูกโดเมนอัตโนมัติ", level: "warn", detail: "ปิดอยู่ (ไม่ตั้ง VERCEL_TOKEN / ENGINE_PROJECT_ID) · ผูกโดเมนลูกค้าเองใน Vercel" }];
  try {
    const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
    const base = process.env.VERCEL_API_BASE || "https://api.vercel.com";
    const p = await getJson(`${base}/v9/projects/${encodeURIComponent(pid)}${team}`, { Authorization: `Bearer ${token}` });
    if (!p.ok) return [{ group: g, name: "โปรเจกต์ Engine", level: "fail", detail: `Vercel ตอบ ${p.status} · ตรวจ token / team id / project id` }];
    const pd = process.env.PLATFORM_DOMAIN;
    const d = pd ? await getJson(`${base}/v9/projects/${encodeURIComponent(pid)}/domains/${encodeURIComponent("*." + pd)}${team}`, { Authorization: `Bearer ${token}` }) : null;
    return [{ group: g, name: "โปรเจกต์ Engine", level: "ok", detail: String(p.json?.name ?? pid) },
      { group: g, name: `*.${pd ?? "?"}`, level: d?.ok ? (d.json?.verified === false ? "warn" : "ok") : "fail", detail: d?.ok ? (d.json?.verified === false ? "ผูกแล้วแต่ยังไม่ยืนยัน (ตั้ง nameservers ของ Vercel)" : "ผูก wildcard แล้ว") : "ยังไม่ได้ผูก wildcard domain ในโปรเจกต์ Engine" }];
  } catch (e) { return [{ group: g, name: "เชื่อมต่อ", level: "fail", detail: msg(e) }]; }
}

async function aiCheck(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { group: "AI", name: "Anthropic", level: "warn", detail: "ไม่ตั้ง · Agent และอ่านสลิปอัตโนมัติจะปิด" };
  try {
    const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    const r = await getJson(`${base}/v1/models?limit=1`, { "x-api-key": key, "anthropic-version": "2023-06-01" });
    return { group: "AI", name: "Anthropic", level: r.ok ? "ok" : "fail", detail: r.ok ? "API key ใช้ได้" : `ตอบ ${r.status} · key ผิดหรือไม่มีเครดิต` };
  } catch (e) { return { group: "AI", name: "Anthropic", level: "fail", detail: msg(e) }; }
}

export async function runSystemCheck(): Promise<Check[]> {
  const prod = process.env.NODE_ENV === "production";
  const parts = await Promise.all([dbChecks(), lineChecks(), urlCheck("Engine", process.env.ENGINE_URL, "/"), vercelCheck(), aiCheck()]);
  return [...envChecks(process.env, prod), ...parts.flat()];
}
