// ระบบเทมเพลตสำเร็จรูป (เฟส 1)
//
// 3 ชั้น ล็อกต่างกัน:
//   1. บล็อก + หน้าตา (VARIANTS)   — เขียนเป็นโค้ด มีเทสคุม · ทีมและลูกค้าแก้ไม่ได้
//   2. เทมเพลต (TemplateSpec)       — ทีมประกอบในหน้า Studio: เลือกบล็อก ลำดับ หน้าตา ชุดสี คู่ฟอนต์ บล็อกบังคับ
//                                     ผ่านการตรวจอัตโนมัติ + Owner อนุมัติ แล้วล็อกเป็นเวอร์ชัน (แก้ทับไม่ได้ ต้องออกเวอร์ชันใหม่)
//   3. ข้อมูลร้าน (sites.config)     — ลูกค้าแก้ได้เฉพาะช่องที่บล็อกประกาศไว้ (EDIT_FIELDS) · เปิด/ปิดบล็อกที่ไม่บังคับ
import { BLOCKS, validateBlock } from "./blocks.ts";
import { contrast, FONTS, type Theme } from "./themes.ts";

export const BUSINESSES = { restaurant: "ร้านอาหาร", cafe: "คาเฟ่" } as const;
export type Business = keyof typeof BUSINESSES;

/** หน้าตาที่บล็อกแต่ละตัวเลือกได้ · ตัวแรกคือค่าเริ่มต้น · เพิ่มหน้าตาใหม่ = เขียนโค้ดใน Engine + เทส */
export const VARIANTS: Record<string, readonly string[]> = {
  hero: ["split", "cover"],
  menu: ["cards", "list"],
  sets: ["cards"],
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
  hero: "หน้าแรก", menu: "เมนู", sets: "ชุดคุ้มค่า", gallery: "แกลเลอรี", reviews: "รีวิว", faq: "คำถามที่พบบ่อย",
  hours: "เวลาเปิด", line: "LINE", map: "แผนที่", promptpay: "พร้อมเพย์", legal: "PDPA / ข้อกฎหมาย",
};
/** บล็อกที่ทุกเทมเพลตต้องมีและลูกค้าปิดไม่ได้: สิ่งที่ลูกค้าของร้านต้องเห็นเสมอ */
export const CORE_REQUIRED = ["hero", "line", "hours", "map"] as const;
/** บล็อกที่เทมเพลตของแต่ละธุรกิจต้องมี */
export const BUSINESS_REQUIRED: Record<Business, string[]> = { restaurant: ["menu"], cafe: ["menu"] };

/** ชุดสีที่ผ่านการตรวจคอนทราสต์แล้ว · ทีมเลือกจากนี้เท่านั้น */
export interface Palette { id: string; name: string; primary: string; accent: string; bg: string; surface: string; text: string; dark?: boolean }
export const PALETTES: Palette[] = [
  { id: "coffee", name: "กาแฟคั่ว", primary: "#7a4a2a", accent: "#e9b872", bg: "#faf6f0", surface: "#ffffff", text: "#2b1d12" },
  { id: "chili", name: "พริกแดง", primary: "#c8102e", accent: "#fcc419", bg: "#fff8f0", surface: "#ffffff", text: "#1f1a17" },
  { id: "basil", name: "ใบโหระพา", primary: "#2f6b3a", accent: "#f2c14e", bg: "#f5f8f2", surface: "#ffffff", text: "#1b2a1d" },
  { id: "matcha", name: "มัทฉะ", primary: "#4f7a3a", accent: "#e6c27a", bg: "#f7f5ee", surface: "#ffffff", text: "#25301c" },
  { id: "ocean", name: "ทะเล", primary: "#0f766e", accent: "#f2c14e", bg: "#f3faf8", surface: "#ffffff", text: "#12302c" },
  { id: "night", name: "บาร์กลางคืน", primary: "#b45309", accent: "#c9a24a", bg: "#0e0e10", surface: "#18181b", text: "#f2efe8", dark: true },
];
export const FONT_PAIRS = [
  { id: "classic", name: "อ่านง่าย (Sarabun + Prompt)", font: "Sarabun", heading: "Prompt" },
  { id: "bold", name: "ตัวหนาชัด (Sarabun + Kanit)", font: "Sarabun", heading: "Kanit" },
  { id: "modern", name: "ทันสมัย (IBM Plex + Kanit)", font: "IBM Plex Sans Thai", heading: "Kanit" },
  { id: "friendly", name: "เป็นกันเอง (Mitr)", font: "Mitr", heading: "Mitr" },
  { id: "story", name: "มีเรื่องเล่า (Sarabun + Chonburi)", font: "Sarabun", heading: "Chonburi" },
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
  const cafe = business === "cafe";
  if (kind === "empty") return {
    hero: { title: cafe ? "คาเฟ่" : "ร้าน" },
    menu: { items: [{ name: "เมนู", price: 0 }] },
    hours: { days: "ทุกวัน", open: "08:00", close: "17:00" }, line: { id: "@shop" }, map: { lat: 13.75, lng: 100.5, address: "-" },
  };
  if (kind === "long") return {
    hero: { title: L(48), subtitle: L(120), cta: L(16) },
    menu: { items: Array.from({ length: 60 }, (_, i) => ({ name: L(32), price: 999999 + i, spicy: 3, tag: L(12) })) },
    sets: { items: Array.from({ length: 6 }, () => ({ name: L(48), for: 10, price: 999999, was: 1999999 })) },
    gallery: { images: Array.from({ length: 12 }, () => ({ src: "", alt: L(120) })) },
    reviews: { rating: 5, count: 99999, source: L(30), items: Array.from({ length: 6 }, () => ({ name: L(30), text: L(240) })) },
    faq: { items: Array.from({ length: 10 }, () => ({ q: L(80), a: L(240) })) },
    hours: { days: L(40), open: "00:00", close: "23:59", last_order: "23:30" },
    line: { id: "@" + "a".repeat(30) }, map: { lat: 13.75, lng: 100.5, address: L(120) }, promptpay: { id: "0812345678" }, legal: { pdpa: L(2000) },
  };
  return {
    hero: { title: cafe ? "บ้านกาแฟริมคลอง" : "ครัวคุณยาย", subtitle: cafe ? "กาแฟคั่วเอง ขนมอบสดทุกเช้า" : "อาหารไทยรสมือแม่ ปรุงสดทุกจาน", cta: "สั่งผ่าน LINE" },
    menu: { items: (cafe ? [["ลาเต้เย็น", 65], ["อเมริกาโน่", 55], ["ครัวซองต์เนยสด", 75], ["มัทฉะลาเต้", 75]] : [["ผัดกะเพราหมูกรอบ", 70], ["ต้มยำกุ้งน้ำข้น", 150], ["แกงเขียวหวานไก่", 80], ["ข้าวผัดปู", 90]]).map(([name, price]) => ({ name, price })) },
    sets: { items: [{ name: "ชุดอิ่มสองคน", for: 2, price: 299, was: 360 }] },
    gallery: { images: Array.from({ length: 4 }, (_, i) => ({ src: "", alt: `บรรยากาศร้าน ${i + 1}` })) },
    reviews: { rating: 4.8, count: 128, source: "Google", items: [{ name: "คุณมิน", text: "อร่อย บรรยากาศดี จะมาอีก" }] },
    faq: { items: [{ q: "มีที่จอดรถไหม", a: "มีที่จอดหน้าร้าน 5 คัน" }] },
    hours: { days: "ทุกวัน", open: cafe ? "07:30" : "10:00", close: cafe ? "18:00" : "21:00" },
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
export type FieldKind = "text" | "longtext" | "number" | "time" | "image";
export interface Field { key: string; label: string; kind: FieldKind; max?: number; min?: number; maxNum?: number; required?: boolean }
export interface EditSpec { list?: { key: string; max: number; label: string }; fields: Field[]; top?: Field[] }
export const EDIT_FIELDS: Record<string, EditSpec> = {
  sets: { list: { key: "items", max: 6, label: "ชุด" }, fields: [{ key: "name", label: "ชื่อชุด", kind: "text", max: 48, required: true }, { key: "for", label: "สำหรับกี่คน", kind: "number", min: 1, maxNum: 10, required: true }, { key: "price", label: "ราคา", kind: "number", min: 0, maxNum: 1_000_000, required: true }, { key: "was", label: "ราคาเดิม (ไม่บังคับ)", kind: "number", min: 0, maxNum: 1_000_000 }] },
  reviews: { top: [{ key: "rating", label: "คะแนนเฉลี่ย (1–5)", kind: "number", min: 1, maxNum: 5, required: true }, { key: "count", label: "จำนวนรีวิว", kind: "number", min: 0, maxNum: 1_000_000, required: true }, { key: "source", label: "จากที่ไหน เช่น Google", kind: "text", max: 30 }],
    list: { key: "items", max: 6, label: "รีวิว" }, fields: [{ key: "name", label: "ชื่อผู้รีวิว", kind: "text", max: 30, required: true }, { key: "text", label: "ข้อความ", kind: "longtext", max: 240, required: true }] },
  gallery: { list: { key: "images", max: 12, label: "รูป" }, fields: [{ key: "src", label: "รูป", kind: "image", required: true }, { key: "alt", label: "คำอธิบายรูป", kind: "text", max: 120, required: true }] },
  line: { fields: [{ key: "id", label: "LINE ID (ขึ้นต้นด้วย @)", kind: "text", max: 40, required: true }] },
  map: { fields: [{ key: "address", label: "ที่อยู่", kind: "text", max: 120, required: true }] },
  promptpay: { fields: [{ key: "id", label: "เบอร์หรือเลขบัตรพร้อมเพย์", kind: "text", max: 13, required: true }] },
  legal: { fields: [{ key: "pdpa", label: "นโยบายความเป็นส่วนตัว", kind: "longtext", max: 2000, required: true }] },
};
