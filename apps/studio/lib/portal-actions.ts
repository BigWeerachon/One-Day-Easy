"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as P from "./portal";

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
    return r === "needs-payment" ? `extra=${encodeURIComponent(text.slice(0, 1000))}` : "ok=edit";
  });
}
export async function paidEditAction(f: FormData) { await withCtx(f, async (ctx) => { await P.confirmPaidEdit(ctx, s(f, "text")); return "ok=edit"; }); }
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
  const values = Object.fromEntries(["name", "phone", "hours", "customerType", "legalName", "taxId", "branch", "branchNo", "address", "poNo"].map((k) => [k, s(f, k)]));
  values.wht = f.get("wht") === "on" ? "1" : ""; values.pdpa = f.get("pdpa") === "on" ? "1" : "";
  try {
    await P.submitIntake(r.ctx, {
      name: values.name, phone: values.phone, hours: values.hours, customerType: values.customerType, pdpa: !!values.pdpa,
      legalName: values.legalName, taxId: values.taxId, branch: values.branch === "branch" ? `สาขา ${values.branchNo.trim()}` : "สำนักงานใหญ่",
      address: values.address, poNo: values.poNo, wht: !!values.wht,
    }, await images(f, "photos", 10));
  } catch (e) {
    return { error: (e as Error).message, values, nonce: Date.now() };
  }
  revalidatePath(`/p/${token}`);
  redirect(`/p/${token}?ok=intake`);
}
