import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { q, one, tx } from "./db";
import * as S from "./store";
import { validTaxId, validThaiPhone } from "./thai";
import type { Stage } from "./workflow";

export const LINK_DAYS = 7;
export const FREE_EDITS = 2;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const PACKAGE_ITEM: Record<string, string> = { Start: "PKG-START", Basic: "PKG-BASIC", Pro: "PKG-PRO", Business: "PKG-BIZ" };
export const portalUrl = (token: string) => `${(process.env.PORTAL_BASE_URL ?? process.env.STUDIO_URL ?? "").replace(/\/$/, "")}/p/${token}`;

/** สร้างลิงก์ใหม่ให้งานล่าสุดของลูกค้า · ลิงก์เก่าของงานนั้นถูกยกเลิก */
export async function createPortalLink(clientId: string, by: string) {
  const job = await one<{ id: string }>(`select id from jobs where client_id = $1 order by created_at desc limit 1`, [clientId]);
  if (!job) throw new Error("ลูกค้านี้ยังไม่มีงาน");
  const token = randomBytes(24).toString("base64url");
  await tx(async (c) => {
    await c.query(`update portal_links set revoked = true where job_id = $1 and not revoked`, [job.id]);
    await c.query(`insert into portal_links (token_hash, client_id, job_id, expires_at, created_by) values ($1,$2,$3, now() + interval '1 day' * $4, $5)`, [sha(token), clientId, job.id, LINK_DAYS, by]);
  });
  return token;
}

/** ส่งลิงก์ไปที่ LINE ของลูกค้า (ถ้ามี) · คืน token เสมอเพื่อให้ทีมคัดลอกได้ */
export async function sendPortalLink(clientId: string, by: string) {
  const token = await createPortalLink(clientId, by);
  const sent = Boolean(await S.lineUserIdOf(clientId));
  await S.sendSystemMessage(clientId, `ลิงก์ส่วนตัวสำหรับทำเว็บของคุณ (ใช้ได้ ${LINK_DAYS} วัน):\n${portalUrl(token)}`);
  return { token, sent };
}

export interface PortalCtx {
  token: string; clientId: string; jobId: string; expiresAt: string;
  client: { name: string; phone: string | null; openingHours: string | null; customerType: string; legalName: string | null; taxId: string | null; branch: string | null; address: string | null; poNo: string | null; wht: boolean; pkg: string | null };
  job: { stage: Stage; editRounds: number; editRequests: { round: number; text: string; paid: boolean; at: string }[]; pdpa: boolean };
  site: { domain: string; version: number; config: Record<string, unknown>; status: string } | null;
}
export type Resolved = { status: "ok"; ctx: PortalCtx } | { status: "expired"; clientId: string; jobId: string } | { status: "invalid" };

export async function resolvePortal(token: string): Promise<Resolved> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: "invalid" };
  const l = await one<{ client_id: string; job_id: string; expires_at: string; revoked: boolean; live: boolean }>(
    `select client_id, job_id, expires_at::text, revoked, expires_at > now() live from portal_links where token_hash = $1`, [sha(token)]);
  if (!l) return { status: "invalid" };
  if (l.revoked || !l.live) return { status: "expired", clientId: l.client_id, jobId: l.job_id };
  await q(`update portal_links set last_seen_at = now() where token_hash = $1`, [sha(token)]);
  const client = (await one<PortalCtx["client"]>(`select name, phone, opening_hours "openingHours", customer_type "customerType", legal_name "legalName", tax_id "taxId", branch, address, po_no "poNo", wht, package pkg from clients where id = $1`, [l.client_id]))!;
  const job = (await one<PortalCtx["job"] & { siteId: string | null }>(`select stage, edit_rounds "editRounds", edit_requests "editRequests", pdpa_consent pdpa, site_id "siteId" from jobs where id = $1`, [l.job_id]))!;
  const site = job.siteId ? (await one<NonNullable<PortalCtx["site"]>>(`select domain, version, config, status from sites where id = $1`, [job.siteId])) ?? null : null;
  return { status: "ok", ctx: { token, clientId: l.client_id, jobId: l.job_id, expiresAt: l.expires_at, client, job, site } };
}

/** ลิงก์หมดอายุ → ส่งลิงก์ใหม่ไปที่ LINE ที่ลงทะเบียนไว้เท่านั้น · จำกัด 1 ครั้งต่อ 10 นาที */
export async function requestNewLink(oldToken: string): Promise<"sent" | "no-line" | "too-soon" | "invalid"> {
  const l = await one<{ client_id: string; job_id: string }>(`select client_id, job_id from portal_links where token_hash = $1`, [sha(oldToken)]);
  if (!l) return "invalid";
  if (!(await S.lineUserIdOf(l.client_id))) return "no-line";
  const recent = await one(`select 1 from portal_links where job_id = $1 and created_at > now() - interval '10 minutes' and created_by = 'portal'`, [l.job_id]);
  if (recent) return "too-soon";
  await sendPortalLink(l.client_id, "portal");
  return "sent";
}

// ---------- ขั้นที่ 1: ข้อมูลร้าน ----------
export interface IntakeForm { name: string; phone: string; hours: string; customerType: string; pdpa: boolean; legalName?: string; taxId?: string; branch?: string; address?: string; poNo?: string; wht?: boolean }
export async function submitIntake(ctx: PortalCtx, f: IntakeForm, files: { mime: string; bytes: Buffer }[]) {
  if (!["new_chat", "intake"].includes(ctx.job.stage)) throw new Error("ส่งข้อมูลไปแล้ว ทีมงานกำลังทำเว็บ");
  if (!f.pdpa) throw new Error("ต้องยินยอมให้ใช้ข้อมูลก่อนส่ง");
  if (!f.name.trim()) throw new Error("ต้องใส่ชื่อร้าน");
  if (f.phone && !validThaiPhone(f.phone)) throw new Error("เบอร์โทรไม่ถูกต้อง");
  if (!["person", "company", "government", "foreigner"].includes(f.customerType)) throw new Error("ประเภทลูกค้าไม่ถูกต้อง");
  const company = f.customerType === "company" || f.customerType === "government";
  if (company) {
    if (!f.legalName?.trim()) throw new Error("ต้องใส่ชื่อตามหนังสือรับรอง");
    if (!f.taxId || !validTaxId(f.taxId)) throw new Error("เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง");
    if (!f.address?.trim()) throw new Error("ต้องใส่ที่อยู่จดทะเบียน");
  }
  if (files.length > 10) throw new Error("ส่งรูปได้ครั้งละไม่เกิน 10 รูป");
  await tx(async (c) => {
    await c.query(`update clients set name = $2, phone = nullif($3,''), opening_hours = nullif($4,''), customer_type = $5,
      legal_name = $6, tax_id = coalesce($7, tax_id), branch = $8, address = coalesce($9, address), po_no = $10, wht = $11, last_contact_at = now() where id = $1`,
      [ctx.clientId, f.name.trim(), f.phone.replace(/[\s-]/g, ""), f.hours.trim(), f.customerType,
       company ? f.legalName!.trim() : null, company ? f.taxId!.replace(/\D/g, "") : null, company ? (f.branch || "สำนักงานใหญ่") : null,
       company ? f.address!.trim() : null, company ? (f.poNo?.trim() || null) : null, company ? !!f.wht : false]);
    for (const file of files) await c.query(`insert into client_files (client_id, mime, bytes) values ($1,$2,$3)`, [ctx.clientId, file.mime, file.bytes]);
    const complete = Boolean(f.name.trim() && f.phone && f.hours.trim());
    await c.query(`update jobs set pdpa_consent = true, checklist_done = $2 where id = $1`, [ctx.jobId, complete]);
  });
  // เดินขั้นอัตโนมัติตามตาราง N4 (ระบบสั่ง)
  if (ctx.job.stage === "new_chat") await S.moveJob(ctx.jobId, "intake", "system");
  const j = await one<{ checklist_done: boolean }>(`select checklist_done from jobs where id = $1`, [ctx.jobId]);
  if (j?.checklist_done) await S.moveJob(ctx.jobId, "template", "system");
}

// ---------- ขั้นที่ 2: ตรวจเว็บ ----------
export async function approveSite(ctx: PortalCtx) {
  if (ctx.job.stage === "invoice" || ctx.job.stage === "payment") return; // อนุมัติไปแล้ว
  if (ctx.job.stage !== "client_review") throw new Error("ตอนนี้ยังไม่มีเว็บให้อนุมัติ");
  await S.moveJob(ctx.jobId, "invoice", "client");
  // ออกใบแจ้งหนี้จากแคตตาล็อกตามแพ็กเกจทันที (ล็อกราคา ณ ตอนออก) · ไม่มีแพ็กเกจ = รอทีมออกใบเอง
  const item = ctx.client.pkg ? PACKAGE_ITEM[ctx.client.pkg] : undefined;
  const price = item ? await one<{ price: number }>(`select price_satang::int price from catalog_items where code = $1 and active`, [item]) : undefined;
  if (price && !(await one(`select 1 from documents where job_id = $1 and type = 'INV' and status <> 'voided' and total_satang = $2`, [ctx.jobId, price.price]))) {
    await S.issueDoc("INV", ctx.clientId, price.price, ctx.jobId);
  }
  // ทำซ้ำได้ (กดซ้ำ/ส่งซ้ำ) · เดินขั้นเฉพาะตอนยังอยู่ที่ "ออกใบ"
  const now = await one<{ stage: string }>(`select stage from jobs where id = $1`, [ctx.jobId]);
  if (now?.stage === "invoice" && (await one(`select 1 from documents where job_id = $1 and type = 'INV' and status = 'issued'`, [ctx.jobId]))) {
    await S.moveJob(ctx.jobId, "payment", "system");
  }
}

async function recordRequest(ctx: PortalCtx, text: string, paid: boolean) {
  const round = ctx.job.editRounds + 1;
  await q(`update jobs set edit_requests = edit_requests || $2::jsonb where id = $1`, [ctx.jobId, JSON.stringify([{ round, text, paid, at: new Date().toISOString() }])]);
  // ให้ทีมเห็นในกล่องข้อความ
  await q(`insert into messages (conversation_id, sender, body) select id, 'client', $2 from conversations where client_id = $1`, [ctx.clientId, `[ขอแก้รอบ ${round}${paid ? " · ชำระเพิ่ม" : ""}] ${text}`]);
  await S.moveJob(ctx.jobId, "template", "client");
}
export async function requestEdit(ctx: PortalCtx, text: string): Promise<"sent" | "needs-payment"> {
  if (ctx.job.stage !== "client_review") throw new Error("ตอนนี้ยังขอแก้ไม่ได้");
  const t = text.trim();
  if (t.length < 3 || t.length > 1000) throw new Error("บอกสิ่งที่อยากแก้ 3–1,000 ตัวอักษร");
  if (ctx.job.editRounds >= FREE_EDITS) return "needs-payment";
  await recordRequest(ctx, t, false);
  return "sent";
}
export const extraEditPrice = async () => (await one<{ price: number }>(`select price_satang::int price from catalog_items where code = 'EDIT-X' and active`))?.price ?? null;
export async function confirmPaidEdit(ctx: PortalCtx, text: string) {
  if (ctx.job.stage !== "client_review") throw new Error("ตอนนี้ยังขอแก้ไม่ได้");
  const price = await extraEditPrice();
  if (!price) throw new Error("ยังไม่ได้ตั้งราคาแก้เพิ่ม (EDIT-X)");
  const t = text.trim();
  if (t.length < 3 || t.length > 1000) throw new Error("บอกสิ่งที่อยากแก้ 3–1,000 ตัวอักษร");
  await S.issueDoc("INV", ctx.clientId, price, ctx.jobId);
  await recordRequest(ctx, t, true);
}

// ---------- ขั้นที่ 3: ชำระเงิน ----------
export const openDocs = (ctx: PortalCtx) => q<{ no: string; type: string; total: number; paid: number; issuedAt: string }>(
  `select no, type, total_satang::int total, paid_satang::int paid, issued_at::text "issuedAt" from documents
   where client_id = $1 and status = 'issued' and type in ('INV','RN') and (job_id = $2 or job_id is null) order by issued_at, no`, [ctx.clientId, ctx.jobId]);
export const latestSlip = (ctx: PortalCtx) => one<{ id: string; status: string; amount: number | null; checks: { rule: string; ok: boolean }[] | null; at: string }>(
  `select id::text, status, coalesce(amount_satang, ((read->>'amount')::numeric * 100)::int) amount, checks, created_at::text at from slips where client_id = $1 and source = 'portal' order by id desc limit 1`, [ctx.clientId]);
export async function uploadSlip(ctx: PortalCtx, file: { mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; bytes: Buffer }) {
  if (!(await openDocs(ctx)).length) throw new Error("ไม่มียอดค้างชำระ");
  const recent = await one<{ n: number }>(`select count(*)::int n from slips where client_id = $1 and source = 'portal' and created_at > now() - interval '1 hour'`, [ctx.clientId]);
  if ((recent?.n ?? 0) >= 10) throw new Error("ส่งสลิปบ่อยเกินไป กรุณาทักทีมงาน");
  const id = await S.createSlipFromImage({ clientId: ctx.clientId, source: "portal", bytes: file.bytes, mime: file.mime });
  if (!id) throw new Error("บันทึกสลิปไม่สำเร็จ");
  const r = await S.processSlip(id);
  await S.notifySlipResult(id, r.outcome);
  return r.outcome;
}

// ---------- ขั้นที่ 4: เสร็จ ----------
export const latestReceipt = (ctx: PortalCtx) => one<{ no: string; total: number }>(`select no, total_satang::int total from documents where client_id = $1 and type = 'RC' and (job_id = $2 or job_id is null) order by issued_at desc, no desc limit 1`, [ctx.clientId, ctx.jobId]);
