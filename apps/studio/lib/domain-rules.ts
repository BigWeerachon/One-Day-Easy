// ตรวจรูปแบบโดเมน (pure · ทดสอบได้)
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
/** คืนโดเมนตัวเล็กไม่มี www./http(s)://, path หรือ null ถ้าไม่ถูกต้อง · รองรับ .co.th, .in.th ฯลฯ */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (d.startsWith("www.")) d = d.slice(4);
  if (d.length > 253 || !d.includes(".")) return null;
  const labels = d.split(".");
  if (labels.some((l) => !LABEL.test(l))) return null;
  if (/^\d+$/.test(labels.at(-1)!)) return null; // ไม่ใช่ IP
  return d;
}
/** โดเมนของระบบเอง (เช่น *.onedayeasy.app) ไม่ต้องผ่านขั้นนี้ */
export const isPlatformDomain = (d: string, platform = process.env.PLATFORM_DOMAIN ?? "onedayeasy.app") => d === platform || d.endsWith("." + platform);
/** ราคา (USD) จาก Vercel อาจเป็น number หรือ string · ต้อง > 0 */
export function parsePrice(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
/** เบอร์ไทย → E.164 แบบที่ registrar ต้องการ (+66.812345678) */
export function toE164Dot(phone: string, cc = "66"): string | null {
  const d = phone.replace(/[\s-]/g, "");
  if (/^\+\d{1,3}\.?\d{6,14}$/.test(d)) return d.includes(".") ? d : d.replace(/^\+(\d{2})/, "+$1.");
  if (/^0\d{8,9}$/.test(d)) return `+${cc}.${d.slice(1)}`;
  return null;
}
