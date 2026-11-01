// N1 — Block schema · Claude แก้ได้เฉพาะฟิลด์ในนี้
type Rule = (v: unknown) => string | null;
const str = (max: number): Rule => (v) => (typeof v !== "string" ? "ต้องเป็นข้อความ" : v.length > max ? `ยาวเกิน ${max} ตัวอักษร` : null);
const num = (min = 0, max = Infinity): Rule => (v) => (typeof v !== "number" || v < min || v > max ? `ต้องเป็นตัวเลข ${min}–${max === Infinity ? "∞" : max}` : null);
const arr = (min: number, max: number, item?: Record<string, Rule>): Rule => (v) => {
  if (!Array.isArray(v)) return "ต้องเป็นรายการ";
  if (v.length < min || v.length > max) return `จำนวน ${min}–${max} รายการ`;
  if (item) for (const [i, it] of v.entries()) { const e = validateFields(it, item); if (e) return `[${i}] ${e}`; }
  return null;
};
const pattern = (re: RegExp, msg: string): Rule => (v) => (typeof v === "string" && re.test(v) ? null : msg);

export const BLOCKS: Record<string, { fields: Record<string, Rule>; summary: string; usedIn: string }> = {
  hero: { fields: { title: str(48), subtitle: str(120), cta: str(16) }, summary: "title ≤ 48 · subtitle ≤ 120 · cta ≤ 16 · image", usedIn: "ทุกเทมเพลต" },
  menu: { fields: { items: arr(1, 60, { name: str(32), price: num(0) }) }, summary: "items[≤60]: name ≤ 32 · price ≥ 0 · img · spicy 0–3 · tag", usedIn: "T1 T3" },
  sets: { fields: { items: arr(1, 6, { name: str(48), for: num(1, 10), price: num(0) }) }, summary: "items[≤6]: name · for 1–10 คน · price · was", usedIn: "T3" },
  rooms: { fields: { items: arr(1, 12, { name: str(48), price: num(0), guests: num(1) }) }, summary: "items[≤12]: name · price/คืน · guests · img[≤6]", usedIn: "T4" },
  services: { fields: { items: arr(1, 12, { name: str(32), desc: str(90), price: num(0) }) }, summary: "items[≤12]: name ≤ 32 · desc ≤ 90 · price · duration", usedIn: "T2 T5" },
  courses: { fields: { items: arr(1, 12, { name: str(48), price: num(0) }) }, summary: "items[≤12]: name · age · schedule · price", usedIn: "T6 T10" },
  products: { fields: { items: arr(1, 60, { name: str(48), price: num(0) }) }, summary: "items[≤60]: name · price · stock · img", usedIn: "T7 T8" },
  pricing: { fields: { plans: arr(1, 4, { name: str(32), monthly: num(0) }) }, summary: "plans[≤4]: name · monthly · yearly · features[≤8]", usedIn: "T9 T10" },
  reviews: { fields: { rating: num(1, 5), count: num(0) }, summary: "rating 1–5 · count · source · items[≤6]", usedIn: "ทุกเทมเพลต" },
  gallery: { fields: { images: arr(4, 12, { alt: str(120) }) }, summary: "images[4–12] · alt บังคับ", usedIn: "ทุกเทมเพลต" },
  hours: { fields: { days: str(40), open: str(5), close: str(5) }, summary: "days · open · close · last_order", usedIn: "ทุกเทมเพลต" },
  line: { fields: { id: pattern(/^@[\w.-]{2,}$/, "LINE id ต้องรูปแบบ @xxx") }, summary: "id รูปแบบ @xxx · QR อัตโนมัติ", usedIn: "ทุกเทมเพลต" },
  promptpay: { fields: { id: pattern(/^(\d{10}|\d{13})$/, "PromptPay ต้อง 10 หรือ 13 หลัก") }, summary: "id 10/13 หลัก · แสดงเฉพาะ QR", usedIn: "ทุกเทมเพลต" },
  map: { fields: { lat: num(-90, 90), lng: num(-180, 180), address: str(120) }, summary: "lat · lng · address ≤ 120", usedIn: "ทุกเทมเพลต" },
  faq: { fields: { items: arr(1, 10, { q: str(80), a: str(240) }) }, summary: "items[≤10]: q ≤ 80 · a ≤ 240", usedIn: "ทุกเทมเพลต" },
  legal: { fields: { pdpa: str(2000) }, summary: "PDPA · ทะเบียนพาณิชย์ · ใบอนุญาต", usedIn: "ทุกเทมเพลต" },
};

function validateFields(obj: unknown, fields: Record<string, Rule>): string | null {
  if (typeof obj !== "object" || obj === null) return "ต้องเป็น object";
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(k in fields) && !["image", "img", "tag", "spicy", "was", "duration", "age", "schedule", "stock", "yearly", "features", "source", "src", "last_order", "items"].includes(k)) return `ฟิลด์ "${k}" ไม่อยู่ใน schema`;
  for (const [k, rule] of Object.entries(fields)) if (k in o) { const e = rule(o[k]); if (e) return `${k}: ${e}`; }
  return null;
}

export function validateBlock(type: string, data: unknown): string | null {
  const b = BLOCKS[type];
  if (!b) return `ไม่รู้จักบล็อก "${type}"`;
  return validateFields(data, b.fields);
}

export interface Template { id: string; name: string; blocks: string[]; required: string[] }
export const TEMPLATES: Template[] = [
  { id: "T1", name: "Bento Cafe", blocks: ["hero", "menu", "gallery", "reviews", "hours", "line", "map"], required: ["hero", "menu", "line", "hours", "map"] },
  { id: "T2", name: "Aurora Glass", blocks: ["hero", "services", "reviews", "faq", "line", "map"], required: ["hero", "services", "line"] },
  { id: "T3", name: "Thai Food Delivery", blocks: ["hero", "menu", "sets", "reviews", "gallery", "faq", "hours", "line", "map", "legal"], required: ["hero", "menu", "line", "hours", "map"] },
  { id: "T4", name: "Travel Booking", blocks: ["hero", "rooms", "gallery", "reviews", "map", "line"], required: ["hero", "rooms", "line", "map"] },
  { id: "T5", name: "Trusted Service", blocks: ["hero", "services", "reviews", "faq", "line", "map"], required: ["hero", "services", "line"] },
  { id: "T6", name: "Clay Playful", blocks: ["hero", "courses", "gallery", "faq", "line"], required: ["hero", "courses", "line"] },
  { id: "T7", name: "Organic Story", blocks: ["hero", "products", "gallery", "reviews", "line"], required: ["hero", "products", "line"] },
  { id: "T8", name: "Luxury Noir", blocks: ["hero", "products", "gallery", "line"], required: ["hero", "products", "line"] },
  { id: "T9", name: "Kinetic Sport", blocks: ["hero", "pricing", "gallery", "reviews", "line"], required: ["hero", "pricing", "line"] },
  { id: "T10", name: "Creator Course", blocks: ["hero", "courses", "pricing", "faq", "line"], required: ["hero", "courses", "pricing", "line"] },
];

// 6 checks before sending to client
export function runChecks(template: Template, config: Record<string, unknown>) {
  const present = (b: string) => b in config;
  const errs = Object.entries(config).map(([k, v]) => validateBlock(k, v)).filter(Boolean);
  return [
    { name: "บล็อกบังคับครบ", ok: template.required.every(present) },
    { name: "ฟิลด์ตรง schema", ok: errs.length === 0 },
    { name: "LINE ถูกรูปแบบ", ok: !present("line") || !validateBlock("line", config.line) },
    { name: "มีเวลาเปิด-ปิด", ok: !template.required.includes("hours") || present("hours") },
    { name: "รูปมี alt", ok: !present("gallery") || !validateBlock("gallery", config.gallery) },
    { name: "มี PDPA / legal", ok: present("legal") || !template.blocks.includes("legal") },
  ];
}
