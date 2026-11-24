import "server-only";
import { q, one } from "./db";
import * as S from "./store";
import { validateBlock, TEMPLATES } from "./blocks";
import type { PortalCtx } from "./portal";
import { EDIT_FIELDS, BLOCK_LABEL, hiddenOf, type TemplateSpec } from "@ode/blocks/templates";

// ลูกค้าแก้เว็บเองหลังออนไลน์ (Portal) · แก้ได้เฉพาะเนื้อหา: รูป/ข้อความหน้าแรก การ์ดเมนู/สินค้า/บริการ เวลาเปิด คำถามที่พบบ่อย
// หน้าตา สี ฟอนต์ และลำดับบล็อกล็อกไว้ · ทุกครั้งที่บันทึกเก็บเวอร์ชันเดิมไว้ ย้อนกลับได้
// สิทธิ์: ปีแรกหลังเว็บออนไลน์ฟรี · หลังจากนั้นต้องต่อค่าดูแลรายปี (ใบ RN ที่ชำระแล้ว ครอบคลุม 1 ปีนับจากวันชำระ)

export const ITEM_BLOCKS = ["menu", "products", "services"] as const;
export type ItemBlock = (typeof ITEM_BLOCKS)[number];
export const ITEM_LABEL: Record<ItemBlock, string> = { menu: "เมนู", products: "สินค้า", services: "บริการ" };
export const MAX_NEW_ROWS = 3;
const SELF = "ลูกค้า (แก้เอง)";

export interface Editable {
  siteId: string; version: number; template: string; config: Record<string, unknown>;
  itemBlock: ItemBlock | null; hasHours: boolean; hasFaq: boolean; canUndo: boolean;
  /** บล็อกของเว็บตามลำดับเทมเพลต · บล็อกบังคับ (ปิดไม่ได้) · บล็อกที่ลูกค้าปิดไว้ */
  blocks: string[]; required: string[]; hidden: string[]; spec: TemplateSpec | null;
}
export type Access = { ok: true; until: string } | { ok: false; reason: "not-live" | "expired"; until?: string };

/** วันสุดท้ายที่แก้เองได้ = มากกว่าระหว่าง (วันออนไลน์ + 1 ปี) กับ (วันชำระค่าดูแลรายปีล่าสุด + 1 ปี) */
export async function selfEditAccess(ctx: PortalCtx): Promise<Access> {
  if (!["online", "care"].includes(ctx.job.stage)) return { ok: false, reason: "not-live" };
  const r = await one<{ until: string | null; ok: boolean }>(
    `select greatest(s.live_at, (select max(p.created_at) from payments p join documents d on d.no = p.doc_no
        where d.client_id = $1 and d.type = 'RN' and d.status = 'paid')) + interval '1 year' as until,
       greatest(s.live_at, (select max(p.created_at) from payments p join documents d on d.no = p.doc_no
        where d.client_id = $1 and d.type = 'RN' and d.status = 'paid')) + interval '1 year' > now() as ok
     from jobs j join sites s on s.id = j.site_id where j.id = $2`, [ctx.clientId, ctx.jobId]);
  if (!r?.until) return { ok: false, reason: "not-live" };
  return r.ok ? { ok: true, until: r.until } : { ok: false, reason: "expired", until: r.until };
}

export async function editable(ctx: PortalCtx): Promise<Editable | null> {
  const s = await one<{ id: string; version: number; template: string; config: Record<string, unknown>; spec: TemplateSpec | null }>(
    `select s.id, s.version, s.template, s.config,
       case when tv.id is null then null else tv.spec || jsonb_build_object('key', tv.key, 'version', tv.version, 'name', tv.name, 'business', tv.business) end spec
     from jobs j join sites s on s.id = j.site_id left join template_versions tv on tv.id = s.template_version_id where j.id = $1`, [ctx.jobId]);
  if (!s) return null;
  const legacy = TEMPLATES.find((t) => t.id === s.template);
  const tpl = s.spec ? { blocks: s.spec.blocks.map((b) => b.type), required: s.spec.required } : legacy;
  const has = (b: string) => b in s.config || !!tpl?.blocks.includes(b);
  // ย้อนได้เมื่อการแก้ครั้งล่าสุดเป็นของลูกค้าเอง (แถวใน site_versions = ค่าก่อนแก้ · actor = คนที่แก้)
  const canUndo = (await one<{ actor: string }>(`select actor from site_versions where site_id = $1 and version = $2`, [s.id, s.version - 1]))?.actor === SELF;
  return {
    siteId: s.id, version: s.version, template: s.template, config: s.config,
    itemBlock: ITEM_BLOCKS.find((b) => b in s.config) ?? ITEM_BLOCKS.find((b) => tpl?.blocks.includes(b)) ?? null,
    hasHours: has("hours"), hasFaq: has("faq"), canUndo,
    blocks: tpl?.blocks ?? [], required: tpl?.required ?? [], hidden: hiddenOf(s.config), spec: s.spec,
  };
}

async function guard(ctx: PortalCtx, version: number) {
  const a = await selfEditAccess(ctx);
  if (!a.ok) throw new Error(a.reason === "expired" ? "สิทธิ์แก้เว็บเองหมดแล้ว ต่อค่าดูแลรายปีเพื่อแก้ต่อได้" : "แก้เว็บเองได้หลังเว็บออนไลน์แล้ว");
  const e = await editable(ctx);
  if (!e) throw new Error("ไม่พบเว็บ");
  // กันบันทึกทับกัน (เปิดสองแท็บ หรือทีมแก้พร้อมกัน)
  if (version !== e.version) throw new Error("เว็บถูกแก้จากที่อื่นก่อนหน้านี้ โหลดหน้าใหม่แล้วลองอีกครั้ง");
  return e;
}
async function save(e: Editable, ctx: PortalCtx, block: string, data: unknown, note: string) {
  const err = validateBlock(block, data);
  if (err) throw new Error(err);
  await S.saveSiteConfig(e.siteId, { ...e.config, [block]: data }, SELF, note);
  await q(`update clients set last_contact_at = now() where id = $1`, [ctx.clientId]);
}
/** รูปใหม่จากลูกค้า → เก็บเป็นรูปร้าน · คืนค่า file:<id> ที่ใช้ในเว็บ */
async function storeImage(ctx: PortalCtx, img: { mime: string; bytes: Buffer }) {
  const r = await one<{ id: string }>(`insert into client_files (client_id, mime, bytes, kind, tagged) values ($1,$2,$3,'photo',true) returning id::text`, [ctx.clientId, img.mime, img.bytes]);
  return `file:${r!.id}`;
}
/** รูปเดิมต้องเป็นรูปของร้านนี้ (กันแก้ฟอร์มให้ชี้ไปรูปร้านอื่น) */
async function ownImage(ctx: PortalCtx, v: string) {
  if (!v) return undefined;
  if (/^https:\/\//.test(v)) return v;
  const m = /^file:(\d+)$/.exec(v);
  if (m && (await one(`select 1 from client_files where id = $1 and client_id = $2 and kind <> 'ref'`, [m[1], ctx.clientId]))) return v;
  throw new Error("รูปไม่ถูกต้อง");
}
const clean = (v: string, max: number, label: string) => {
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > max) throw new Error(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return t;
};
type Img = { mime: string; bytes: Buffer } | undefined;

export async function saveHero(ctx: PortalCtx, f: { version: number; title: string; subtitle: string; image?: Img; removeImage?: boolean }) {
  const e = await guard(ctx, f.version);
  const cur = (e.config.hero ?? {}) as Record<string, unknown>;
  const title = clean(f.title, 48, "หัวข้อ");
  if (!title) throw new Error("ต้องมีหัวข้อหน้าแรก");
  const next: Record<string, unknown> = { ...cur, title, subtitle: clean(f.subtitle, 120, "คำโปรย") };
  if (!next.subtitle) delete next.subtitle;
  if (f.image) next.image = await storeImage(ctx, f.image);
  else if (f.removeImage) delete next.image;
  await save(e, ctx, "hero", next, "แก้หน้าแรก");
}

export interface ItemRow { name: string; price: string; desc?: string; img?: string; image?: Img; remove?: boolean }
export async function saveItems(ctx: PortalCtx, f: { version: number; rows: ItemRow[] }) {
  const e = await guard(ctx, f.version);
  const block = e.itemBlock;
  if (!block) throw new Error("เว็บนี้ไม่มีรายการให้แก้");
  const old = (((e.config[block] ?? {}) as { items?: Record<string, unknown>[] }).items ?? []);
  const items: Record<string, unknown>[] = [];
  for (const [i, r] of f.rows.entries()) {
    const name = clean(r.name, block === "products" ? 48 : 32, "ชื่อ");
    if (r.remove || (!name && !r.price.trim())) continue; // ลบ หรือแถวว่าง
    if (!name) throw new Error(`รายการที่ ${items.length + 1}: ต้องมีชื่อ`);
    const price = Number(r.price.replace(/[,\s฿]|บาท/g, ""));
    if (!r.price.trim() || !Number.isFinite(price) || price < 0 || price > 1_000_000) throw new Error(`"${name}": ราคาไม่ถูกต้อง`);
    // เก็บฟิลด์อื่นของรายการเดิมไว้ (เช่น ความเผ็ด แท็ก) · แก้เฉพาะชื่อ ราคา คำอธิบาย รูป
    const base = i < old.length ? { ...old[i] } : {};
    const it: Record<string, unknown> = { ...base, name, price };
    if (block === "services") {
      const desc = clean(r.desc ?? "", 90, `คำอธิบาย "${name}" `);
      if (desc) it.desc = desc; else delete it.desc;
    } else {
      const img = r.image ? await storeImage(ctx, r.image) : await ownImage(ctx, r.img ?? "");
      if (img) it.img = img; else delete it.img;
    }
    items.push(it);
  }
  if (!items.length) throw new Error("ต้องมีอย่างน้อย 1 รายการ");
  await save(e, ctx, block, { ...(e.config[block] as object ?? {}), items }, `แก้${ITEM_LABEL[block]}`);
}

const time = (v: string, label: string) => {
  const t = v.trim().replace(".", ":");
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`${label}ต้องเป็นเวลา เช่น 08:00`);
  return t.padStart(5, "0");
};
export async function saveHours(ctx: PortalCtx, f: { version: number; days: string; open: string; close: string }) {
  const e = await guard(ctx, f.version);
  const days = clean(f.days, 40, "วันเปิด");
  if (!days) throw new Error("ต้องใส่วันเปิด");
  await save(e, ctx, "hours", { ...(e.config.hours as object ?? {}), days, open: time(f.open, "เวลาเปิด"), close: time(f.close, "เวลาปิด") }, "แก้เวลาเปิด-ปิด");
}

export async function saveFaq(ctx: PortalCtx, f: { version: number; rows: { q: string; a: string; remove?: boolean }[] }) {
  const e = await guard(ctx, f.version);
  const items = [];
  for (const r of f.rows) {
    const qq = clean(r.q, 80, "คำถาม"), a = clean(r.a, 240, "คำตอบ");
    if (r.remove || (!qq && !a)) continue;
    if (!qq || !a) throw new Error("ต้องใส่ทั้งคำถามและคำตอบ");
    items.push({ q: qq, a });
  }
  if (!items.length) {
    // ลบบล็อกออกทั้งบล็อกได้ (บล็อกนี้ไม่บังคับ)
    const { faq: _drop, ...rest } = e.config;
    await S.saveSiteConfig(e.siteId, rest, SELF, "ลบคำถามที่พบบ่อย");
    return;
  }
  await save(e, ctx, "faq", { items }, "แก้คำถามที่พบบ่อย");
}

/** ย้อนกลับการแก้ล่าสุดของลูกค้าเอง (ไม่ย้อนงานที่ทีมทำ) */
export async function undoSelfEdit(ctx: PortalCtx, version: number) {
  const e = await guard(ctx, version);
  if (!e.canUndo) throw new Error("ไม่มีการแก้ของคุณให้ย้อนกลับ");
  await S.rollbackSite(e.siteId, "ลูกค้า (ย้อนกลับ)");
}

// ---------------------------------------------------------------- ทุกบล็อก (ตามช่องที่บล็อกประกาศไว้ใน EDIT_FIELDS)
/** ค่าจากฟอร์มของบล็อกหนึ่ง: top_<key> · <key><i> ต่อแถว · del<i> ลบแถว · รูปใหม่ <key>_new<i> */
export interface BlockForm { get(k: string): string; image(k: string): Promise<Img> }
export async function saveBlock(ctx: PortalCtx, f: { version: number; block: string; n: number; form: BlockForm }) {
  const e = await guard(ctx, f.version);
  const spec = EDIT_FIELDS[f.block];
  if (!spec || !e.blocks.includes(f.block)) throw new Error("แก้ส่วนนี้เองไม่ได้");
  const label = BLOCK_LABEL[f.block] ?? f.block;
  const read = async (fd: { key: string; label: string; kind: string; max?: number; min?: number; maxNum?: number; required?: boolean }, name: string, newName: string) => {
    const raw = f.form.get(name);
    if (fd.kind === "image") {
      const img = await f.form.image(newName);
      return img ? await storeImage(ctx, img) : await ownImage(ctx, raw);
    }
    if (fd.kind === "number") {
      if (!raw) return undefined;
      const n = Number(raw.replace(/[,\s฿]|บาท/g, ""));
      if (!Number.isFinite(n) || n < (fd.min ?? 0) || n > (fd.maxNum ?? 1_000_000)) throw new Error(`${fd.label}: ต้องเป็นตัวเลข ${fd.min ?? 0}–${fd.maxNum ?? 1_000_000}`);
      return n;
    }
    const t = fd.kind === "longtext" ? raw.trim() : raw.replace(/\s+/g, " ").trim();
    if (fd.max && t.length > fd.max) throw new Error(`${fd.label}ยาวเกิน ${fd.max} ตัวอักษร`);
    return t || undefined;
  };
  const cur = (e.config[f.block] ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  for (const fd of spec.top ?? []) {
    const v = await read(fd, `top_${fd.key}`, `top_${fd.key}_new`);
    if (v === undefined) { if (fd.required) throw new Error(`${label}: ต้องใส่${fd.label}`); delete next[fd.key]; } else next[fd.key] = v;
  }
  if (spec.list) {
    const old = ((cur[spec.list.key] ?? []) as Record<string, unknown>[]);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(f.n, spec.list.max + 3); i++) {
      if (f.form.get(`del${i}`) === "1") continue;
      const row: Record<string, unknown> = i < old.length ? { ...old[i] } : {};
      let any = false;
      for (const fd of spec.fields) {
        const v = await read(fd, `${fd.key}${i}`, `${fd.key}_new${i}`);
        if (v !== undefined) { row[fd.key] = v; any = true; } else delete row[fd.key];
      }
      if (!any) continue; // แถวว่าง
      const miss = spec.fields.find((fd) => fd.required && row[fd.key] === undefined);
      if (miss) throw new Error(`${spec.list.label}ที่ ${rows.length + 1}: ต้องใส่${miss.label}`);
      rows.push(row);
    }
    if (rows.length > spec.list.max) throw new Error(`${label}มีได้ไม่เกิน ${spec.list.max} ${spec.list.label}`);
    next[spec.list.key] = rows;
  } else {
    for (const fd of spec.fields) {
      const v = await read(fd, fd.key, `${fd.key}_new`);
      if (v === undefined) { if (fd.required) throw new Error(`${label}: ต้องใส่${fd.label}`); delete next[fd.key]; } else next[fd.key] = v;
    }
  }
  await save(e, ctx, f.block, next, `แก้${label}`);
}

/** เปิด/ปิดบล็อก · บล็อกบังคับของเทมเพลตปิดไม่ได้ */
export async function saveVisibility(ctx: PortalCtx, f: { version: number; show: string[] }) {
  const e = await guard(ctx, f.version);
  const optional = e.blocks.filter((b) => !e.required.includes(b));
  const hidden = optional.filter((b) => !f.show.includes(b));
  await S.saveSiteConfig(e.siteId, { ...e.config, hidden }, SELF, hidden.length ? `ซ่อน ${hidden.map((b) => BLOCK_LABEL[b] ?? b).join(", ")}` : "แสดงทุกส่วน");
  await q(`update clients set last_contact_at = now() where id = $1`, [ctx.clientId]);
}

/** โลโก้ร้าน (แสดงมุมบนของเว็บ) */
export async function saveLogo(ctx: PortalCtx, f: { version: number; image?: Img; remove?: boolean }) {
  const e = await guard(ctx, f.version);
  const brand = { ...((e.config.brand ?? {}) as Record<string, unknown>) };
  if (f.image) brand.logo = await storeImage(ctx, f.image);
  else if (f.remove) delete brand.logo;
  else throw new Error("เลือกรูปโลโก้ก่อน");
  await S.saveSiteConfig(e.siteId, { ...e.config, brand }, SELF, f.image ? "เปลี่ยนโลโก้" : "เอาโลโก้ออก");
}
