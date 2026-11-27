// ฟอร์ม "ขายรถให้เรา" บนเว็บเต็นท์รถ · ตรวจซ้ำได้ทั้งฝั่ง Engine (ก่อนส่ง) และ Studio (ก่อนบันทึก)
export const SELL_CAR_PHOTOS = { min: 4, max: 10, maxBytes: 3 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] } as const;
export const GEARS = ["ออโต้", "ธรรมดา"] as const;

export interface SellCarInput {
  name: string; phone: string; province: string;
  brand: string; model: string; year: number; mileage: number; gear: string; color: string;
  asking?: number; note?: string; plate?: string; consent: boolean;
}
export type SellCarData = Omit<SellCarInput, "name" | "phone" | "consent">;

const t = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max + 1);
const n = (v: unknown) => { const s = String(v ?? "").replace(/[,\s฿]|บาท|กม\.?/g, ""); return s === "" ? NaN : Number(s); };

/** ตรวจและจัดรูปข้อมูล · คืน { ok, value } หรือ { ok:false, error } เป็นภาษาไทยที่ลูกค้าอ่านเข้าใจ */
export function parseSellCar(raw: Record<string, unknown>, photoCount: number, now = new Date()):
  { ok: true; value: { name: string; phone: string; data: SellCarData } } | { ok: false; error: string } {
  const name = t(raw.name, 60), phone = String(raw.phone ?? "").replace(/[^0-9+]/g, "");
  const brand = t(raw.brand, 24), model = t(raw.model, 32), province = t(raw.province, 40), color = t(raw.color, 20), gear = t(raw.gear, 10);
  const year = n(raw.year), mileage = n(raw.mileage), asking = n(raw.asking);
  const note = t(raw.note, 300), plate = t(raw.plate, 12);
  const err = (e: string) => ({ ok: false as const, error: e });
  if (!name || name.length > 60) return err("กรอกชื่อ (ไม่เกิน 60 ตัวอักษร)");
  if (!/^[0-9+]{9,15}$/.test(phone)) return err("เบอร์โทรไม่ถูกต้อง");
  if (!brand || brand.length > 24) return err("กรอกยี่ห้อรถ");
  if (!model || model.length > 32) return err("กรอกรุ่นรถ");
  if (!Number.isInteger(year) || year < 1970 || year > now.getFullYear() + 1) return err("ปีรถไม่ถูกต้อง (ใส่เป็น ค.ศ. เช่น 2019)");
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 2_000_000) return err("เลขไมล์ไม่ถูกต้อง");
  if (!(GEARS as readonly string[]).includes(gear)) return err("เลือกเกียร์");
  if (!province || province.length > 40) return err("กรอกจังหวัดที่รถอยู่");
  if (color.length > 20 || note.length > 300 || plate.length > 12) return err("ข้อมูลบางช่องยาวเกินไป");
  if (!Number.isNaN(asking) && (asking < 0 || asking > 100_000_000)) return err("ราคาที่ต้องการไม่ถูกต้อง");
  if (photoCount < SELL_CAR_PHOTOS.min || photoCount > SELL_CAR_PHOTOS.max) return err(`แนบรูปรถ ${SELL_CAR_PHOTOS.min}–${SELL_CAR_PHOTOS.max} รูป (หน้า หลัง ข้าง ภายใน เลขไมล์)`);
  if (raw.consent !== true && raw.consent !== "on" && raw.consent !== "1") return err("กรุณายอมรับการเก็บข้อมูลส่วนบุคคลก่อนส่ง");
  return { ok: true, value: { name, phone, data: {
    province, brand, model, year, mileage, gear, color,
    ...(Number.isNaN(asking) ? {} : { asking }), ...(note ? { note } : {}), ...(plate ? { plate } : {}),
  } } };
}

export const LEAD_STATUS = { new: "ใหม่", contacted: "ติดต่อแล้ว", inspecting: "นัดตรวจรถ", bought: "รับซื้อแล้ว", declined: "ไม่รับซื้อ" } as const;
export type LeadStatus = keyof typeof LEAD_STATUS;

/** ข้อความแจ้งร้านทาง LINE */
export function sellCarMessage(l: { id: number | string; name: string; phone: string; data: SellCarData }, link: string | null) {
  const d = l.data;
  return [`🚗 มีคนอยากขายรถให้ร้าน (#${l.id})`,
    `${d.brand} ${d.model} ปี ${d.year} · ${d.mileage.toLocaleString("th-TH")} กม. · เกียร์${d.gear}${d.color ? ` · สี${d.color}` : ""}`,
    `รถอยู่: ${d.province}${d.asking != null ? ` · ต้องการ ฿${d.asking.toLocaleString("th-TH")}` : ""}`,
    `ติดต่อ: ${l.name} ${l.phone}`,
    ...(d.note ? [`หมายเหตุ: ${d.note}`] : []),
    ...(link ? [`ดูรูปและอัปเดตสถานะ: ${link}`] : [])].join("\n");
}
