import "server-only";
import { q, one } from "./db";
import { previewQuery } from "@ode/blocks/sign";
import { BUSINESSES, BLOCK_LABEL, CORE_REQUIRED, BUSINESS_REQUIRED, BUSINESS_PREFIX, checkTemplate, checksPass, VARIANTS, type Business, type Check, type TemplateBlock, type TemplateSpec } from "@ode/blocks/templates";

export interface TemplateRow {
  id: string; key: string; version: number; name: string; business: Business; status: "draft" | "approved" | "retired";
  spec: Omit<TemplateSpec, "key" | "version" | "name" | "business">; checks: Check[] | null;
  createdBy: string; approvedBy: string | null; approvedAt: string | null; sites: number;
}
const COLS = `t.id::text, t.key, t.version, t.name, t.business, t.status, t.spec, t.checks, t.created_by "createdBy", t.approved_by "approvedBy", t.approved_at "approvedAt",
  (select count(*)::int from sites s where s.template_version_id = t.id) sites`;
export const listTemplates = () => q<TemplateRow>(`select ${COLS} from template_versions t order by t.key, t.version desc`);
export const getTemplate = (id: string) => one<TemplateRow>(`select ${COLS} from template_versions t where t.id = $1`, [id]);
export const toSpec = (t: TemplateRow): TemplateSpec => ({ ...t.spec, key: t.key, version: t.version, name: t.name, business: t.business });

/** ลิงก์ดูตัวอย่างเทมเพลต (ข้อมูลตัวอย่าง/ยาวสุด/ว่าง) หรือดูเว็บร้านบนเวอร์ชันนี้ · ใช้ได้ 1 วัน */
export function templatePreviewUrl(id: string, data: "sample" | "long" | "empty", siteId?: string) {
  if (!process.env.ENGINE_URL || !process.env.PREVIEW_SECRET) return null;
  const key = siteId ? `tpl:${id}:site:${siteId}` : `tpl:${id}`;
  return `${process.env.ENGINE_URL.replace(/\/$/, "")}/template-preview/${id}?${siteId ? `site=${siteId}` : `data=${data}`}&${previewQuery(key, process.env.PREVIEW_SECRET, 86400)}`;
}

/** อ่านฟอร์มของหน้าสร้างเทมเพลต → spec (ลำดับจากเลขลำดับ · ติ๊ก = ใช้บล็อกนี้) */
export function specFromForm(f: FormData): { name: string; business: Business; spec: TemplateRow["spec"] } {
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const business = s("business") as Business;
  if (!(business in BUSINESSES)) throw new Error("เลือกประเภทธุรกิจ");
  const picked: (TemplateBlock & { order: number })[] = [];
  for (const type of Object.keys(VARIANTS)) {
    if (f.get(`use_${type}`) !== "on") continue;
    const variant = s(`variant_${type}`) || VARIANTS[type][0];
    picked.push({ type, variant, order: Number(s(`order_${type}`)) || 99 });
  }
  picked.sort((a, b) => a.order - b.order || Object.keys(VARIANTS).indexOf(a.type) - Object.keys(VARIANTS).indexOf(b.type));
  const blocks = picked.map(({ type, variant }) => ({ type, variant }));
  // บล็อกที่ทุกเทมเพลตต้องบังคับ (หน้าแรก LINE เวลาเปิด แผนที่ + บล็อกหลักของธุรกิจ) ถูกบังคับให้เองเมื่ออยู่ในเทมเพลต
  const always: string[] = [...CORE_REQUIRED, ...BUSINESS_REQUIRED[business]];
  const required = blocks.map((b) => b.type).filter((t) => f.get(`req_${t}`) === "on" || always.includes(t));
  const name = s("name").slice(0, 60);
  if (!name) throw new Error("ตั้งชื่อเทมเพลต");
  return { name, business, spec: { blocks, required, palette: s("palette"), fonts: s("fonts"), radius: Math.round(Number(s("radius") || 16)) } };
}

/** ร่างใหม่ (เทมเพลตใหม่ หรือเวอร์ชันถัดไปของเทมเพลตเดิม) */
export async function createDraft(by: string, input: ReturnType<typeof specFromForm>, key?: string) {
  if (key) {
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new Error("รหัสเทมเพลตไม่ถูกต้อง");
    if (await one(`select 1 from template_versions where key = $1 and status = 'draft'`, [key])) throw new Error(`${key} มีร่างที่ยังไม่อนุมัติอยู่แล้ว แก้ร่างนั้นต่อได้เลย`);
  } else {
    const n = await one<{ n: number }>(`select count(distinct key)::int + 1 n from template_versions where business = $1`, [input.business]);
    key = `${BUSINESS_PREFIX[input.business]}${n!.n}`;
    while (await one(`select 1 from template_versions where key = $1`, [key])) key = key.replace(/\d+$/, (d) => String(Number(d) + 1));
  }
  const v = await one<{ v: number }>(`select coalesce(max(version), 0) + 1 v from template_versions where key = $1`, [key]);
  const r = await one<{ id: string }>(`insert into template_versions (key, version, name, business, spec, created_by) values ($1,$2,$3,$4,$5,$6) returning id::text`,
    [key, v!.v, input.name, input.business, JSON.stringify(input.spec), by]);
  return r!.id;
}
export async function updateDraft(id: string, input: ReturnType<typeof specFromForm>) {
  const r = await q(`update template_versions set name = $2, business = $3, spec = $4, checks = null where id = $1 and status = 'draft' returning id`, [id, input.name, input.business, JSON.stringify(input.spec)]);
  if (!r.length) throw new Error("แก้ได้เฉพาะร่าง · เวอร์ชันที่อนุมัติแล้วให้สร้างเวอร์ชันใหม่");
}
export async function runTemplateChecks(id: string) {
  const t = await getTemplate(id);
  if (!t) throw new Error("ไม่พบเทมเพลต");
  const checks = checkTemplate(toSpec(t));
  await q(`update template_versions set checks = $2 where id = $1 and status = 'draft'`, [id, JSON.stringify(checks)]);
  return checks;
}
/** Owner อนุมัติ: ตรวจซ้ำทุกครั้ง ต้องผ่านครบ แล้วล็อก */
export async function approveTemplate(id: string, by: string) {
  const checks = await runTemplateChecks(id);
  if (!checksPass(checks)) throw new Error(`ยังไม่ผ่านการตรวจ: ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
  const r = await q(`update template_versions set status = 'approved', approved_by = $2, approved_at = now() where id = $1 and status = 'draft' returning id`, [id, by]);
  if (!r.length) throw new Error("อนุมัติได้เฉพาะร่าง");
}
export async function retireTemplate(id: string) {
  await q(`update template_versions set status = 'retired' where id = $1 and status = 'approved'`, [id]);
}
export async function deleteDraft(id: string) { await q(`delete from template_versions where id = $1 and status = 'draft'`, [id]); }

// ---------------------------------------------------------------- ใช้กับเว็บ / อัปเกรด
export interface SiteOnTemplate { id: string; domain: string; client: string; clientId: string; versionId: string | null; key: string | null; version: number | null }
export const sitesForKey = (key: string) => q<SiteOnTemplate>(
  `select s.id, s.domain, c.name client, c.id "clientId", tv.id::text "versionId", tv.key, tv.version from sites s join clients c on c.id = s.client_id
    join template_versions tv on tv.id = s.template_version_id where tv.key = $1 order by tv.version, c.name`, [key]);
export const sitesWithoutTemplate = () => q<{ id: string; domain: string; client: string }>(
  `select s.id, s.domain, c.name client from sites s join clients c on c.id = s.client_id where s.template_version_id is null order by c.name`);

/** สิ่งที่จะหายไปเมื่อย้ายเว็บไปเวอร์ชันนี้: บล็อกที่ร้านมีข้อมูลแต่เวอร์ชันใหม่ไม่มี · บล็อกบังคับที่ร้านยังไม่มีข้อมูล */
export async function upgradeImpact(siteId: string, toId: string) {
  const s = await one<{ config: Record<string, unknown> }>(`select config from sites where id = $1`, [siteId]);
  const t = await getTemplate(toId);
  if (!s || !t) throw new Error("ไม่พบเว็บหรือเทมเพลต");
  const has = Object.keys(s.config).filter((k) => k in VARIANTS && s.config[k] && typeof s.config[k] === "object");
  const types = t.spec.blocks.map((b) => b.type);
  return { dropped: has.filter((k) => !types.includes(k)).map((k) => BLOCK_LABEL[k] ?? k), missing: t.spec.required.filter((k) => !has.includes(k)).map((k) => BLOCK_LABEL[k] ?? k) };
}
export async function applyTemplate(siteId: string, toId: string, by: string) {
  const t = await getTemplate(toId);
  if (!t || t.status !== "approved") throw new Error("ใช้ได้เฉพาะเทมเพลตที่อนุมัติแล้ว");
  const { missing } = await upgradeImpact(siteId, toId);
  if (missing.length) throw new Error(`เว็บนี้ยังไม่มีข้อมูลของบล็อกบังคับ: ${missing.join(", ")} · เติมข้อมูลก่อนแล้วค่อยเปลี่ยน`);
  await q(`update sites set template_version_id = $2 where id = $1`, [siteId, toId]);
  await q(`insert into events (name, actor, source, after) values ('site.template', $1, 'human', $2)`, [by, JSON.stringify({ siteId, template: `${t.key}@v${t.version}` })]);
}
