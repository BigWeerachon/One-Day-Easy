// บริการจำลองสำหรับทดสอบอัตโนมัติ: LINE Messaging API · Claude API · Vercel API
// ไม่ต่ออินเทอร์เน็ต · ทุกตัวมี endpoint ควบคุม: GET /__log (คำขอที่ได้รับ) · POST /__reset · POST /__mode
// ใช้เดี่ยวๆ: node tests/mocks/mocks.mjs   (พอร์ตตั้งได้ด้วย MOCK_LINE_PORT / MOCK_CLAUDE_PORT / MOCK_VERCEL_PORT)
import http from "node:http";

// รูป PNG 1x1 (ใช้เป็นรูปสลิปที่ LINE ส่งมา)
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => r(b)); });
const json = (res, code, body) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(body === undefined ? "" : JSON.stringify(body)); };
function control(state, req, res, b) {
  if (req.url === "/__log") return json(res, 200, state.log), true;
  if (req.url === "/__reset") { state.reset(); return json(res, 200, {}), true; }
  if (req.url === "/__mode") { state.mode = b || "ok"; return json(res, 200, {}), true; }
  return false;
}

// ---------- LINE ----------
// /__mode: ok | 500 (ล้มเหลวชั่วคราว) | 400 (ล้มเหลวถาวร)
export function lineMock() {
  const s = { mode: "ok", log: [], reset() { this.mode = "ok"; this.log = []; } };
  const server = http.createServer(async (req, res) => {
    const b = await readBody(req);
    if (control(s, req, res, b)) return;
    if (req.url.includes("/content")) { res.setHeader("content-type", "image/png"); return res.end(PNG); }
    if (req.url.startsWith("/v2/bot/profile/")) return json(res, 200, { displayName: "คุณทดสอบ LINE" });
    s.log.push({ url: req.url, auth: req.headers.authorization, retryKey: req.headers["x-line-retry-key"], body: b ? JSON.parse(b) : null, mode: s.mode });
    if (s.mode === "500") return json(res, 500, { message: "internal" });
    if (s.mode === "400") return json(res, 400, { message: "The property, 'to', in the request body is invalid" });
    json(res, 200, {});
  });
  return { server, state: s };
}

// ---------- Claude ----------
// /__mode: ok | 401 | refusal | invalid (แก้เว็บเกิน schema)
// /__slip: body "ok|wrong|notslip[:ref[:amountBaht]]" กำหนดผลอ่านสลิปครั้งถัดไป
export function claudeMock() {
  const s = { mode: "ok", log: [], slip: { mode: "ok", ref: null, amount: null }, reset() { this.mode = "ok"; this.log = []; this.slip = { mode: "ok", ref: null, amount: null }; } };
  const msg = (text, stop = "end_turn") => ({ id: "msg_mock", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }], stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } });
  const server = http.createServer(async (req, res) => {
    const b = await readBody(req);
    if (control(s, req, res, b)) return;
    if (req.url === "/__slip") { const [m, r, a] = b.split(":"); s.slip = { mode: m || "ok", ref: r || null, amount: a ? Number(a) : null }; return json(res, 200, {}); }
    const body = JSON.parse(b || "{}");
    s.log.push({ url: req.url, beta: req.headers["anthropic-beta"], key: req.headers["x-api-key"] ?? req.headers.authorization?.replace(/^Bearer /, ""), body });
    if (s.mode === "401") return json(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    const sys = body.system?.[0]?.text ?? "";
    if (sys.includes("สลิปโอนเงิน")) {
      const hasImg = body.messages?.[0]?.content?.some?.((c) => c.type === "image");
      const v = { ok: { amount: s.slip.amount ?? 7450, ref: "TXN" + Date.now() }, wrong: { amount: 7000, ref: "TXNW" + Date.now() }, notslip: null }[s.slip.mode];
      const out = v && hasImg
        ? { is_transfer_slip: true, amount: v.amount, ref: s.slip.ref || v.ref, paid_at: new Date(Date.now() - 10 * 60e3).toISOString(), bank: "KBANK", sender_name: "นาง แอน", receiver_name: "บจก. วันเดย์ อีซี่", receiver_account: "xxx-x-x6789-x" }
        : { is_transfer_slip: false, amount: null, ref: null, paid_at: null, bank: null, sender_name: null, receiver_name: null, receiver_account: null };
      return json(res, 200, msg(JSON.stringify(out)));
    }
    if (s.mode === "refusal") return json(res, 200, msg("", "refusal"));
    if (sys.includes("สรุปข้อมูลที่ใช้สร้างเว็บ")) return json(res, 200, msg(JSON.stringify({ business_name: "ร้านกาแฟสมชาย", business_type: "คาเฟ่", contact_name: "คุณสมชาย", phone: null, line_id: null, address: null, opening_hours: null,
      products: [{ name: "ลาเต้", price: 65 }], style_notes: ["ชอบโทนไม้อบอุ่น"], suggested_template: "T1", missing: ["เวลาเปิด-ปิด", "ที่อยู่ร้าน"] })));
    const ops = s.mode === "invalid"
      ? [{ block: "hero", data_json: JSON.stringify({ title: "ห".repeat(60), subtitle: "x", cta: "สั่งเลย" }) }]
      : [{ block: "hero", data_json: JSON.stringify({ title: "ครัวป้าแดง รสมือแม่", subtitle: "อาหารตามสั่งอุ่นๆ ส่งไวในย่านลาดพร้าว", cta: "สั่งเลย" }) },
         { block: "faq", data_json: JSON.stringify({ items: [{ q: "ส่งไกลแค่ไหน", a: "ในรัศมี 5 กม. จากร้าน" }, { q: "ค่าส่งเท่าไร", a: "สอบถามทาง LINE" }, { q: "สั่งล่วงหน้าได้ไหม", a: "ได้ แจ้งทาง LINE" }] }) }];
    json(res, 200, msg(JSON.stringify({ summary: s.mode === "invalid" ? "หัวข้อยาวเกิน" : "ปรับหัวข้อให้อบอุ่นและเพิ่ม FAQ 3 ข้อ", ops })));
  });
  return { server, state: s };
}

// ---------- Vercel ----------
// token ที่ยอมรับ: "vtok" · /__dns {domain} = ทำให้ DNS ของโดเมนถูกต้อง · /__price {price}
// โดเมน taken.com = ถูกใช้แล้ว · ชื่อมี "pricey" = แพงเกินเพดาน · ชื่อมี "taken" = จดไม่ได้
export function vercelMock() {
  const s = { mode: "ok", log: [], domains: {}, dns: {}, price: 11.25, reset() { this.log = []; this.domains = {}; this.dns = {}; this.price = 11.25; } };
  const server = http.createServer(async (req, res) => {
    const b = await readBody(req);
    if (control(s, req, res, b)) return;
    const u = new URL(req.url, "http://x"), p = u.pathname, body = b ? JSON.parse(b) : null;
    if (p === "/__dns") { s.dns[body.domain] = true; return json(res, 200, {}); }
    if (p === "/__price") { s.price = body.price; return json(res, 200, {}); }
    s.log.push({ m: req.method, p, team: u.searchParams.get("teamId"), auth: req.headers.authorization, body });
    if (req.headers.authorization !== "Bearer vtok") return json(res, 403, { error: { code: "forbidden", message: "bad token" } });
    let m;
    const pending = (name) => [{ type: "TXT", domain: "_vercel." + name, value: `vc-domain-verify=${name},abc123`, reason: "pending_domain_verification" }];
    if (req.method === "POST" && (m = p.match(/^\/v10\/projects\/([^/]+)\/domains$/))) {
      if (body.name === "taken.com") return json(res, 409, { error: { code: "domain_already_in_use", message: "in use" } });
      s.domains[body.name] = { verified: false };
      return json(res, 200, { name: body.name, verified: false, verification: pending(body.name) });
    }
    if ((m = p.match(/^\/v9\/projects\/[^/]+\/domains\/([^/]+)(\/verify)?$/))) {
      const name = decodeURIComponent(m[1]), d = s.domains[name];
      if (req.method === "DELETE") { delete s.domains[name]; return json(res, 200, {}); }
      if (!d) return json(res, 404, { error: { code: "not_found", message: "no" } });
      if (m[2]) { if (!s.dns[name]) return json(res, 400, { error: { code: "missing_txt_record", message: "TXT not found" } }); d.verified = true; }
      return json(res, 200, { name, verified: d.verified, verification: d.verified ? [] : pending(name) });
    }
    if ((m = p.match(/^\/v6\/domains\/([^/]+)\/config$/))) { const name = decodeURIComponent(m[1]);
      return json(res, 200, { misconfigured: !s.dns[name], configuredBy: s.dns[name] ? "A" : null, recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }], recommendedCNAME: [{ rank: 1, value: "cname.vercel-dns.com." }] }); }
    if ((m = p.match(/^\/v1\/registrar\/domains\/([^/]+)\/availability$/))) return json(res, 200, { available: !/taken/.test(m[1]) });
    if ((m = p.match(/^\/v1\/registrar\/domains\/([^/]+)\/price$/))) return json(res, 200, { years: 1, purchasePrice: /pricey/.test(m[1]) ? 99 : s.price, renewalPrice: 25, transferPrice: 12 });
    if ((m = p.match(/^\/v1\/registrar\/domains\/([^/]+)\/buy$/))) {
      if (body.expectedPrice !== s.price) return json(res, 400, { code: "expected_price_mismatch", message: "price changed" });
      return json(res, 200, { orderId: "ord_" + m[1] });
    }
    json(res, 404, { error: { code: "nope", message: p } });
  });
  return { server, state: s };
}

// ---------- อีเมล (Resend) ----------
// key ที่ยอมรับ: "e2e-resend-key" · /__mode: ok | 500 | 422 · ส่ง Idempotency-Key เดิมซ้ำ = คืน id เดิม ไม่นับเป็นฉบับใหม่
export function emailMock() {
  const s = { mode: "ok", log: [], seen: new Map(), reset() { this.mode = "ok"; this.log = []; this.seen = new Map(); } };
  const server = http.createServer(async (req, res) => {
    const b = await readBody(req);
    if (control(s, req, res, b)) return;
    if (req.headers.authorization !== "Bearer e2e-resend-key") return json(res, 401, { message: "API key is invalid" });
    if (s.mode === "500") return json(res, 500, { message: "internal" });
    if (s.mode === "422") return json(res, 422, { message: "Invalid `to` field" });
    const key = req.headers["idempotency-key"];
    if (key && s.seen.has(key)) return json(res, 200, { id: s.seen.get(key) });
    const id = `em_${s.log.length + 1}`;
    if (key) s.seen.set(key, id);
    const body = JSON.parse(b);
    s.log.push({ id, key, ...body, attachments: (body.attachments ?? []).map((a) => ({ filename: a.filename, bytes: Buffer.from(a.content, "base64").length, head: Buffer.from(a.content, "base64").subarray(0, 4).toString() })) });
    json(res, 200, { id });
  });
  return { server, state: s };
}

export async function startMocks(ports = { line: 3200, claude: 3300, vercel: 3400, email: 3500 }) {
  const all = { line: lineMock(), claude: claudeMock(), vercel: vercelMock(), email: emailMock() };
  await Promise.all(Object.entries(all).map(([k, m]) => new Promise((r, j) => m.server.once("error", j).listen(ports[k], "127.0.0.1", r))));
  return { ...all, close: () => Promise.all(Object.values(all).map((m) => new Promise((r) => m.server.close(r)))) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = process.env;
  await startMocks({ line: Number(e.MOCK_LINE_PORT ?? 3200), claude: Number(e.MOCK_CLAUDE_PORT ?? 3300), vercel: Number(e.MOCK_VERCEL_PORT ?? 3400), email: Number(e.MOCK_EMAIL_PORT ?? 3500) });
  console.log("mocks up: LINE :3200 · Claude :3300 · Vercel :3400 · Email :3500");
}
