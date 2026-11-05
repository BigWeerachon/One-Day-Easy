// แปลงวัน/เวลาภาษาไทยจากแชท (pure · ทดสอบได้) · ไม่ใช้ AI เพื่อให้ผลแน่นอนและเร็ว
import { addDays, weekdayOf, isDate } from "./booking-rules.ts";

const DAYS: [RegExp, number][] = [
  [/อาทิตย์/, 0], [/จันทร์/, 1], [/อังคาร/, 2], [/พุธ/, 3], [/พฤหัส/, 4], [/ศุกร์/, 5], [/เสาร์/, 6],
];
const MONTHS: [RegExp, number][] = [
  [/มกรา(?:คม)?|ม\.ค\.?/, 1], [/กุมภา(?:พันธ์)?|ก\.พ\.?/, 2], [/มีนา(?:คม)?|มี\.ค\.?/, 3], [/เมษา(?:ยน)?|เม\.ย\.?/, 4],
  [/พฤษภา(?:คม)?|พ\.ค\.?/, 5], [/มิถุนา(?:ยน)?|มิ\.ย\.?/, 6], [/กรกฎา(?:คม)?|ก\.ค\.?/, 7], [/สิงหา(?:คม)?|ส\.ค\.?/, 8],
  [/กันยา(?:ยน)?|ก\.ย\.?/, 9], [/ตุลา(?:คม)?|ต\.ค\.?/, 10], [/พฤศจิกา(?:ยน)?|พ\.ย\.?/, 11], [/ธันวา(?:คม)?|ธ\.ค\.?/, 12],
];
const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
export const normalize = (s: string) => s.replace(/[๐-๙]/g, (c) => String(TH_DIGITS.indexOf(c))).replace(/\s+/g, " ").trim();

const pad = (n: number) => String(n).padStart(2, "0");
function build(y: number, m: number, d: number) {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return isDate(s) ? s : null;
}
/** ปี พ.ศ./ค.ศ. 2 หรือ 4 หลัก → ค.ศ. */
function yearOf(raw: string | undefined, today: string, m: number, d: number): number {
  const ty = Number(today.slice(0, 4));
  if (!raw) {
    // ไม่บอกปี → วันที่ผ่านมาแล้วในปีนี้ = ปีหน้า
    const cand = build(ty, m, d);
    return cand && cand < today ? ty + 1 : ty;
  }
  let y = Number(raw);
  if (raw.length <= 2) y += y >= 50 ? 2500 : 2000; // 69 → 2569 (พ.ศ.) · 26 → 2026
  if (y > 2400) y -= 543;
  return y;
}

/** หา "วัน" ในข้อความ · คืน YYYY-MM-DD หรือ null · today = วันนี้ตามเวลาไทย */
export function parseThaiDate(input: string, today: string): string | null {
  const t = normalize(input);
  if (/มะรืน/.test(t)) return addDays(today, 2);
  if (/พรุ่งนี้|พรุ่งนี/.test(t)) return addDays(today, 1);
  if (/วันนี้|ตอนนี้|เดี๋ยวนี้/.test(t)) return today;

  // 2026-11-15
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(Number(m[1]) > 2400 ? Number(m[1]) - 543 : Number(m[1]), Number(m[2]), Number(m[3]));
  // 15/11, 15/11/69, 15-11-2569 (วัน/เดือน/ปี แบบไทย)
  m = t.match(/(?<![\d:.])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d:])/);
  if (m) { const d = Number(m[1]), mo = Number(m[2]); return build(yearOf(m[3], today, mo, d), mo, d); }
  // 15 พ.ย. / วันที่ 15 พฤศจิกายน 2569
  for (const [re, mo] of MONTHS) {
    const mm = t.match(new RegExp(`(\\d{1,2})\\s*(?:${re.source})\\s*(\\d{2,4})?`));
    if (mm) { const d = Number(mm[1]); return build(yearOf(mm[2], today, mo, d), mo, d); }
  }
  // วันที่ 15 (เดือนนี้ ถ้าผ่านแล้ว = เดือนหน้า)
  m = t.match(/วันที่\s*(\d{1,2})(?!\s*[:.]\d)/);
  if (m) {
    const d = Number(m[1]); const [y, mo] = today.split("-").map(Number);
    const cand = build(y, mo, d);
    if (cand && cand >= today) return cand;
    return mo === 12 ? build(y + 1, 1, d) : build(y, mo + 1, d);
  }
  // วันศุกร์ / ศุกร์หน้า / สัปดาห์หน้าวันจันทร์
  const tw = t.replace(/(สัปดาห์|อาทิตย์)หน้า/g, "§");
  const next = /§|หน้า/.test(tw);
  for (const [re, wd] of DAYS) {
    if (!re.test(tw)) continue;
    // "ศุกร์หน้า" = ถัดจากศุกร์ที่จะถึงอีก 7 วัน · บอทจะทวนวันที่เต็มให้ลูกค้ายืนยันเสมอ
    const diff = (wd - weekdayOf(today) + 7) % 7;
    return addDays(today, next ? diff + 7 : diff);
  }
  if (/(สัปดาห์|อาทิตย์)หน้า/.test(t)) return addDays(today, 7);
  return null;
}

/** หา "เวลา" ในข้อความ · คืนนาทีนับจากเที่ยงคืน หรือ null */
export function parseThaiTime(input: string): number | null {
  const t = normalize(input);
  let m = t.match(/(\d{1,2})[:.](\d{2})\s*(?:น\.?|นาฬิกา)?/);
  if (m) { const h = Number(m[1]), mi = Number(m[2]); if (h < 24 && mi < 60 && !/\d[:.]\d{2}[/-]/.test(t)) return h * 60 + mi; }
  const half = /ครึ่ง/.test(t) ? 30 : 0;
  m = t.match(/บ่าย\s*(\d{1,2})?\s*(?:โมง)?/);
  if (m) { const h = m[1] ? Number(m[1]) : 1; return (h >= 12 ? h : h + 12) * 60 + half; }
  m = t.match(/(\d{1,2})\s*ทุ่ม/);
  if (m) return (Number(m[1]) + 18) * 60 + half;
  m = t.match(/เที่ยง(?!คืน)/);
  if (m) return 12 * 60 + half;
  m = t.match(/(\d{1,2})\s*โมง\s*(เย็น|เช้า)?/);
  if (m) { let h = Number(m[1]); if (m[2] === "เย็น" && h < 12) h += 12; else if (!m[2] && h >= 1 && h <= 6) h += 12; return h * 60 + half; }
  m = t.match(/(\d{1,2})\s*(?:น\.|นาฬิกา)/);
  if (m && Number(m[1]) < 24) return Number(m[1]) * 60;
  if (/เช้า/.test(t)) return 9 * 60;
  if (/บ่าย/.test(t)) return 13 * 60;
  if (/เย็น/.test(t)) return 17 * 60;
  return null;
}

export type BookingIntent = "book" | "availability" | "my" | "cancel" | "reschedule";
/** เจตนาในข้อความ · null = ไม่เกี่ยวกับคิว (ให้ทีมตอบตามปกติ) */
export function detectIntent(input: string): BookingIntent | null {
  const t = normalize(input).toLowerCase();
  if (/ยกเลิก(คิว|การจอง|นัด)?/.test(t) && /คิว|จอง|นัด|ยกเลิก$/.test(t)) return "cancel";
  if (/เลื่อน(คิว|นัด|วัน)?|เปลี่ยน(วัน|เวลา|คิว)/.test(t)) return "reschedule";
  if (/(คิว|นัด|การจอง)(ของ)?(ฉัน|ผม|หนู|เรา|ฉัน)|เช็ค?คิว|ดูคิว|จองไว้|my booking/.test(t)) return "my";
  if (/ว่าง(ไหม|มั้ย|ม้าย|วันไหน|ช่วงไหน|กี่โมง|ป่าว|รึเปล่า|หรือเปล่า)?|คิวเต็ม|เหลือคิว|มีคิว|รับคิว/.test(t) && !/^ไม่ว่าง/.test(t)) return "availability";
  if (/จอง|ลงคิว|ขอคิว|นัด(หมาย|เวลา)?|book/.test(t)) return "book";
  return null;
}
