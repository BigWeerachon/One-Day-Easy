// ด่านกันของ Agent (ไม่เรียก Claude · เทสได้)
// 1) ข้อความจากลูกค้าที่ใส่ใน prompt: ปิดแท็ก XML ไม่ได้ (กันลูกค้าพิมพ์ </message> แล้วแต่งคำสั่งต่อท้าย)
// 2) คำตอบของ Sales ก่อนส่งถึงลูกค้า: ห้ามมีลิงก์นอก ห้ามมีราคาที่ไม่อยู่ในข้อมูลจริง ห้ามเผยข้อมูลภายใน

/** แทน < > ในข้อความผู้ใช้ด้วยตัวที่หน้าตาใกล้กัน · prompt ยังอ่านรู้เรื่องแต่สร้าง/ปิดแท็กไม่ได้ */
export const fence = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

const ALLOWED_HOSTS = ["line.me", "lin.ee"];
/** ตัวเลขเงินในข้อความ (990, 1,490, ฿1490, 1490 บาท) → จำนวนเต็มบาท */
export function moneyIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:฿\s?([\d,]+(?:\.\d+)?))|(?:([\d,]+(?:\.\d+)?)\s?บาท)/g)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };
/** ตรวจคำตอบ Sales ก่อนส่ง · ไม่ผ่าน = ส่งต่อคน (ไม่ส่งอะไรถึงลูกค้า) */
export function checkSalesReply(reply: string, facts: string): GuardResult {
  if (!reply.trim()) return { ok: false, reason: "คำตอบว่าง" };
  for (const m of reply.matchAll(/https?:\/\/([^\s/]+)/gi)) {
    const host = m[1].toLowerCase();
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return { ok: false, reason: `มีลิงก์นอกระบบ: ${host}` };
  }
  const known = new Set(moneyIn(facts));
  const unknown = moneyIn(reply).filter((n) => !known.has(n));
  if (unknown.length) return { ok: false, reason: `มีราคาที่ไม่อยู่ในข้อมูลจริง: ${unknown.join(", ")}` };
  if (/<\/?(facts|history|message)>|system prompt|คำสั่งระบบ/i.test(reply)) return { ok: false, reason: "คำตอบอ้างถึงคำสั่งภายใน" };
  if (/ส่วนลด|ลดให้|ลดราคา|แถมฟรี/.test(reply) && !/ส่วนลด|ลดราคา/.test(facts)) return { ok: false, reason: "คำตอบพูดถึงส่วนลด" };
  return { ok: true };
}

/** รูปที่ Dev Agent จะเปิดตรวจ: เฉพาะ URL ของ Site Engine เอง (กันเซิร์ฟเวอร์ไปเปิด URL ภายนอกตามที่อยู่ในเนื้อหาเว็บ) */
export function sameOriginOnly(srcs: string[], origin: string): string[] {
  return srcs.filter((s) => { try { return new URL(s, origin).origin === origin; } catch { return false; } });
}
