import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { q, one, tx } from "./db";
import * as S from "./store";
import { parseSellCar, sellCarMessage, SELL_CAR_PHOTOS, LEAD_STATUS, type LeadStatus, type SellCarData } from "@ode/blocks/leads";

// ฟอร์ม "ขายรถให้เรา" จากเว็บเต็นท์รถ
// Engine (อ่านอย่างเดียว) ส่งต่อมาที่ /api/leads พร้อมลายเซ็น (PREVIEW_SECRET ที่ใช้ร่วมกัน) → Studio ตรวจ บันทึก แจ้งร้านทาง LINE ทันที

export const MAX_PER_IP_HOUR = 5;
export const MAX_PER_PHONE_DAY = 3;

export function signLead(body: string, ts: number, secret: string) {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("base64url");
}
export function verifyLead(body: string, ts: string | null, sig: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || !ts || !sig || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const want = Buffer.from(signLead(body, Number(ts), secret)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface IngestInput { siteId: string; ipHash: string; fields: Record<string, unknown>; photos: { mime: string; b64: string }[] }
export class LeadError extends Error { constructor(msg: string, public status = 422) { super(msg); } }

const magic = (b: Buffer, mime: string) =>
  mime === "image/jpeg" ? b[0] === 0xff && b[1] === 0xd8 : mime === "image/png" ? b.subarray(1, 4).toString() === "PNG" : mime === "image/webp" ? b.subarray(8, 12).toString() === "WEBP" : false;

export async function ingestSellCar(input: IngestInput) {
  const site = await one<{ client_id: string; has_form: boolean }>(
    `select s.client_id, (s.config ? 'sellcar' or coalesce(tv.spec->'blocks' @> '[{"type":"sellcar"}]', false)) has_form
       from sites s left join template_versions tv on tv.id = s.template_version_id where s.id = $1 and s.status in ('live','down')`, [input.siteId]);
  if (!site?.has_form) throw new LeadError("เว็บนี้ไม่ได้เปิดรับข้อมูลขายรถ", 404);
  const photos = input.photos.map((p) => ({ mime: p.mime, bytes: Buffer.from(p.b64, "base64") }));
  const r = parseSellCar(input.fields, photos.length);
  if (!r.ok) throw new LeadError(r.error);
  for (const p of photos) {
    if (!(SELL_CAR_PHOTOS.mimes as readonly string[]).includes(p.mime) || !magic(p.bytes, p.mime)) throw new LeadError("รูปต้องเป็น JPG, PNG หรือ WEBP");
    if (p.bytes.length > SELL_CAR_PHOTOS.maxBytes) throw new LeadError("รูปใหญ่เกิน 3 MB ต่อรูป");
  }
  const ipHash = createHash("sha256").update(input.ipHash).digest("hex").slice(0, 32);
  const recentIp = await one<{ n: number }>(`select count(*)::int n from site_leads where ip_hash = $1 and created_at > now() - interval '1 hour'`, [ipHash]);
  if ((recentIp?.n ?? 0) >= MAX_PER_IP_HOUR) throw new LeadError("ส่งบ่อยเกินไป ลองใหม่ในอีก 1 ชั่วโมง", 429);
  const recentPhone = await one<{ n: number }>(`select count(*)::int n from site_leads where site_id = $1 and phone = $2 and created_at > now() - interval '1 day'`, [input.siteId, r.value.phone]);
  if ((recentPhone?.n ?? 0) >= MAX_PER_PHONE_DAY) throw new LeadError("เบอร์นี้ส่งข้อมูลไปแล้วหลายครั้งวันนี้ ร้านจะติดต่อกลับ", 429);

  const id = await tx(async (c) => {
    const { rows: [l] } = await c.query(`insert into site_leads (site_id, client_id, kind, name, phone, data, consent_at, ip_hash) values ($1,$2,'sell_car',$3,$4,$5,now(),$6) returning id::text`,
      [input.siteId, site.client_id, r.value.name, r.value.phone, JSON.stringify(r.value.data), ipHash]);
    for (const p of photos) await c.query(`insert into lead_files (lead_id, mime, bytes) values ($1,$2,$3)`, [l.id, p.mime, p.bytes]);
    return l.id as string;
  });
  // แจ้งร้านทาง LINE ทันที · ส่งไม่ได้ (ร้านไม่มี LINE/LINE ล่ม) → ข้อมูลยังอยู่ใน Portal และ Studio
  try {
    const sent = await S.sendSystemMessage(site.client_id, sellCarMessage({ id, ...r.value }, null) + `\n\nพิมพ์ "ดูข้อเสนอ" เพื่อรับลิงก์ดูรูปและอัปเดตสถานะ`);
    // บันทึกว่าแจ้งแล้ว เฉพาะเมื่อถึง LINE จริง · ไม่ถึง → notified_at ว่าง ทีมเห็นในรายการที่ต้องตามเอง
    if (sent === "sent") await q(`update site_leads set notified_at = now() where id = $1`, [id]);
    else console.warn("lead notify", id, sent);
  } catch (e) { console.error("lead notify", e); }
  return { id };
}

export interface LeadRow { id: string; name: string; phone: string; data: SellCarData; status: LeadStatus; note: string | null; createdAt: string; photos: string[] }
export const listLeads = (clientId: string, limit = 100) => q<LeadRow>(
  `select l.id::text, l.name, l.phone, l.data, l.status, l.note, l.created_at::text "createdAt",
     coalesce((select array_agg(f.id::text order by f.id) from lead_files f where f.lead_id = l.id), '{}') photos
   from site_leads l where l.client_id = $1 order by l.created_at desc limit $2`, [clientId, limit]);

export async function updateLead(clientId: string, id: string, status: string, note: string) {
  if (!(status in LEAD_STATUS)) throw new Error("สถานะไม่ถูกต้อง");
  if (note.length > 500) throw new Error("บันทึกยาวเกิน 500 ตัวอักษร");
  const r = await q(`update site_leads set status = $3, note = nullif($4, ''), updated_at = now() where id = $1 and client_id = $2 returning id`, [id, clientId, status, note.trim()]);
  if (!r.length) throw new Error("ไม่พบข้อเสนอนี้");
}
/** รูปของ lead: เฉพาะเจ้าของร้านเท่านั้น */
export const leadFile = (clientId: string, fileId: string) => one<{ mime: string; bytes: Buffer }>(
  `select f.mime, f.bytes from lead_files f join site_leads l on l.id = f.lead_id where f.id = $1 and l.client_id = $2`, [fileId, clientId]);
