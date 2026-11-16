import "server-only";
import { q, one } from "./db";
import * as S from "./store";
import { TEMPLATES, validateBlock, runChecks } from "./blocks";
import { aiConfigured, draftSite, type DraftImage, type SlipImageMime, type Intake } from "./ai";

// ร่างเว็บฉบับแรกอัตโนมัติ: เลือกเทมเพลต → สร้างเว็บ → Claude ร่างทุกบล็อกจากข้อมูลร้าน รูป และภาพ ref
// ทีมตรวจและแก้ต่อในหน้าสร้างเว็บ · ไม่ส่งให้ลูกค้าเองจนกว่าคนจะกดส่งตรวจ

const MAX_IMAGES = 8; // จำกัดจำนวนรูปที่ส่งให้ Claude ดู (คุมค่าใช้จ่ายต่อเว็บ)

/** เทมเพลตเริ่มต้นตามประเภทร้าน · คาเฟ่ = T1 · ร้านอาหารและอื่นๆ = T3 */
export function pickTemplate(kind: string | null, suggested: string | null | undefined) {
  if (suggested && TEMPLATES.some((t) => t.id === suggested)) return suggested;
  return /คาเฟ่|กาแฟ|cafe|coffee|เบเกอรี|ขนม/i.test(kind ?? "") ? "T1" : "T3";
}

export async function draftForJob(jobId: string, opts: { by?: string; force?: boolean } = {}): Promise<{ siteId: string; summary: string; applied: string[]; skipped: { block: string; error: string }[] }> {
  if (!aiConfigured()) throw new Error("ยังไม่ได้ตั้ง ANTHROPIC_API_KEY");
  const j = await one<{ client_id: string; site_id: string | null; draft_status: string | null }>(`select client_id, site_id, draft_status from jobs where id = $1`, [jobId]);
  if (!j) throw new Error("ไม่พบงาน");
  // กันร่างซ้อน (เช่น ลูกค้ากดส่งข้อมูลสองครั้ง)
  const lock = await q(`update jobs set draft_status = 'running', draft_error = null where id = $1 and (draft_status is distinct from 'running' or $2) returning id`, [jobId, !!opts.force]);
  if (!lock.length) throw new Error("กำลังร่างเว็บนี้อยู่");
  try {
    const c = (await one<{ name: string; kind: string | null; phone: string | null; hours: string | null; address: string | null; intake: Intake | null }>(
      `select name, kind, phone, opening_hours hours, address, intake from clients where id = $1`, [j.client_id]))!;
    const siteId = j.site_id ?? await S.createSiteForJob(jobId, pickTemplate(c.kind, c.intake?.suggested_template));
    const site = (await S.getSite(siteId))!;
    const tpl = TEMPLATES.find((t) => t.id === site.template)!;
    const files = await q<{ id: string; kind: DraftImage["kind"]; mime: string; bytes: Buffer }>(
      `select id::text, kind, mime, bytes from client_files where client_id = $1 order by (kind = 'ref') desc, (kind = 'logo') desc, id limit $2`, [j.client_id, MAX_IMAGES]);
    const shop = await shopOf(j.client_id, siteId);
    const r = await draftSite({ template: tpl, shop, notes: await S.clientNotes(j.client_id), images: files.map((f) => ({ ...f, mime: f.mime as SlipImageMime })) });

    const config: Record<string, unknown> = { ...site.config };
    const applied: string[] = [], skipped: { block: string; error: string }[] = [];
    const ownFiles = new Set(files.filter((f) => f.kind !== "ref").map((f) => `file:${f.id}`));
    for (const op of r.ops) {
      const err = op.parseError ?? (!tpl.blocks.includes(op.block) ? `ไม่อยู่ในเทมเพลต ${tpl.id}` : validateBlock(op.block, op.data)) ?? badImage(op.data, ownFiles);
      if (err) { skipped.push({ block: op.block, error: err }); continue; }
      config[op.block] = op.data; applied.push(op.block);
    }
    if (r.themePrimary) config.theme = { ...(config.theme as object ?? {}), primary: r.themePrimary };
    const propId = await S.saveProposal(siteId, site.version, "ร่างทั้งเว็บอัตโนมัติ", r.summary, r.ops.map((o) => ({ block: o.block, data: o.data, error: skipped.find((s) => s.block === o.block)?.error ?? null })), r.usage);
    await q(`update patch_proposals set status = 'applied' where id = $1`, [propId]);
    await S.saveSiteConfig(siteId, config, opts.by ?? "Claude", "ร่างทั้งเว็บอัตโนมัติ", runChecks(tpl, config).filter((x) => x.ok).length);
    await q(`update jobs set draft_status = 'done' where id = $1`, [jobId]);
    return { siteId, summary: r.summary, applied, skipped };
  } catch (e) {
    await q(`update jobs set draft_status = 'failed', draft_error = $2 where id = $1`, [jobId, (e as Error).message.slice(0, 300)]);
    throw e;
  }
}

/** ข้อมูลจริงของร้านเท่าที่ลูกค้าให้มา · ใช้ทั้งตอนร่างและตอน QA ตรวจว่าเว็บไม่มีข้อมูลที่แต่งขึ้น */
export async function shopOf(clientId: string, siteId?: string | null) {
  const c = (await one<{ name: string; kind: string | null; phone: string | null; hours: string | null; address: string | null; intake: Intake | null }>(
    `select name, kind, phone, opening_hours hours, address, intake from clients where id = $1`, [clientId]))!;
  const lineId = (siteId ? (await one<{ v: string | null }>(`select config->'line'->>'id' v from sites where id = $1`, [siteId]))?.v : null) ?? c.intake?.line_id ?? null;
  const notes = await S.clientNotes(clientId);
  return {
    name: c.name, type: c.kind, phone: c.phone ?? c.intake?.phone ?? null, opening_hours: c.hours ?? c.intake?.opening_hours ?? null,
    address: c.address ?? c.intake?.address ?? null, line_id: lineId, menu_or_products: c.intake?.products ?? [],
    extra_info_from_customer: notes.filter((n) => n.startsWith("[ลูกค้าแจ้ง]")),
    promptpay_id: null, // ไม่ใส่พร้อมเพย์ของร้านเองโดยอัตโนมัติ · ทีมใส่เมื่อร้านยืนยัน
  };
}

/** รูปในร่างต้องเป็นไฟล์ของลูกค้ารายนี้เท่านั้น (กัน Claude อ้างรหัสที่ไม่มี หรือใช้ภาพ ref เป็นรูปเว็บ) */
export function badImage(data: unknown, own: Set<string>): string | null {
  let bad: string | null = null;
  const walk = (v: unknown, key?: string) => {
    if (bad) return;
    if (typeof v === "string") { if ((["image", "img", "src"].includes(key ?? "") || /^file:/.test(v)) && !own.has(v)) bad = `รูป ${v.slice(0, 40)} ไม่ใช่รูปของลูกค้ารายนี้`; }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data);
  return bad;
}
