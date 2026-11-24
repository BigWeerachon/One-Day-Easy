"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { one } from "./db";
import { aiConfigured } from "./ai";
import { draftForJob } from "./draft";
import { agentsEnabled, runPipeline } from "./agents";
import { revalidatePath } from "next/cache";
import * as P from "./portal";
import * as SE from "./self-edit";

const IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Img = (typeof IMG)[number];
const s = (f: FormData, k: string) => String(f.get(k) ?? "");

// ทุก action ตรวจ token ใหม่ทุกครั้ง · ลิงก์หมดอายุ/ถูกยกเลิก = ทำอะไรไม่ได้
async function withCtx(f: FormData, fn: (ctx: P.PortalCtx) => Promise<string | void>) {
  const token = s(f, "t");
  const r = await P.resolvePortal(token);
  if (r.status !== "ok") redirect(`/p/${encodeURIComponent(token)}`);
  let to = `/p/${token}`, err: string | undefined;
  try { const next = await fn(r.ctx); if (next) to = `/p/${token}?${next}`; } catch (e) { err = (e as Error).message; }
  revalidatePath(`/p/${token}`);
  redirect(err ? `/p/${token}?err=${encodeURIComponent(err)}` : to);
}
async function images(f: FormData, key: string, max: number) {
  const out: { mime: Img; bytes: Buffer }[] = [];
  for (const v of f.getAll(key)) {
    if (!(v instanceof File) || v.size === 0) continue;
    const mime = IMG.find((m) => m === v.type);
    if (!mime) throw new Error("รองรับเฉพาะรูป JPG, PNG, WebP, GIF");
    if (v.size > 5 * 1024 * 1024) throw new Error("รูปใหญ่เกิน 5 MB");
    out.push({ mime, bytes: Buffer.from(await v.arrayBuffer()) });
    if (out.length > max) throw new Error(`ส่งได้ไม่เกิน ${max} รูป`);
  }
  return out;
}

export async function approveAction(f: FormData) { await withCtx(f, async (ctx) => { await P.approveSite(ctx); return "ok=approved"; }); }
export async function requestEditAction(f: FormData) {
  await withCtx(f, async (ctx) => {
    const text = s(f, "text");
    const r = await P.requestEdit(ctx, text);
    if (r === "sent") agentEditLater(ctx.jobId, text);
    return r === "needs-payment" ? `extra=${encodeURIComponent(text.slice(0, 1000))}` : "ok=edit";
  });
}
export async function paidEditAction(f: FormData) { await withCtx(f, async (ctx) => { await P.confirmPaidEdit(ctx, s(f, "text")); agentEditLater(ctx.jobId, s(f, "text")); return "ok=edit"; }); }
/** ลูกค้าขอแก้ใน Portal → Agent แก้ ตรวจ แล้วส่งตัวอย่างใหม่ (ทำหลังตอบหน้าเว็บแล้ว) */
function agentEditLater(jobId: string, text: string) {
  if (!agentsEnabled()) return;
  after(async () => { try { await runPipeline(jobId, { force: true, instruction: `ลูกค้าขอแก้: "${text.slice(0, 1000)}"` }); revalidatePath("/", "layout"); } catch (e) { console.error("agent edit", e); } });
}
export async function slipAction(f: FormData) {
  await withCtx(f, async (ctx) => {
    const [img] = await images(f, "slip", 1);
    if (!img) throw new Error("เลือกรูปสลิปก่อน");
    const outcome = await P.uploadSlip(ctx, img);
    return outcome === "approved" ? "ok=paid" : "ok=slip";
  });
}
export async function newLinkAction(f: FormData) {
  const token = s(f, "t");
  const r = await P.requestNewLink(token);
  redirect(`/p/${encodeURIComponent(token)}?link=${r}`);
}

export interface IntakeState { error?: string; values?: Record<string, string>; nonce?: number }
/** ใช้กับ useActionState · ผิดพลาด = คืนค่าที่กรอกไว้ให้ฟอร์มเดิม (ไม่ต้องพิมพ์ใหม่) */
export async function intakeStateAction(_prev: IntakeState, f: FormData): Promise<IntakeState> {
  const token = s(f, "t");
  const r = await P.resolvePortal(token);
  if (r.status !== "ok") redirect(`/p/${encodeURIComponent(token)}`);
  const values = Object.fromEntries(["name", "phone", "email", "hours", "customerType", "legalName", "taxId", "branch", "branchNo", "address", "poNo"].map((k) => [k, s(f, k)]));
  values.wht = f.get("wht") === "on" ? "1" : ""; values.pdpa = f.get("pdpa") === "on" ? "1" : "";
  try {
    await P.submitIntake(r.ctx, {
      name: values.name, phone: values.phone, email: values.email, hours: values.hours, customerType: values.customerType, pdpa: !!values.pdpa,
      legalName: values.legalName, taxId: values.taxId, branch: values.branch === "branch" ? `สาขา ${values.branchNo.trim()}` : "สำนักงานใหญ่",
      address: values.address, poNo: values.poNo, wht: !!values.wht,
    }, await images(f, "photos", 10));
  } catch (e) {
    return { error: (e as Error).message, values, nonce: Date.now() };
  }
  // ข้อมูลครบ (งานเข้าขั้น "เลือกเทมเพลต") → ให้ Claude ร่างเว็บฉบับแรกทันที ทีมแค่ตรวจแล้วส่ง
  const jobId = r.ctx.jobId;
  if ((process.env.AUTO_DRAFT ?? "on") !== "off" && aiConfigured()) {
    after(async () => {
      try {
        const j = await one<{ stage: string; site_id: string | null }>(`select stage, site_id from jobs where id = $1`, [jobId]);
        if (j?.stage !== "template" || j.site_id) return;
        // มีทีม Agent = ร่าง → QA → ส่งลูกค้าตรวจเอง · ปิด Agent = ร่างอย่างเดียว รอทีมตรวจ
        if (agentsEnabled()) await runPipeline(jobId); else await draftForJob(jobId);
        revalidatePath("/", "layout");
      } catch (e) { console.error("auto draft", e); }
    });
  }
  revalidatePath(`/p/${token}`);
  redirect(`/p/${token}?ok=intake`);
}

// ---------- แก้เว็บเอง (หลังออนไลน์) ----------
async function withEdit(f: FormData, fn: (ctx: P.PortalCtx, version: number) => Promise<void>, ok: string) {
  const token = s(f, "t");
  const r = await P.resolvePortal(token);
  if (r.status !== "ok") redirect(`/p/${encodeURIComponent(token)}`);
  let err: string | undefined;
  try { await fn(r.ctx, Number(s(f, "v"))); } catch (e) { err = (e as Error).message; }
  revalidatePath(`/p/${token}/edit`);
  redirect(`/p/${token}/edit?${err ? `err=${encodeURIComponent(err)}` : `ok=${ok}`}`);
}
const rowsOf = (f: FormData, n: number) => Array.from({ length: n }, (_, i) => i);
export async function editHeroAction(f: FormData) {
  await withEdit(f, async (ctx, version) => {
    const [image] = await images(f, "image", 1);
    await SE.saveHero(ctx, { version, title: s(f, "title"), subtitle: s(f, "subtitle"), image, removeImage: s(f, "noimage") === "1" });
  }, "hero");
}
export async function editItemsAction(f: FormData) {
  await withEdit(f, async (ctx, version) => {
    const n = Math.min(80, Number(s(f, "n")) || 0);
    const rows: SE.ItemRow[] = [];
    for (const i of rowsOf(f, n)) {
      const [image] = await images(f, `image${i}`, 1);
      rows.push({ name: s(f, `name${i}`), price: s(f, `price${i}`), desc: s(f, `desc${i}`), img: s(f, `img${i}`), image, remove: s(f, `del${i}`) === "1" });
    }
    await SE.saveItems(ctx, { version, rows });
  }, "items");
}
export async function editHoursAction(f: FormData) {
  await withEdit(f, (ctx, version) => SE.saveHours(ctx, { version, days: s(f, "days"), open: s(f, "open"), close: s(f, "close") }), "hours");
}
export async function editFaqAction(f: FormData) {
  await withEdit(f, async (ctx, version) => {
    const n = Math.min(20, Number(s(f, "n")) || 0);
    await SE.saveFaq(ctx, { version, rows: rowsOf(f, n).map((i) => ({ q: s(f, `q${i}`), a: s(f, `a${i}`), remove: s(f, `del${i}`) === "1" })) });
  }, "faq");
}
export async function undoEditAction(f: FormData) { await withEdit(f, (ctx, version) => SE.undoSelfEdit(ctx, version), "undo"); }

export async function editBlockAction(f: FormData) {
  await withEdit(f, (ctx, version) => SE.saveBlock(ctx, {
    version, block: s(f, "block"), n: Math.min(20, Number(s(f, "n")) || 0),
    form: { get: (k) => s(f, k), image: async (k) => (await images(f, k, 1))[0] },
  }), "block");
}
export async function editVisibilityAction(f: FormData) {
  await withEdit(f, (ctx, version) => SE.saveVisibility(ctx, { version, show: f.getAll("show").map(String) }), "visibility");
}
export async function editLogoAction(f: FormData) {
  await withEdit(f, async (ctx, version) => {
    const [image] = await images(f, "logo", 1);
    await SE.saveLogo(ctx, { version, image, remove: s(f, "nologo") === "1" });
  }, "logo");
}
