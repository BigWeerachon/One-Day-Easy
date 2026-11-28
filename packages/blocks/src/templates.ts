// ระบบเทมเพลตสำเร็จรูป (เฟส 1)
//
// 3 ชั้น ล็อกต่างกัน:
//   1. บล็อก + หน้าตา (VARIANTS)   — เขียนเป็นโค้ด มีเทสคุม · ทีมและลูกค้าแก้ไม่ได้
//   2. เทมเพลต (TemplateSpec)       — ทีมประกอบในหน้า Studio: เลือกบล็อก ลำดับ หน้าตา ชุดสี คู่ฟอนต์ บล็อกบังคับ
//                                     ผ่านการตรวจอัตโนมัติ + Owner อนุมัติ แล้วล็อกเป็นเวอร์ชัน (แก้ทับไม่ได้ ต้องออกเวอร์ชันใหม่)
//   3. ข้อมูลร้าน (sites.config)     — ลูกค้าแก้ได้เฉพาะช่องที่บล็อกประกาศไว้ (EDIT_FIELDS) · เปิด/ปิดบล็อกที่ไม่บังคับ
import { BLOCKS, validateBlock } from "./blocks.ts";
import { contrast, FONTS, type Theme } from "./themes.ts";

export const BUSINESSES = { restaurant: "ร้านอาหาร", cafe: "คาเฟ่", car_dealer: "เต็นท์รถมือสอง", hotel_camp: "ที่พัก / แคมป์", general: "ธุรกิจทั่วไป (Landing page)" } as const;
export type Business = keyof typeof BUSINESSES;

/** หน้าตาที่บล็อกแต่ละตัวเลือกได้ · ตัวแรกคือค่าเริ่มต้น · เพิ่มหน้าตาใหม่ = เขียนโค้ดใน Engine + เทส */
export const VARIANTS: Record<string, readonly string[]> = {
  hero: ["split", "cover"],
  menu: ["cards", "list"],
  sets: ["cards"],
  cars: ["cards", "list"],
  rooms: ["cards", "list"],
  services: ["cards", "list"],
  products: ["cards"],
  courses: ["cards"],
  pricing: ["cards"],
  sellcar: ["default"],
  gallery: ["grid", "strip"],
  reviews: ["cards", "quote"],
  faq: ["accordion"],
  hours: ["default"], line: ["default"], map: ["default"], promptpay: ["default"], legal: ["default"],
};
export const VARIANT_LABEL: Record<string, string> = {
  split: "รูปข้างข้อความ", cover: "รูปเต็มจอ", cards: "การ์ด", list: "รายการ", grid: "ตาราง", strip: "แถบเลื่อน",
  quote: "คำพูดเด่น", accordion: "พับเปิด", default: "มาตรฐาน",
};
export const BLOCK_LABEL: Record<string, string> = {
  hero: "หน้าแรก", menu: "เมนู", sets: "ชุดคุ้มค่า", cars: "รถในเต็นท์", rooms: "ห้องพัก", sellcar: "ฟอร์มขายรถให้เรา", services: "บริการ", products: "สินค้า", courses: "คอร์ส", pricing: "แพ็กเกจราคา", gallery: "แกลเลอรี", reviews: "รีวิว", faq: "คำถามที่พบบ่อย",
  hours: "เวลาเปิด", line: "LINE", map: "แผนที่", promptpay: "พร้อมเพย์", legal: "PDPA / ข้อกฎหมาย",
};
/** บล็อกที่ทุกเทมเพลตต้องมีและลูกค้าปิดไม่ได้: สิ่งที่ลูกค้าของร้านต้องเห็นเสมอ */
export const CORE_REQUIRED = ["hero", "line", "hours", "map"] as const;
/** บล็อกที่เทมเพลตของแต่ละธุรกิจต้องมี */
export const BUSINESS_REQUIRED: Record<Business, string[]> = { restaurant: ["menu"], cafe: ["menu"], car_dealer: ["cars", "sellcar"], hotel_camp: ["rooms"], general: [] };
/** ตัวอักษรนำหน้ารหัสเทมเพลตของแต่ละธุรกิจ */
export const BUSINESS_PREFIX: Record<Business, string> = { restaurant: "R", cafe: "C", car_dealer: "D", hotel_camp: "H", general: "G" };

/** ชุดสีที่ผ่านการตรวจคอนทราสต์แล้ว · ทีมเลือกจากนี้เท่านั้น */
export interface Palette { id: string; name: string; primary: string; accent: string; bg: string; surface: string; text: string; dark?: boolean }
export const PALETTES: Palette[] = [
  { id: "coffee", name: "กาแฟคั่ว", primary: "#7a4a2a", accent: "#e9b872", bg: "#faf6f0", surface: "#ffffff", text: "#2b1d12" },
  { id: "chili", name: "พริกแดง", primary: "#c8102e", accent: "#fcc419", bg: "#fff8f0", surface: "#ffffff", text: "#1f1a17" },
  { id: "basil", name: "ใบโหระพา", primary: "#2f6b3a", accent: "#f2c14e", bg: "#f5f8f2", surface: "#ffffff", text: "#1b2a1d" },
  { id: "matcha", name: "มัทฉะ", primary: "#4f7a3a", accent: "#e6c27a", bg: "#f7f5ee", surface: "#ffffff", text: "#25301c" },
  { id: "ocean", name: "ทะเล", primary: "#0f766e", accent: "#f2c14e", bg: "#f3faf8", surface: "#ffffff", text: "#12302c" },
  { id: "night", name: "บาร์กลางคืน", primary: "#b45309", accent: "#c9a24a", bg: "#0e0e10", surface: "#18181b", text: "#f2efe8", dark: true },
  // ชุดใหม่จาก Design System (docs/DESIGN-TOKENS.md + tokens-submission) · ทุกชุดมีคู่สว่าง/มืด
  { id: "apple", name: "Apple", primary: "#0071e3", accent: "#ff9f0a", bg: "#f5f5f7", surface: "#ffffff", text: "#1d1d1f" },
  { id: "apple-dark", name: "Apple (มืด)", primary: "#0071e3", accent: "#ff9f0a", bg: "#000000", surface: "#1c1c1e", text: "#f5f5f7", dark: true },
  { id: "emerald", name: "มรกตทอง", primary: "#0f4a35", accent: "#d4af37", bg: "#f8f6f0", surface: "#ffffff", text: "#14221c" },
  { id: "emerald-dark", name: "มรกตทอง (มืด)", primary: "#0f4a35", accent: "#d4af37", bg: "#07140f", surface: "#0f1f19", text: "#f3efe3", dark: true },
  { id: "bronze", name: "ทองบรอนซ์", primary: "#6b3a1f", accent: "#b8925a", bg: "#f8f4ef", surface: "#ffffff", text: "#1e140e" },
  { id: "bronze-dark", name: "ทองบรอนซ์ (มืด)", primary: "#6b3a1f", accent: "#b8925a", bg: "#12100e", surface: "#1c1916", text: "#f3ebe3", dark: true },
  { id: "chili-dark", name: "พริกแดง (มืด)", primary: "#c8102e", accent: "#fcc419", bg: "#140f0d", surface: "#1f1917", text: "#f7efe8", dark: true },
  { id: "coffee-dark", name: "กาแฟคั่ว (มืด)", primary: "#7a4a2a", accent: "#e9b872", bg: "#130d09", surface: "#1e1712", text: "#f5ece2", dark: true },
  { id: "basil-dark", name: "ใบโหระพา (มืด)", primary: "#2f6b3a", accent: "#f2c14e", bg: "#0c120d", surface: "#161e17", text: "#ecf3ea", dark: true },
  { id: "matcha-dark", name: "มัทฉะ (มืด)", primary: "#4f7a3a", accent: "#e6c27a", bg: "#0f120c", surface: "#1a1e16", text: "#eff2e6", dark: true },
  { id: "ocean-dark", name: "ทะเล (มืด)", primary: "#0f766e", accent: "#f2c14e", bg: "#08110f", surface: "#121c1a", text: "#e8f5f2", dark: true },
  { id: "night-light", name: "บาร์กลางคืน (สว่าง)", primary: "#b45309", accent: "#c9a24a", bg: "#faf7f2", surface: "#ffffff", text: "#1f1a14" },
];
/** คู่สว่าง ↔ มืดของแต่ละชุด (เตรียมรองรับโหมดมืดอัตโนมัติ) */
export const PALETTE_PAIR = (id: string) => (id.endsWith("-dark") ? id.slice(0, -5) : id === "night" ? "night-light" : id === "night-light" ? "night" : `${id}-dark`);
export const FONT_PAIRS = [
  { id: "classic", name: "อ่านง่าย (Sarabun + Prompt)", font: "Sarabun", heading: "Prompt" },
  { id: "bold", name: "ตัวหนาชัด (Sarabun + Kanit)", font: "Sarabun", heading: "Kanit" },
  { id: "modern", name: "ทันสมัย (IBM Plex + Kanit)", font: "IBM Plex Sans Thai", heading: "Kanit" },
  { id: "friendly", name: "เป็นกันเอง (Mitr)", font: "Mitr", heading: "Mitr" },
  { id: "story", name: "มีเรื่องเล่า (Sarabun + Chonburi)", font: "Sarabun", heading: "Chonburi" },
  { id: "google-sans", name: "Google Sans (ไทยใช้ IBM Plex)", font: "Google Sans", heading: "Google Sans" },
] as const;

export interface TemplateBlock { type: string; variant: string }
export interface TemplateSpec {
  key: string; version: number; name: string; business: Business;
  blocks: TemplateBlock[]; required: string[]; palette: string; fonts: string; radius: number;
}

const F = (n: string) => `"${n}", "IBM Plex Sans Thai", system-ui, sans-serif`;
/** ธีมของเทมเพลต · สีและฟอนต์มาจากชุดที่ตรวจแล้วเท่านั้น (ลูกค้าเปลี่ยนไม่ได้) */
export function specTheme(spec: TemplateSpec): Theme {
  const p = PALETTES.find((x) => x.id === spec.palette) ?? PALETTES[0];
  const f = FONT_PAIRS.find((x) => x.id === spec.fonts) ?? FONT_PAIRS[0];
  return { primary: p.primary, accent: p.accent, bg: p.bg, surface: p.surface, text: p.text, font: F(f.font), heading: F(f.heading), radius: spec.radius, dark: p.dark };
}

/** บล็อกที่จะแสดงจริง: ตามลำดับเทมเพลต · ข้ามบล็อกที่ลูกค้าปิด (ยกเว้นบล็อกบังคับ) และบล็อกที่ไม่มีข้อมูล */
export function visibleBlocks(spec: TemplateSpec, config: Record<string, unknown>): TemplateBlock[] {
  const hidden = hiddenOf(config);
  return spec.blocks.filter((b) => (spec.required.includes(b.type) || !hidden.includes(b.type)) && config[b.type] && typeof config[b.type] === "object");
}
export const hiddenOf = (config: Record<string, unknown>) => (Array.isArray(config.hidden) ? (config.hidden as unknown[]).filter((x): x is string => typeof x === "string") : []);
/** ค่าใน config ที่ไม่ใช่บล็อกเนื้อหา */
export const CONFIG_META = ["theme", "hidden", "brand"] as const;

// ---------------------------------------------------------------- ข้อมูลตัวอย่าง 3 ชุด (ดูตัวอย่าง + ตรวจอัตโนมัติ)
export type SampleKind = "sample" | "long" | "empty";
const L = (n: number, unit = "ก") => unit.repeat(n);
export function sampleConfig(business: Business, kind: SampleKind): Record<string, unknown> {
  const cafe = business === "cafe", stay = business === "hotel_camp", gen = business === "general";
  const room = (i: number) => ({ name: ["River Loft", "Garden Villa", "Family Villa", "River Glamp"][i % 4], price: [3200, 3900, 7500, 2400][i % 4], guests: [2, 2, 6, 2][i % 4] });
  const car = (i: number) => ({ brand: "Toyota", model: ["Yaris Ativ", "Corolla Cross", "Hilux Revo", "Fortuner"][i % 4], year: 2019 + (i % 5), mileage: 35000 + i * 12000, price: 459000 + i * 85000, gear: "ออโต้" });
  if (kind === "empty") return {
    hero: { title: cafe ? "คาเฟ่" : "ร้าน" },
    cars: { items: [{ brand: "Honda", model: "City", year: 2018, mileage: 0, price: 0 }] }, sellcar: {},
    rooms: { items: [{ name: "ห้อง", price: 0, guests: 1 }] },
    menu: { items: [{ name: "เมนู", price: 0 }] },
    services: { items: [{ name: "บริการ", price: 0 }] }, products: { items: [{ name: "สินค้า", price: 0 }] },
    courses: { items: [{ name: "คอร์ส", price: 0 }] }, pricing: { plans: [{ name: "แพ็กเกจ", monthly: 0 }] },
    hours: { days: "ทุกวัน", open: "08:00", close: "17:00" }, line: { id: "@shop" }, map: { lat: 13.75, lng: 100.5, address: "-" },
  };
  if (kind === "long") return {
    hero: { title: L(48), subtitle: L(120), cta: L(16) },
    menu: { items: Array.from({ length: 60 }, (_, i) => ({ name: L(32), price: 999999 + i, spicy: 3, tag: L(12) })) },
    sets: { items: Array.from({ length: 6 }, () => ({ name: L(48), for: 10, price: 999999, was: 1999999 })) },
    cars: { items: Array.from({ length: 60 }, (_, i) => ({ brand: L(24), model: L(32), year: 2100, mileage: 2_000_000, price: 99_999_999 - i, gear: L(10), fuel: L(10), color: L(10), sold: i % 3 === 0 })) },
    sellcar: { title: L(48), note: L(200) },
    services: { items: Array.from({ length: 12 }, (_, i) => ({ name: L(32), desc: L(90), price: 999999 + i, duration: L(12) })) },
    products: { items: Array.from({ length: 60 }, (_, i) => ({ name: L(48), price: 999999 + i, stock: i % 5 })) },
    courses: { items: Array.from({ length: 12 }, (_, i) => ({ name: L(48), price: 999999 + i, age: L(12), schedule: L(20) })) },
    pricing: { plans: Array.from({ length: 4 }, (_, i) => ({ name: L(32), monthly: 999999 + i, yearly: 9999999, features: Array.from({ length: 8 }, () => L(40)) })) },
    rooms: { items: Array.from({ length: 12 }, (_, i) => ({ name: L(48), price: 999999 + i, guests: 20, img: [] })) },
    gallery: { images: Array.from({ length: 12 }, () => ({ src: "", alt: L(120) })) },
    reviews: { rating: 5, count: 99999, source: L(30), items: Array.from({ length: 6 }, () => ({ name: L(30), text: L(240) })) },
    faq: { items: Array.from({ length: 10 }, () => ({ q: L(80), a: L(240) })) },
    hours: { days: L(40), open: "00:00", close: "23:59", last_order: "23:30" },
    line: { id: "@" + "a".repeat(30) }, map: { lat: 13.75, lng: 100.5, address: L(120) }, promptpay: { id: "0812345678" }, legal: { pdpa: L(2000) },
  };
  return {
    hero: gen ? { title: "คลินิกฟันยิ้มสวย", subtitle: "ตรวจ ขูดหินปูน จัดฟัน โดยทันตแพทย์ประสบการณ์ 10 ปี นัดผ่าน LINE ได้ทันที", cta: "นัดหมายผ่าน LINE" }
      : stay ? { title: "บ้านพักริมแม่น้ำ", subtitle: "บ้านพักและเต็นท์ติดแอร์ริมแม่น้ำ รวมอาหารเช้าทุกห้อง", cta: "จองผ่าน LINE" }
      : { title: cafe ? "บ้านกาแฟริมคลอง" : "ครัวคุณยาย", subtitle: cafe ? "กาแฟคั่วเอง ขนมอบสดทุกเช้า" : "อาหารไทยรสมือแม่ ปรุงสดทุกจาน", cta: "สั่งผ่าน LINE" },
    rooms: { items: Array.from({ length: 4 }, (_, i) => room(i)) },
    menu: { items: (cafe ? [["ลาเต้เย็น", 65], ["อเมริกาโน่", 55], ["ครัวซองต์เนยสด", 75], ["มัทฉะลาเต้", 75]] : [["ผัดกะเพราหมูกรอบ", 70], ["ต้มยำกุ้งน้ำข้น", 150], ["แกงเขียวหวานไก่", 80], ["ข้าวผัดปู", 90]]).map(([name, price]) => ({ name, price })) },
    services: { items: [{ name: "ตรวจและขูดหินปูน", desc: "ตรวจสุขภาพฟัน ขูดหินปูน ขัดฟัน", price: 800, duration: "45 นาที" }, { name: "อุดฟัน", desc: "อุดฟันสีเหมือนฟัน", price: 1000, duration: "30 นาที" }, { name: "ฟอกสีฟัน", desc: "ฟอกสีฟันในคลินิก", price: 6500, duration: "90 นาที" }] },
    products: { items: [{ name: "แปรงสีฟันขนนุ่ม", price: 120 }, { name: "ไหมขัดฟัน", price: 90 }, { name: "ยาสีฟันฟลูออไรด์", price: 150, stock: 0 }] },
    courses: { items: [{ name: "คอร์สภาษาอังกฤษพื้นฐาน", price: 3500, age: "อายุ 7–12 ปี", schedule: "เสาร์ 09:00–11:00" }, { name: "คอร์สสนทนา", price: 4500, age: "ผู้ใหญ่", schedule: "อังคาร/พฤหัส 19:00" }] },
    pricing: { plans: [{ name: "เริ่มต้น", monthly: 990, features: ["ดูแล 1 ครั้ง/เดือน", "ตอบแชทใน 24 ชม."] }, { name: "มืออาชีพ", monthly: 2490, yearly: 24900, features: ["ดูแล 4 ครั้ง/เดือน", "ตอบแชทใน 2 ชม.", "รายงานผลรายเดือน"] }] },
    sets: { items: [{ name: "ชุดอิ่มสองคน", for: 2, price: 299, was: 360 }] },
    cars: { items: Array.from({ length: 6 }, (_, i) => ({ ...car(i), ...(i === 5 ? { sold: true } : {}) })) },
    sellcar: { title: "อยากขายรถ? ให้เราประเมินราคาฟรี", note: "ส่งรูปและข้อมูลรถ ทีมงานติดต่อกลับภายใน 24 ชั่วโมง" },
    gallery: { images: Array.from({ length: 4 }, (_, i) => ({ src: "", alt: `บรรยากาศร้าน ${i + 1}` })) },
    reviews: { rating: 4.8, count: 128, source: "Google", items: [{ name: "คุณมิน", text: "อร่อย บรรยากาศดี จะมาอีก" }] },
    faq: { items: [{ q: "มีที่จอดรถไหม", a: "มีที่จอดหน้าร้าน 5 คัน" }] },
    hours: gen ? { days: "จันทร์–เสาร์", open: "09:00", close: "19:00" } : stay ? { days: "เช็กอิน–เช็กเอาต์", open: "14:00", close: "12:00" } : { days: "ทุกวัน", open: cafe ? "07:30" : "10:00", close: cafe ? "18:00" : "21:00" },
    line: { id: "@shopdemo" }, map: { lat: 13.7563, lng: 100.5018, address: "ถนนตัวอย่าง กรุงเทพฯ" },
    promptpay: { id: "0812345678" }, legal: { pdpa: "ร้านเก็บข้อมูลเท่าที่จำเป็นเพื่อรับออเดอร์เท่านั้น" },
  };
}

// ---------------------------------------------------------------- การตรวจอัตโนมัติก่อนอนุมัติ
export interface Check { name: string; ok: boolean; detail?: string }
export function checkTemplate(spec: TemplateSpec): Check[] {
  const types = spec.blocks.map((b) => b.type);
  const p = PALETTES.find((x) => x.id === spec.palette);
  const f = FONT_PAIRS.find((x) => x.id === spec.fonts);
  const mustHave = [...CORE_REQUIRED, ...(BUSINESS_REQUIRED[spec.business] ?? [])];
  const badVariant = spec.blocks.filter((b) => !VARIANTS[b.type]?.includes(b.variant));
  const sampleErrs = (["sample", "long", "empty"] as const).flatMap((k) => {
    const cfg = sampleConfig(spec.business, k);
    return types.filter((t) => t in cfg).map((t) => ({ t, e: validateBlock(t, cfg[t]) })).filter((x) => x.e).map((x) => `${k}/${x.t}: ${x.e}`);
  });
  return [
    { name: "มีชื่อและประเภทธุรกิจ", ok: !!spec.name.trim() && spec.business in BUSINESSES },
    { name: "ไม่มีบล็อกซ้ำ และรู้จักทุกบล็อก", ok: new Set(types).size === types.length && types.every((t) => t in BLOCKS && t in VARIANTS) },
    { name: "หน้าตาของทุกบล็อกมีอยู่จริง", ok: badVariant.length === 0, detail: badVariant.map((b) => `${b.type}:${b.variant}`).join(", ") || undefined },
    { name: "มีบล็อกบังคับครบ", ok: mustHave.every((t) => types.includes(t) && spec.required.includes(t)), detail: mustHave.filter((t) => !types.includes(t) || !spec.required.includes(t)).join(", ") || undefined },
    { name: "บล็อกบังคับอยู่ในเทมเพลต", ok: spec.required.every((t) => types.includes(t)) },
    { name: "หน้าแรกอยู่บนสุด", ok: types[0] === "hero" },
    { name: "ชุดสีและฟอนต์อยู่ในรายการที่ตรวจแล้ว", ok: !!p && !!f && (FONTS as readonly string[]).includes(f.font) && (FONTS as readonly string[]).includes(f.heading) },
    { name: "ตัวหนังสืออ่านง่ายบนพื้นหลัง (≥ 4.5:1)", ok: !!p && contrast(p.text, p.bg) >= 4.5 && contrast(p.text, p.surface) >= 4.5, detail: p ? `${contrast(p.text, p.bg).toFixed(1)}:1` : undefined },
    { name: "ตัวหนังสือขาวบนสีหลักอ่านได้ (≥ 3:1)", ok: !!p && contrast("#ffffff", p.primary) >= 3, detail: p ? `${contrast("#ffffff", p.primary).toFixed(1)}:1` : undefined },
    { name: "ความโค้งมุมอยู่ในช่วง 0–28", ok: Number.isInteger(spec.radius) && spec.radius >= 0 && spec.radius <= 28 },
    { name: "ข้อมูลตัวอย่าง ยาวสุด และว่าง ผ่านกฎของบล็อก", ok: sampleErrs.length === 0, detail: sampleErrs.slice(0, 3).join(" · ") || undefined },
  ];
}
export const checksPass = (c: Check[]) => c.every((x) => x.ok);

// ---------------------------------------------------------------- ช่องที่ลูกค้าแก้เองได้ (ชั้นที่ 3)
// แต่ละบล็อกประกาศช่องที่แก้ได้ · หน้า Portal สร้างฟอร์มจากนี้ · บันทึกแล้วตรวจด้วย validateBlock ทุกครั้ง
export type FieldKind = "text" | "longtext" | "number" | "time" | "image" | "check";
export interface Field { key: string; label: string; kind: FieldKind; max?: number; min?: number; maxNum?: number; required?: boolean }
export interface EditSpec { list?: { key: string; max: number; label: string }; fields: Field[]; top?: Field[] }
export const EDIT_FIELDS: Record<string, EditSpec> = {
  sets: { list: { key: "items", max: 6, label: "ชุด" }, fields: [{ key: "name", label: "ชื่อชุด", kind: "text", max: 48, required: true }, { key: "for", label: "สำหรับกี่คน", kind: "number", min: 1, maxNum: 10, required: true }, { key: "price", label: "ราคา", kind: "number", min: 0, maxNum: 1_000_000, required: true }, { key: "was", label: "ราคาเดิม (ไม่บังคับ)", kind: "number", min: 0, maxNum: 1_000_000 }] },
  reviews: { top: [{ key: "rating", label: "คะแนนเฉลี่ย (1–5)", kind: "number", min: 1, maxNum: 5, required: true }, { key: "count", label: "จำนวนรีวิว", kind: "number", min: 0, maxNum: 1_000_000, required: true }, { key: "source", label: "จากที่ไหน เช่น Google", kind: "text", max: 30 }],
    list: { key: "items", max: 6, label: "รีวิว" }, fields: [{ key: "name", label: "ชื่อผู้รีวิว", kind: "text", max: 30, required: true }, { key: "text", label: "ข้อความ", kind: "longtext", max: 240, required: true }] },
  gallery: { list: { key: "images", max: 12, label: "รูป" }, fields: [{ key: "src", label: "รูป", kind: "image", required: true }, { key: "alt", label: "คำอธิบายรูป", kind: "text", max: 120, required: true }] },
  cars: { list: { key: "items", max: 60, label: "รถ" }, fields: [
    { key: "brand", label: "ยี่ห้อ", kind: "text", max: 24, required: true }, { key: "model", label: "รุ่น", kind: "text", max: 32, required: true },
    { key: "year", label: "ปี (ค.ศ.)", kind: "number", min: 1950, maxNum: 2100, required: true }, { key: "mileage", label: "เลขไมล์ (กม.)", kind: "number", min: 0, maxNum: 2_000_000, required: true },
    { key: "price", label: "ราคา (บาท)", kind: "number", min: 0, maxNum: 100_000_000, required: true }, { key: "gear", label: "เกียร์", kind: "text", max: 10 },
    { key: "img", label: "รูปหลัก", kind: "image" }, { key: "sold", label: "ขายแล้ว", kind: "check" }] },
  rooms: { list: { key: "items", max: 12, label: "ห้องพัก" }, fields: [
    { key: "name", label: "ชื่อห้อง", kind: "text", max: 48, required: true }, { key: "price", label: "ราคาต่อคืน (บาท)", kind: "number", min: 0, maxNum: 1_000_000, required: true },
    { key: "guests", label: "พักได้กี่ท่าน", kind: "number", min: 1, maxNum: 50, required: true }] },
  services: { list: { key: "items", max: 12, label: "บริการ" }, fields: [
    { key: "name", label: "ชื่อบริการ", kind: "text", max: 32, required: true }, { key: "desc", label: "รายละเอียดสั้นๆ", kind: "text", max: 90 },
    { key: "price", label: "ราคา (บาท)", kind: "number", min: 0, maxNum: 10_000_000, required: true }, { key: "duration", label: "ระยะเวลา เช่น 45 นาที", kind: "text", max: 20 }] },
  products: { list: { key: "items", max: 60, label: "สินค้า" }, fields: [
    { key: "name", label: "ชื่อสินค้า", kind: "text", max: 48, required: true }, { key: "price", label: "ราคา (บาท)", kind: "number", min: 0, maxNum: 10_000_000, required: true },
    { key: "img", label: "รูป", kind: "image" }, { key: "stock", label: "คงเหลือ (0 = หมด)", kind: "number", min: 0, maxNum: 1_000_000 }] },
  courses: { list: { key: "items", max: 12, label: "คอร์ส" }, fields: [
    { key: "name", label: "ชื่อคอร์ส", kind: "text", max: 48, required: true }, { key: "price", label: "ราคา (บาท)", kind: "number", min: 0, maxNum: 10_000_000, required: true },
    { key: "age", label: "เหมาะกับ เช่น อายุ 7–12 ปี", kind: "text", max: 30 }, { key: "schedule", label: "วันเวลาเรียน", kind: "text", max: 40 }] },
  pricing: { list: { key: "plans", max: 4, label: "แพ็กเกจ" }, fields: [
    { key: "name", label: "ชื่อแพ็กเกจ", kind: "text", max: 32, required: true }, { key: "monthly", label: "ราคาต่อเดือน (บาท)", kind: "number", min: 0, maxNum: 10_000_000, required: true },
    { key: "yearly", label: "ราคาต่อปี (ไม่บังคับ)", kind: "number", min: 0, maxNum: 100_000_000 }] },
  sellcar: { fields: [{ key: "title", label: "หัวข้อ", kind: "text", max: 48 }, { key: "note", label: "คำอธิบายสั้นๆ", kind: "longtext", max: 200 }] },
  line: { fields: [{ key: "id", label: "LINE ID (ขึ้นต้นด้วย @)", kind: "text", max: 40, required: true }] },
  map: { fields: [{ key: "address", label: "ที่อยู่", kind: "text", max: 120, required: true }] },
  promptpay: { fields: [{ key: "id", label: "เบอร์หรือเลขบัตรพร้อมเพย์", kind: "text", max: 13, required: true }] },
  legal: { fields: [{ key: "pdpa", label: "นโยบายความเป็นส่วนตัว", kind: "longtext", max: 2000, required: true }] },
};
