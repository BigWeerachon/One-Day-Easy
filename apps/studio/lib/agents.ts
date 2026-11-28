import "server-only";
import { q, one } from "./db";
import * as S from "./store";
import { TEMPLATES, validateBlock, runChecks, type Template } from "./blocks";
import { aiConfigured, proposePatch, reviewSite, salesReply, designBrief, type AiUsage, type DraftImage, type SlipImageMime } from "./ai";
import { draftForJob, shopOf, badImage, pickTemplate, type Design } from "./draft";
import { FONTS, sanitizeTheme } from "@ode/blocks/themes";
import { previewUrl } from "./preview";
import { notify } from "./notify";
import { checkSalesReply, sameOriginOnly } from "./agent-guard";
import { businessOf, agentTemplateFor } from "./business";

// ทีม Agent ของระบบ (ทุกตัวใช้ Claude · บันทึกทุกครั้งใน agent_runs)
//   Sales   ตอบคำถามในแชทที่ปุ่มตอบไม่ได้ · ส่งต่อคนเมื่อเกินขอบเขต
//   Intake  ถามข้อมูลที่ขาดจากลูกค้า แล้วรับคำตอบมาเติมเว็บ
//   Design  กำหนดหน้าตาเว็บก่อนร่าง: เทมเพลต ชุดสี ฟอนต์ โทนภาษา รูปหน้าแรก จากภาพ ref และรูปร้าน
//   Dev     ตรวจทางเทคนิคก่อนส่งลูกค้า: หน้าตัวอย่างเปิดได้ รูปโหลดครบ ลิงก์ถูก · เฝ้าเว็บที่ออนไลน์แล้ว
//   Builder ร่างเว็บ · แก้ตามที่ QA หรือลูกค้าขอ
//   QA      ตรวจเว็บเทียบกับข้อมูลจริงของลูกค้า · ผ่าน = ส่งลูกค้าตรวจเอง · ไม่ผ่านเกิน 2 รอบ = ส่งต่อคน
//   Ops     ตามลูกค้าที่เงียบ · สรุปงานรายวันให้เจ้าของ (lib/ops.ts)
// สิ่งที่ Agent ทำไม่ได้โดยตั้งใจ: ยืนยันรับเงิน ให้ส่วนลด เผยแพร่เว็บ (ขึ้นออนไลน์ได้เมื่อชำระครบเท่านั้น)

export type AgentName = "sales" | "intake" | "design" | "builder" | "qa" | "dev" | "ops";
export const agentsEnabled = () => (process.env.AGENTS ?? "on") !== "off" && aiConfigured();
const MAX_FIX_ROUNDS = 2;

export async function logRun(agent: AgentName, outcome: string, o: { jobId?: string | null; clientId?: string | null; detail?: unknown; usage?: AiUsage }) {
  await q(`insert into agent_runs (job_id, client_id, agent, outcome, detail, model, input_tokens, output_tokens) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [o.jobId ?? null, o.clientId ?? null, agent, outcome, JSON.stringify(o.detail ?? {}), o.usage?.model ?? null, o.usage?.input ?? 0, o.usage?.output ?? 0]);
}
export const listRuns = (jobId: string, limit = 30) => q<{ id: string; agent: AgentName; outcome: string; detail: Record<string, unknown>; tokens: number; at: string }>(
  `select id::text, agent, outcome, detail, input_tokens + output_tokens tokens, created_at::text at from agent_runs where job_id = $1 order by id desc limit $2`, [jobId, limit]);

const ASK: Record<string, string> = {
  line: "LINE ID ของร้าน (ขึ้นต้นด้วย @) คืออะไรคะ",
  hours: "ร้านเปิด-ปิดวันและเวลาไหนบ้างคะ",
  map: "ที่อยู่ร้านคือที่ไหนคะ",
  menu: "ขอรายการเมนูพร้อมราคาค่ะ (พิมพ์หรือส่งรูปเมนูได้)",
  cars: "ขอรายการรถในเต็นท์ค่ะ (ยี่ห้อ รุ่น ปี เลขไมล์ ราคา พร้อมรูปคันละ 1 รูป)",
  sellcar: "อยากให้ฟอร์มรับซื้อรถบนเว็บเขียนหัวข้อว่าอะไรคะ (เช่น ขายรถให้เรา ประเมินฟรี)",
  rooms: "ขอรายการห้องพักค่ะ (ชื่อห้อง ราคาต่อคืน พักได้กี่ท่าน พร้อมรูป)",
  services: "ขอรายการบริการพร้อมราคาค่ะ (ชื่อบริการ รายละเอียดสั้นๆ ราคา)",
  products: "ขอรายการสินค้าพร้อมราคาค่ะ (ชื่อ ราคา พร้อมรูปชิ้นละ 1 รูป)",
  courses: "ขอรายการคอร์สค่ะ (ชื่อคอร์ส เหมาะกับใคร วันเวลาเรียน ราคา)",
  pricing: "ขอแพ็กเกจราคาค่ะ (ชื่อแพ็กเกจ ราคาต่อเดือน สิ่งที่ได้)",
};
const pdpaText = (shop: string) => `${shop} เก็บข้อมูลที่คุณให้ผ่านเว็บไซต์นี้ (เช่น ชื่อ เบอร์โทร ข้อความ) เพื่อติดต่อกลับและให้บริการเท่านั้น ไม่ขายหรือส่งต่อให้บุคคลอื่น คุณขอดู แก้ไข หรือลบข้อมูลได้โดยติดต่อร้านทาง LINE`;

/** Builder: แก้เว็บตามคำสั่ง แล้วบันทึกเฉพาะบล็อกที่ผ่านการตรวจ */
async function applyFix(jobId: string, clientId: string, siteId: string, instruction: string) {
  const site = (await S.getSite(siteId))!;
  const tpl = await S.templateOf(site);
  const own = new Set((await q<{ id: string }>(`select id::text from client_files where client_id = $1 and kind <> 'ref'`, [clientId])).map((f) => `file:${f.id}`));
  const r = await proposePatch({ template: tpl, config: site.config, instruction: `${instruction}\n\nรูปของลูกค้าที่ใช้ได้: ${[...own].join(", ") || "ไม่มี"}`, notes: await S.clientNotes(clientId) });
  const config = { ...site.config };
  const applied: string[] = [], skipped: { block: string; error: string }[] = [];
  for (const op of r.ops) {
    const err = op.parseError ?? (!tpl.blocks.includes(op.block) ? `ไม่อยู่ในเทมเพลต ${tpl.id}` : validateBlock(op.block, op.data)) ?? badImage(op.data, own);
    if (err) skipped.push({ block: op.block, error: err }); else { config[op.block] = op.data; applied.push(op.block); }
  }
  const propId = await S.saveProposal(siteId, site.version, instruction.slice(0, 2000), r.summary, r.ops.map((o) => ({ block: o.block, data: o.data, error: skipped.find((s) => s.block === o.block)?.error ?? null })), r.usage);
  await q(`update patch_proposals set status = $2 where id = $1`, [propId, applied.length ? "applied" : "rejected"]);
  if (applied.length) await S.saveSiteConfig(siteId, config, "Builder Agent", r.summary.slice(0, 120), runChecks(tpl, config).filter((x) => x.ok).length);
  await logRun("builder", applied.length ? "fixed" : "no_change", { jobId, clientId, detail: { summary: r.summary, applied, skipped }, usage: r.usage });
  return applied.length > 0;
}

async function ensureLegal(siteId: string, tpl: Template, shopName: string) {
  const site = (await S.getSite(siteId))!;
  if (!tpl.blocks.includes("legal") || site.config.legal) return;
  const config = { ...site.config, legal: { pdpa: pdpaText(shopName) } };
  await S.saveSiteConfig(siteId, config, "Builder Agent", "เพิ่มนโยบายความเป็นส่วนตัวมาตรฐาน", runChecks(tpl, config).filter((x) => x.ok).length);
}

// ---------- Design ----------
const FOOD_TEMPLATES = [
  { id: "T1", name: "Bento Cafe", fits: "คาเฟ่ ร้านกาแฟ เบเกอรี ของหวาน · เน้นรูปและเมนูสั้น" },
  { id: "T3", name: "Thai Food Delivery", fits: "ร้านอาหาร อาหารตามสั่ง เดลิเวอรี · เมนูเยอะ มีชุดอาหารและคำถามที่พบบ่อย" },
];
/** Design: ดูภาพ ref และรูปร้าน แล้วกำหนดเทมเพลต ชุดสี ฟอนต์ โทนภาษา · ค่าที่ไม่ผ่านการตรวจใช้ของเทมเพลตแทน */
export async function runDesign(jobId: string, clientId: string): Promise<Design> {
  const shop = await shopOf(clientId);
  // ธุรกิจที่มีเทมเพลตของตัวเอง (เต็นท์รถ ที่พัก): หน้าตาและชุดสีล็อกตามเทมเพลตที่อนุมัติแล้ว · ไม่ต้องให้ Design เลือก
  const biz = businessOf(typeof shop.type === "string" ? shop.type : null);
  if (biz !== "restaurant" && biz !== "cafe") {
    const tpl = agentTemplateFor(typeof shop.type === "string" ? shop.type : null);
    const label = { car_dealer: "เต็นท์รถ", hotel_camp: "ที่พัก", general: "ธุรกิจทั่วไป" }[biz];
    const brief = { template: tpl, theme: {}, tone: "", heroPhoto: null, rationale: `ใช้เทมเพลต ${tpl} ของ${label} (ชุดสีและฟอนต์ล็อกตามเทมเพลต)`, usedRef: false, dropped: [] as string[] };
    await q(`update jobs set design_brief = $2 where id = $1`, [jobId, JSON.stringify(brief)]);
    await logRun("design", "designed", { jobId, clientId, detail: { summary: brief.rationale, ...brief } });
    return brief;
  }
  const files = (await q<{ id: string; kind: DraftImage["kind"]; mime: string; bytes: Buffer }>(`select id::text, kind, mime, bytes from client_files where client_id = $1 order by (kind = 'ref') desc, (kind = 'logo') desc, id limit 6`, [clientId]))
    .map((f) => ({ ...f, mime: f.mime as SlipImageMime }));
  const { data: b, usage } = await designBrief({ templates: FOOD_TEMPLATES, fonts: FONTS, shop, notes: await S.clientNotes(clientId), images: files });
  const template = FOOD_TEMPLATES.some((t) => t.id === b.template) ? b.template : pickTemplate(shop.type, null);
  const { theme, dropped } = sanitizeTheme(template, { primary: b.primary, accent: b.accent, bg: b.bg, text: b.text, heading: b.heading_font, font: b.body_font, radius: b.radius });
  const heroPhoto = files.some((f) => f.kind === "photo" && `file:${f.id}` === b.hero_photo) ? b.hero_photo : null;
  const brief = { template, theme, tone: b.tone.slice(0, 200), heroPhoto, rationale: b.rationale.slice(0, 400), usedRef: files.some((f) => f.kind === "ref"), dropped };
  await q(`update jobs set design_brief = $2 where id = $1`, [jobId, JSON.stringify(brief)]);
  await logRun("design", "designed", { jobId, clientId, detail: { summary: brief.rationale, ...brief }, usage });
  return brief;
}

// ---------- Dev ----------
export interface TechResult { ok: boolean; skipped?: boolean; problems: string[]; checked: { images: number; bytes: number } }
/** Dev: เปิดหน้าตัวอย่างจริงบน Site Engine แล้วตรวจว่าใช้งานได้ · ไม่ใช้ Claude */
export async function techCheck(siteId: string): Promise<TechResult> {
  const url = previewUrl(siteId, 600);
  if (!url) return { ok: true, skipped: true, problems: [], checked: { images: 0, bytes: 0 } }; // ยังไม่ได้ตั้ง Site Engine
  const problems: string[] = [];
  let html = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    html = await res.text();
    if (res.status !== 200) problems.push(`หน้าตัวอย่างตอบ ${res.status}`);
  } catch (e) { return { ok: false, problems: [`เปิดหน้าตัวอย่างไม่ได้: ${(e as Error).message}`], checked: { images: 0, bytes: 0 } }; }
  if (problems.length) return { ok: false, problems, checked: { images: 0, bytes: html.length } };
  if (!/<h1[\s>]/.test(html)) problems.push("ไม่มีหัวข้อหลัก (h1)");
  if (html.length > 1_500_000) problems.push(`หน้าใหญ่เกินไป (${Math.round(html.length / 1024)} KB)`);
  const origin = new URL(url).origin;
  const all = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")))];
  const imgs = sameOriginOnly(all, origin).slice(0, 40);
  if (all.length > imgs.length) problems.push(`มีรูปจากเว็บภายนอก ${all.length - imgs.length} รูป (ต้องเป็นรูปของลูกค้าที่อัปโหลดเท่านั้น)`);
  for (const src of imgs) {
    try {
      const r = await fetch(src.startsWith("http") ? src : origin + src, { signal: AbortSignal.timeout(15_000) });
      if (r.status !== 200 || !(r.headers.get("content-type") ?? "").startsWith("image/")) problems.push(`รูปโหลดไม่ได้ (${r.status}): ${src.split("?")[0].slice(-40)}`);
    } catch { problems.push(`รูปโหลดไม่ได้: ${src.split("?")[0].slice(-40)}`); }
  }
  for (const m of html.matchAll(/href="(https:\/\/line\.me\/[^"]*)"/g)) if (!/^https:\/\/line\.me\/R\/ti\/p\/(%40|@)[\w.%-]{2,}$/.test(m[1])) problems.push(`ลิงก์ LINE ผิดรูปแบบ: ${m[1].slice(0, 60)}`);
  return { ok: problems.length === 0, problems: problems.slice(0, 8), checked: { images: imgs.length, bytes: html.length } };
}

export type PipelineResult = "sent" | "waiting_customer" | "needs_human" | "skipped";
/**
 * เดินงานที่อยู่ขั้น "ทำเว็บ" ให้ถึงมือลูกค้า: ร่าง (ถ้ายังไม่มี) → แก้ตามคำขอ → QA ตรวจ → แก้ → ตรวจซ้ำ
 * ผ่าน = ส่งตัวอย่างให้ลูกค้าในแชท · ขาดข้อมูล = ถามลูกค้า · ไม่ผ่านเกิน 2 รอบ = ส่งต่อคนพร้อมเหตุผล
 */
export async function runPipeline(jobId: string, opts: { instruction?: string; force?: boolean } = {}): Promise<PipelineResult> {
  if (!agentsEnabled()) return "skipped";
  const lock = await q<{ client_id: string }>(`update jobs set agent_status = 'running', agent_note = null where id = $1 and stage = 'template' and (agent_status is distinct from 'running' or $2) returning client_id`, [jobId, !!opts.force]);
  if (!lock.length) return "skipped";
  const clientId = lock[0].client_id;
  const finish = async (status: Exclude<PipelineResult, "skipped">, note: string | null) => { await q(`update jobs set agent_status = $2, agent_note = $3 where id = $1`, [jobId, status, note]); return status; };
  try {
    let siteId = (await one<{ s: string | null }>(`select site_id s from jobs where id = $1`, [jobId]))?.s ?? null;
    if (!siteId) {
      const design = await runDesign(jobId, clientId);
      const d = await draftForJob(jobId, { by: "Builder Agent", force: true, design });
      siteId = d.siteId;
      await logRun("builder", "drafted", { jobId, clientId, detail: { summary: d.summary, applied: d.applied, skipped: d.skipped } });
    }
    const tpl = await S.templateOf((await S.getSite(siteId))!);
    await ensureLegal(siteId, tpl, (await shopOf(clientId)).name);
    if (opts.instruction) await applyFix(jobId, clientId, siteId, opts.instruction);

    for (let round = 0; ; round++) {
      const site = (await S.getSite(siteId))!;
      const shop = await shopOf(clientId, siteId);
      const missing = tpl.required.filter((b) => !(b in site.config));
      const used = new Set(JSON.stringify(site.config).match(/file:\d+/g) ?? []);
      const images = (await q<{ id: string; kind: DraftImage["kind"]; mime: string; bytes: Buffer }>(`select id::text, kind, mime, bytes from client_files where client_id = $1 and kind <> 'ref' order by id limit 20`, [clientId]))
        .filter((f) => used.has(`file:${f.id}`)).slice(0, 6).map((f) => ({ ...f, mime: f.mime as SlipImageMime }));
      const { data: rv, usage } = await reviewSite({ template: tpl, shop, config: site.config, editRequest: opts.instruction, missingRequired: missing, images });
      const blockers = rv.issues.filter((i) => i.severity === "block");
      const checks = runChecks(tpl, site.config);
      const passed = rv.pass && blockers.length === 0 && checks.every((c) => c.ok);
      await logRun("qa", passed ? "pass" : "fail", { jobId, clientId, detail: { round, issues: rv.issues, missing, failedChecks: checks.filter((c) => !c.ok).map((c) => c.name), ask: rv.missing_from_customer }, usage });

      if (passed) {
        // Dev ตรวจหน้าเว็บจริงบน Engine ก่อนถึงมือลูกค้า · ปัญหาทางเทคนิค Builder แก้เองไม่ได้ → ส่งต่อคน
        const tech = await techCheck(siteId);
        await logRun("dev", tech.ok ? (tech.skipped ? "skipped" : "pass") : "fail", { jobId, clientId, detail: tech });
        if (!tech.ok) {
          const why = `ตรวจทางเทคนิคไม่ผ่าน: ${tech.problems.join(" · ")}`.slice(0, 500);
          await notify({ type: "agent.escalated", jobId, reason: why });
          return finish("needs_human", why);
        }
        await q(`update jobs set checks_passed = 6, followed_up_at = null where id = $1`, [jobId]);
        await S.moveJob(jobId, "client_review", "system");
        const { sendForReview } = await import("./order-chat");
        await sendForReview(clientId);
        return finish("sent", null);
      }
      // ขาดข้อมูลที่มีแต่ลูกค้ารู้ และไม่มีอะไรให้ Builder แก้แล้ว → Intake ถามลูกค้า
      const questions = [...new Set([...missing.map((b) => ASK[b]).filter(Boolean), ...rv.missing_from_customer])].slice(0, 5);
      if (questions.length && blockers.length === 0) {
        const { awaitCustomerInfo } = await import("./order-chat");
        await awaitCustomerInfo(clientId);
        await S.sendSystemMessage(clientId, `เว็บของคุณใกล้เสร็จแล้วค่ะ ขอข้อมูลเพิ่มอีกนิดนะคะ\n${questions.map((x, i) => `${i + 1}) ${x}`).join("\n")}\n\nพิมพ์ตอบในแชทนี้ได้เลยค่ะ`);
        await logRun("intake", "asked", { jobId, clientId, detail: { questions } });
        return finish("waiting_customer", questions.join(" · "));
      }
      if (round >= MAX_FIX_ROUNDS) {
        const why = [...blockers.map((b) => `${b.block}: ${b.problem}`), ...checks.filter((c) => !c.ok).map((c) => `ตรวจไม่ผ่าน: ${c.name}`)].join(" · ").slice(0, 500) || "QA ไม่ผ่าน";
        await logRun("qa", "escalated", { jobId, clientId, detail: { why } });
        await notify({ type: "agent.escalated", jobId, reason: why });
        return finish("needs_human", why);
      }
      const fixed = await applyFix(jobId, clientId, siteId, `แก้ตามผลตรวจ QA ต่อไปนี้ให้ครบ ห้ามแต่งข้อมูลที่ไม่มีในข้อมูลร้าน:\n${blockers.map((b, i) => `${i + 1}) [${b.block}] ${b.problem} → ${b.fix}`).join("\n") || "ทำให้ผ่านการตรวจ: " + checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
      if (!fixed) round = MAX_FIX_ROUNDS - 1; // แก้ไม่ได้ → ตรวจอีกรอบเดียวแล้วส่งต่อคน
    }
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await logRun("ops", "error", { jobId, clientId, detail: { error: msg } });
    await notify({ type: "agent.escalated", jobId, reason: `Agent ทำงานผิดพลาด: ${msg}` });
    return finish("needs_human", `Agent ทำงานผิดพลาด: ${msg}`);
  }
}

/** Intake: ลูกค้าตอบข้อมูลที่ถามไป → จดเป็นข้อมูลจริงของร้าน แล้วเดินงานต่อ */
export async function customerAnswered(clientId: string, text: string) {
  await S.addNote(clientId, `[ลูกค้าแจ้ง] ${text.slice(0, 800)}`);
  const j = await one<{ id: string }>(`select id from jobs where client_id = $1 and stage = 'template' order by created_at desc limit 1`, [clientId]);
  if (!j) return;
  await logRun("intake", "answered", { jobId: j.id, clientId });
  await runPipeline(j.id, { force: true, instruction: `ลูกค้าให้ข้อมูลเพิ่ม: "${text.slice(0, 800)}" · นำไปเติมในบล็อกที่เกี่ยวข้อง (เช่น line.id, hours, map.address, menu) โดยใช้เฉพาะข้อมูลที่ลูกค้าให้` });
}

// ---------- Sales ----------
const SALES_DAILY_LIMIT = 20;
/** เพดานรวมทั้งระบบต่อวัน (กันค่า API บานเมื่อมีคนยิงแชทจำนวนมาก) */
const SALES_GLOBAL_DAILY_LIMIT = Number(process.env.SALES_GLOBAL_DAILY_LIMIT ?? 500);
/** ตอบคำถามที่ปุ่มตอบไม่ได้ · คืน true ถ้า Agent ตอบแล้ว (false = ปล่อยให้ทีมตอบ) */
export async function salesAnswer(clientId: string, text: string): Promise<boolean> {
  if (!agentsEnabled() || (process.env.SALES_AGENT ?? "on") === "off") return false;
  if (text.trim().length < 2 || text.length > 1000) return false;
  const n = await one<{ n: number }>(`select count(*)::int n from agent_runs where client_id = $1 and agent = 'sales' and created_at > now() - interval '1 day'`, [clientId]);
  if ((n?.n ?? 0) >= SALES_DAILY_LIMIT) return false;
  const all = await one<{ n: number }>(`select count(*)::int n from agent_runs where agent = 'sales' and created_at > now() - interval '1 day'`);
  if ((all?.n ?? 0) >= SALES_GLOBAL_DAILY_LIMIT) return false;
  const facts = await salesFacts();
  const { data, usage } = await salesReply({ facts, history: (await S.listMessages(clientId)).map((m) => ({ from: m.from, text: m.text })), message: text });
  const reply = data.reply.trim();
  if (data.action === "handoff" || !reply) {
    await logRun("sales", "handoff", { clientId, detail: { reason: data.reason }, usage });
    return false;
  }
  // ด่านสุดท้ายก่อนถึงลูกค้า: ราคาแต่ง ลิงก์นอก ส่วนลด หรือเผยคำสั่งภายใน → ไม่ส่ง ให้คนตอบแทน
  const guard = checkSalesReply(reply, facts);
  if (!guard.ok) {
    await logRun("sales", "blocked", { clientId, detail: { reason: guard.reason }, usage });
    return false;
  }
  await S.sendSystemMessage(clientId, reply.slice(0, 1000));
  await logRun("sales", "replied", { clientId, detail: { reason: data.reason }, usage });
  return true;
}
async function salesFacts() {
  const items = await q<{ code: string; name: string; price: number; recurring: boolean }>(`select code, name, price_satang::int price, recurring from catalog_items where active order by price_satang`);
  const { depositPercent } = await import("./order-chat");
  const { FREE_EDITS } = await import("./portal");
  const b = (s: number) => `${(s / 100).toLocaleString("th-TH")} บาท`;
  return [
    "บริการ: ทำเว็บไซต์ / landing page ให้ทุกธุรกิจ เลือกจากเทมเพลตแล้วปรับตามที่ต้องการ (ร้านอาหาร คาเฟ่ เต็นท์รถ ที่พัก คลินิก ช่าง ร้านค้า โรงเรียน บริษัท ฯลฯ) ทุกขั้นตอนทำผ่านแชท LINE นี้",
    "งานตามโจทย์ (เว็บไซต์ออกแบบเฉพาะ งานหน่วยงานภาครัฐ ระบบงาน): ราคาตามขอบเขตงาน ทีมงานสรุปขอบเขตและราคาให้ก่อนเริ่ม · ถ้าลูกค้าถามเรื่องนี้ให้ handoff เพื่อให้ทีมคุยรายละเอียด",
    "ราคา:", ...items.map((i) => `- ${i.name}: ${b(i.price)}${i.recurring ? " ต่อปี" : ""} (${i.code})`),
    depositPercent() ? `มัดจำตอนยืนยันสั่งทำ: ${depositPercent()}% ของราคาแพ็ก ส่วนที่เหลือชำระเมื่ออนุมัติเว็บ` : "ไม่มีมัดจำ: ทำตัวอย่างเว็บให้ดูบนที่อยู่ฟรีก่อน ถ้าถูกใจค่อยชำระเต็มจำนวนตอนอนุมัติ แล้วเว็บขึ้นออนไลน์ (และผูกโดเมนจริงถ้าเลือกแพ็กที่รวมโดเมน)",
    "ค่าดูแลรายปี (รายการที่ต่อปี) ไม่บังคับต่อ ลูกค้าเลือกต่อหรือไม่ก็ได้",
    "หลังเว็บออนไลน์ ลูกค้าแก้เว็บเองได้ฟรี 1 ปี (รูปหน้าแรก เมนู/สินค้า/บริการ ราคา เวลาเปิด คำถามที่พบบ่อย) โดยพิมพ์ \"แก้เว็บ\" ในแชทเพื่อรับลิงก์ · ปีต่อไปแก้เองได้ถ้าต่อค่าดูแลรายปี · ถ้าไม่ต่อ เว็บยังออนไลน์ตามปกติ",
    `แก้ฟรี ${FREE_EDITS} รอบ หลังจากนั้นคิดตามรายการ EDIT-X`,
    `ขั้นตอน: เลือกแพ็ก → ยืนยันสั่งทำ${depositPercent() ? "และโอนมัดจำ" : ""} → กรอกข้อมูลร้านและส่งรูปในแชท → ได้ตัวอย่างเว็บให้ตรวจในแชท → อนุมัติหรือขอแก้ → ชำระ${depositPercent() ? "ส่วนที่เหลือ" : "เต็มจำนวน"} → เว็บออนไลน์`,
    "ชำระเงิน: โอนผ่านพร้อมเพย์ตาม QR ที่ส่งในแชท แล้วส่งสลิปในแชท",
    "ลูกค้าส่งรูปร้าน รูปเมนู โลโก้ และภาพเว็บที่ชอบ (ref) ในแชทได้",
    "คำสั่งในแชท: พิมพ์ \"แพ็กเกจ\" เพื่อเลือกแพ็ก · \"สถานะ\" เพื่อดูความคืบหน้า",
    ...(process.env.SALES_FACTS_EXTRA ? ["ข้อมูลเพิ่มจากร้าน:", process.env.SALES_FACTS_EXTRA] : []),
  ].join("\n");
}
