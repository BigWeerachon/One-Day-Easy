import "server-only";
import { signPreview } from "@ode/blocks/sign";
import { q, one } from "./db";
import type { QuickItem } from "./line";
import * as S from "./store";
import * as P from "./portal";
import { previewUrl, liveUrl } from "./preview";
import { STAGE_LABEL } from "./workflow";

// ขายในแชท LINE: เมนูแพ็กเกจ → เสนอราคา → ยืนยัน → มัดจำ (QR) → ส่งข้อมูล/รูป → ส่งงานให้ตรวจ → อนุมัติหรือขอแก้ → ชำระส่วนที่เหลือ
// ปุ่ม (postback data): od:menu · od:pkg:CODE · od:ok:CODE · od:img:photo|ref · od:approve · od:edit · od:paidedit · od:status
// ข้อความที่ไม่เกี่ยวยังเข้ากล่องข้อความให้ทีมตอบตามปกติ

export const orderBotEnabled = () => (process.env.ORDER_BOT ?? "on") !== "off";
/** มัดจำตอนยืนยันสั่งทำ เป็น % ของราคาแพ็ก · 0 = ไม่เก็บมัดจำ · สูงสุด 90 (ต้องเหลือยอดให้ออกใบตอนส่งงาน) */
export const depositPercent = () => Math.min(90, Math.max(0, Math.round(Number(process.env.ORDER_DEPOSIT_PERCENT ?? 50)) || 0));

const PKG: Record<string, string> = { "PKG-START": "Start", "PKG-BASIC": "Basic", "PKG-PRO": "Pro", "PKG-BIZ": "Business" };
const baht = (satang: number) => `${(satang / 100).toLocaleString("th-TH")} บาท`;
const say = (clientId: string, text: string, quick?: QuickItem[], image?: string) => S.sendSystemMessage(clientId, text, quick, image);
const packages = () => q<{ code: string; name: string; price: number }>(`select code, name, price_satang::int price from catalog_items where active and code like 'PKG-%' order by price_satang`);

interface Session { awaitInfo?: boolean; awaitEdit?: boolean; paidEditText?: string; askedImgAt?: number; askedWithSlip?: boolean }
const key = (userId: string) => `od:${userId}`;
const getSession = async (userId: string) => (await one<{ state: Session }>(`select state from line_booking_sessions where line_user_id = $1`, [key(userId)]))?.state ?? {};
const setSession = (userId: string, s: Session) =>
  q(`insert into line_booking_sessions (line_user_id, state, updated_at) values ($1,$2,now()) on conflict (line_user_id) do update set state = $2, updated_at = now()`, [key(userId), JSON.stringify(s)]);

/** Intake Agent ถามข้อมูลลูกค้าไว้ → ข้อความถัดไปของลูกค้าคือคำตอบ */
export async function awaitCustomerInfo(clientId: string) {
  const userId = await S.lineUserIdOf(clientId);
  if (userId) await setSession(userId, { ...(await getSession(userId)), awaitInfo: true });
}
/** ลูกค้าขอแก้ → ให้ Agent แก้และตรวจ แล้วส่งตัวอย่างใหม่เอง */
async function agentEdit(jobId: string, text: string) {
  const { runPipeline } = await import("./agents");
  await runPipeline(jobId, { force: true, instruction: `ลูกค้าขอแก้: "${text}"` }).catch((e) => console.error("agent edit", e));
}

/** ลิงก์รูป QR พร้อมเพย์ของใบแจ้งหนี้ (ใช้ได้ 7 วัน) · null ถ้าตั้งค่าไม่ครบหรือไม่ใช่ https (LINE ต้องการ https) */
export function qrUrl(docNo: string) {
  const baseUrl = (process.env.STUDIO_URL ?? "").replace(/\/$/, ""), secret = process.env.PREVIEW_SECRET;
  if (!baseUrl || !secret || !process.env.PROMPTPAY_ID) return null;
  if (!baseUrl.startsWith("https://") && process.env.LINE_ALLOW_HTTP_IMAGES !== "1") return null;
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  return `${baseUrl}/api/pay/${encodeURIComponent(docNo)}/qr?exp=${exp}&sig=${signPreview(`pay:${docNo}`, exp, secret)}`;
}
const payHint = () => (process.env.PROMPTPAY_ID ? `พร้อมเพย์ ${process.env.PROMPTPAY_ID}` : "ช่องทางที่ทีมงานแจ้ง");

// ---------- ข้อความเข้า ----------
export type OrderIntent = "menu" | "status";
export function orderIntent(text: string): OrderIntent | null {
  const t = text.toLowerCase();
  if (/สถานะ|ถึงไหน|คืบหน้า|เสร็จ(หรือ)?ยัง|เว็บ(ของ)?(ฉัน|ผม|เรา|หนู).*(ยัง|ไหม)/.test(t)) return "status";
  if (/ทำเว็บ|เว็บไซต์|อยากได้เว็บ|รับทำเว็บ|แพ็ก|package|ราคา|เท่าไ(ร|หร่)|สั่งทำ|สนใจ/.test(t)) return "menu";
  return null;
}

/** คืน true ถ้าบอทตอบเอง */
export async function handleOrderText(clientId: string, userId: string, text: string, firstContact: boolean): Promise<boolean> {
  if (!orderBotEnabled()) return false;
  const sess = await getSession(userId);
  if (sess.awaitInfo) {
    // Intake Agent ถามข้อมูลไว้ → ข้อความนี้คือคำตอบ
    await setSession(userId, { ...sess, awaitInfo: false });
    await say(clientId, "ขอบคุณค่ะ ได้รับข้อมูลแล้ว กำลังอัปเดตเว็บให้นะคะ");
    const { customerAnswered } = await import("./agents");
    return await customerAnswered(clientId, text), true;
  }
  if (sess.awaitEdit) {
    await setSession(userId, { ...sess, awaitEdit: false });
    return submitEdit(clientId, userId, text), true;
  }
  const intent = orderIntent(text);
  if (intent === "status") return await sendStatus(clientId), true;
  if (intent === "menu" || firstContact) return await sendMenu(clientId, firstContact), true;
  return false;
}

export async function handleOrderPostback(clientId: string, userId: string, data: string): Promise<boolean> {
  if (!data.startsWith("od:")) return false;
  if (!orderBotEnabled()) return true;
  const [, op, a] = data.split(":");
  try {
    switch (op) {
      case "menu": await sendMenu(clientId, false); break;
      case "status": await sendStatus(clientId); break;
      case "pkg": await quote(clientId, a); break;
      case "ok": await confirmOrder(clientId, a); break;
      case "img": {
        if (a === "slip") await imageIsSlip(clientId); else await tagImages(clientId, a === "ref" ? "ref" : "photo");
        await setSession(userId, { ...(await getSession(userId)), askedImgAt: undefined }); // ชุดรูปถัดไปถามใหม่ได้
        break;
      }
      case "approve": await approve(clientId); break;
      case "edit": await setSession(userId, { ...(await getSession(userId)), awaitEdit: true }); await say(clientId, "พิมพ์สิ่งที่อยากแก้มาในข้อความเดียวได้เลยค่ะ เช่น เปลี่ยนรูปหน้าแรก เพิ่มเมนู 2 รายการ"); break;
      case "paidedit": { const s = await getSession(userId); if (s.paidEditText) { await setSession(userId, { ...s, paidEditText: undefined }); await paidEdit(clientId, s.paidEditText); } break; }
      default: return false;
    }
  } catch (e) {
    console.error("order chat", op, e);
    await say(clientId, `ขออภัยค่ะ ทำรายการไม่สำเร็จ: ${(e as Error).message}\nทีมงานจะเข้ามาช่วยดูให้ค่ะ`);
  }
  return true;
}

// ---------- ขั้นตอน ----------
async function sendMenu(clientId: string, first: boolean) {
  const list = await packages();
  if (!list.length) return;
  const lines = list.map((p) => `• ${p.name} — ${baht(p.price)}`);
  await say(clientId, `${first ? "สวัสดีค่ะ ขอบคุณที่ทักมา 🙏 One Day Easy รับทำเว็บไซต์ร้านอาหารและคาเฟ่\n\n" : ""}แพ็กเกจทำเว็บ\n${lines.join("\n")}\n\nเลือกแพ็กเพื่อดูสรุปราคาได้เลยค่ะ หรือพิมพ์ถามทีมงานได้`,
    list.map((p) => ({ label: `${PKG[p.code] ?? p.code} ${(p.price / 100).toLocaleString("th-TH")}`, data: `od:pkg:${p.code}`, display: `สนใจ${p.name}` })));
}

async function quote(clientId: string, code: string) {
  const p = (await packages()).find((x) => x.code === code);
  if (!p) return sendMenu(clientId, false);
  const ctx = await P.ctxForClient(clientId);
  if (ctx && !["new_chat", "intake"].includes(ctx.job.stage)) { await say(clientId, `งานของคุณเริ่มทำแล้ว (ขั้น "${STAGE_LABEL[ctx.job.stage]}") ถ้าต้องการเปลี่ยนแพ็ก ทีมงานจะติดต่อกลับค่ะ`); return; }
  // ใบเสนอราคา: ใช้ใบเดิมถ้ายอดเท่ากันและยังไม่หมดอายุ
  const qt = (await one<{ no: string }>(`select no from documents where client_id = $1 and type = 'QT' and status = 'issued' and total_satang = $2 order by no desc limit 1`, [clientId, p.price]))?.no
    ?? await S.issueDoc("QT", clientId, p.price, ctx?.jobId);
  const dep = depositPercent(), depAmt = Math.round(p.price * dep / 100);
  await say(clientId, `ใบเสนอราคา ${qt}\n${p.name}\nราคา ${baht(p.price)}${dep ? `\nมัดจำ ${dep}% = ${baht(depAmt)} · ส่วนที่เหลือ ${baht(p.price - depAmt)} ชำระเมื่ออนุมัติเว็บ` : "\nชำระเมื่ออนุมัติเว็บ"}\nแก้ฟรี ${P.FREE_EDITS} รอบ\n\nกด "ยืนยันสั่งทำ" เพื่อเริ่มงานค่ะ`, [
    { label: "✅ ยืนยันสั่งทำ", data: `od:ok:${code}`, display: `ยืนยันสั่งทำ ${p.name}` },
    { label: "ดูแพ็กอื่น", data: "od:menu", display: "ขอดูแพ็กอื่น" },
  ]);
}

async function confirmOrder(clientId: string, code: string) {
  const p = (await packages()).find((x) => x.code === code);
  const ctx = await P.ctxForClient(clientId);
  if (!p || !ctx) return sendMenu(clientId, false);
  if (!["new_chat", "intake"].includes(ctx.job.stage)) { await say(clientId, "ออเดอร์นี้ยืนยันและเริ่มทำแล้วค่ะ พิมพ์ \"สถานะ\" เพื่อดูความคืบหน้า"); return; }
  await q(`update clients set package = $2, status = 'active' where id = $1`, [clientId, PKG[code] ?? code]);
  if (ctx.job.stage === "new_chat") await S.moveJob(ctx.jobId, "intake", "system");
  // มัดจำ: ออกครั้งเดียวต่องาน
  const dep = depositPercent(), depAmt = Math.round(p.price * dep / 100);
  let depNo = (await one<{ d: string | null }>(`select deposit_doc d from jobs where id = $1`, [ctx.jobId]))?.d ?? null;
  if (dep && depAmt > 0 && !depNo) {
    depNo = await S.issueDoc("INV", clientId, depAmt, ctx.jobId);
    await q(`update jobs set deposit_doc = $2 where id = $1`, [ctx.jobId, depNo]);
  }
  const { token } = { token: await P.createPortalLink(clientId, "line-bot") };
  const steps = [
    ...(depNo ? [`1) โอนมัดจำ ${baht(depAmt)} (${depNo}) ทาง${qrUrl(depNo) ? " QR ด้านบน หรือ" : ""}${payHint()} แล้วส่งสลิปในแชทนี้`] : []),
    `${depNo ? "2" : "1"}) กรอกข้อมูลร้านที่ลิงก์นี้ (ใช้ได้ 7 วัน)\n${P.portalUrl(token)}`,
    `${depNo ? "3" : "2"}) ส่งรูปร้าน รูปเมนู โลโก้ หรือภาพเว็บที่ชอบ (ref) มาในแชทนี้ได้เลย`,
  ];
  await say(clientId, `รับออเดอร์แล้วค่ะ ✅ ${p.name}\n\n${steps.join("\n\n")}\n\nได้ข้อมูลครบ ทีมงานจะส่งตัวอย่างเว็บให้ตรวจในแชทนี้ค่ะ`, undefined, depNo ? qrUrl(depNo) ?? undefined : undefined);
}

/** รูปจากแชทถูกเก็บเป็นรูปร้านไว้ก่อน · ถามลูกค้าครั้งเดียวต่อชุดรูปว่าเป็นรูปร้านหรือภาพ ref */
export async function onImageSaved(clientId: string, userId: string, hasOpenInvoice = false) {
  if (!orderBotEnabled()) return;
  const s = await getSession(userId);
  // ถามครั้งเดียวต่อชุดรูป · แต่ถ้าครั้งก่อนถามโดยไม่มีปุ่ม "สลิป" แล้วตอนนี้ลูกค้ามีใบค้าง ต้องถามใหม่ให้มีปุ่มนั้น
  if (s.askedImgAt && Date.now() - s.askedImgAt < 2 * 60_000 && (s.askedWithSlip || !hasOpenInvoice)) return;
  await setSession(userId, { ...s, askedImgAt: Date.now(), askedWithSlip: hasOpenInvoice });
  await say(clientId, "ได้รับรูปแล้วค่ะ รูปชุดนี้คืออะไรคะ", [
    { label: "รูปร้าน / เมนู / โลโก้", data: "od:img:photo", display: "เป็นรูปร้านหรือเมนูค่ะ" },
    { label: "ภาพเว็บที่ชอบ (ref)", data: "od:img:ref", display: "เป็นภาพตัวอย่างเว็บที่ชอบค่ะ" },
    // ลูกค้ามีใบค้างชำระ แต่ระบบอ่านรูปแล้วไม่เห็นว่าเป็นสลิป (เช่น รูปเบลอ) → ให้ลูกค้าบอกเองได้ แล้วส่งให้คนตรวจ
    ...(hasOpenInvoice ? [{ label: "สลิปโอนเงิน", data: "od:img:slip", display: "เป็นสลิปโอนเงินค่ะ" }] : []),
  ]);
}
async function tagImages(clientId: string, kind: "photo" | "ref") {
  const r = await q(`update client_files set kind = $2, tagged = true where client_id = $1 and source = 'line' and not tagged returning id`, [clientId, kind]);
  await say(clientId, kind === "ref" ? `บันทึกเป็นภาพตัวอย่าง ${r.length} รูปแล้วค่ะ ทีมงานจะใช้ดูโทนสีและสไตล์ของเว็บ` : `บันทึกรูปร้าน ${r.length} รูปแล้วค่ะ จะนำไปใช้ในเว็บ`);
}

async function imageIsSlip(clientId: string) {
  const f = await one<{ id: string; mime: string; bytes: Buffer }>(`select id::text, mime, bytes from client_files where client_id = $1 and source = 'line' and not tagged order by id desc limit 1`, [clientId]);
  if (!f) { await say(clientId, "ไม่พบรูปล่าสุดค่ะ ส่งสลิปมาอีกครั้งได้เลย"); return; }
  const slipId = await S.createSlipFromImage({ clientId, source: "line", bytes: f.bytes, mime: f.mime as "image/jpeg" });
  if (!slipId) return;
  await q(`delete from client_files where id = $1`, [f.id]);
  await S.notifySlipResult(slipId, "review");
}

/** ทีมกดส่งงานให้ลูกค้าตรวจ → ส่งลิงก์ตัวอย่างพร้อมปุ่มอนุมัติ/ขอแก้เข้าแชท */
export async function sendForReview(clientId: string) {
  if (!orderBotEnabled()) return;
  const ctx = await P.ctxForClient(clientId);
  if (!ctx || ctx.job.stage !== "client_review" || !ctx.siteId) return;
  const url = previewUrl(ctx.siteId);
  const left = Math.max(0, P.FREE_EDITS - ctx.job.editRounds);
  await say(clientId, `ตัวอย่างเว็บของคุณพร้อมให้ตรวจแล้วค่ะ 🎉${url ? `\n${url}` : "\nทีมงานจะส่งลิงก์ตัวอย่างให้อีกครั้ง"}\n\nถ้าเรียบร้อยกด "อนุมัติ" · ถ้าอยากปรับกด "ขอแก้" (แก้ฟรีเหลือ ${left} รอบ)`, [
    { label: "✅ อนุมัติเว็บ", data: "od:approve", display: "อนุมัติเว็บนี้" },
    { label: "ขอแก้", data: "od:edit", display: "ขอแก้เว็บ" },
  ]);
}

async function approve(clientId: string) {
  const ctx = await P.ctxForClient(clientId);
  if (!ctx) return;
  if (ctx.job.stage === "online" || ctx.job.stage === "care") { await say(clientId, "เว็บของคุณออนไลน์แล้วค่ะ"); return; }
  await P.approveSite(ctx);
  const inv = await one<{ no: string; due: number }>(`select no, (total_satang - paid_satang)::int due from documents where job_id = $1 and type = 'INV' and status = 'issued' order by issued_at desc, no desc limit 1`, [ctx.jobId]);
  if (!inv) { await say(clientId, "อนุมัติแล้ว ขอบคุณค่ะ 🙏 ทีมงานกำลังออกใบแจ้งหนี้ จะส่งให้ในแชทนี้"); return; }
  const img = qrUrl(inv.no);
  await say(clientId, `อนุมัติแล้ว ขอบคุณค่ะ 🙏\nใบแจ้งหนี้ ${inv.no} ยอด ${baht(inv.due)}\nโอนทาง${img ? " QR ด้านบน หรือ" : ""}${payHint()} แล้วส่งสลิปในแชทนี้ · ชำระครบแล้วเว็บขึ้นออนไลน์ค่ะ`, undefined, img ?? undefined);
}

async function submitEdit(clientId: string, userId: string, text: string) {
  try {
    const ctx = await P.ctxForClient(clientId);
    if (!ctx) return;
    const r = await P.requestEdit(ctx, text);
    if (r === "sent") { await say(clientId, "รับคำขอแก้แล้วค่ะ ทีมงานจะแก้แล้วส่งตัวอย่างใหม่ให้ตรวจในแชทนี้"); await agentEdit(ctx.jobId, text); return; }
    const price = await P.extraEditPrice();
    if (!price) { await say(clientId, "รอบแก้ฟรีครบแล้วค่ะ ทีมงานจะติดต่อกลับเรื่องค่าบริการแก้เพิ่ม"); return; }
    await setSession(userId, { ...(await getSession(userId)), paidEditText: text.slice(0, 1000) });
    await say(clientId, `รอบแก้ฟรีครบ ${P.FREE_EDITS} รอบแล้วค่ะ แก้เพิ่มรอบนี้ ${baht(price)}\nยืนยันไหมคะ`, [
      { label: `ยืนยัน (${(price / 100).toLocaleString("th-TH")} บาท)`, data: "od:paidedit", display: "ยืนยันแก้เพิ่ม" },
      { label: "ไม่แก้ อนุมัติเลย", data: "od:approve", display: "อนุมัติเว็บนี้" },
    ]);
  } catch (e) { await say(clientId, (e as Error).message); }
}
async function paidEdit(clientId: string, text: string) {
  const ctx = await P.ctxForClient(clientId);
  if (!ctx) return;
  await P.confirmPaidEdit(ctx, text);
  await say(clientId, "รับคำขอแก้เพิ่มแล้วค่ะ ค่าบริการรอบนี้จะรวมในใบแจ้งหนี้ ทีมงานจะส่งตัวอย่างใหม่ให้ตรวจในแชทนี้");
  await agentEdit(ctx.jobId, text);
}

async function sendStatus(clientId: string) {
  const ctx = await P.ctxForClient(clientId);
  if (!ctx) return;
  const open = await q<{ no: string; due: number }>(`select no, (total_satang - paid_satang)::int due from documents where client_id = $1 and type in ('INV','RN') and status = 'issued' order by issued_at`, [clientId]);
  const next: Record<string, string> = {
    new_chat: "เลือกแพ็กเกจเพื่อเริ่มงาน", intake: "รอข้อมูลร้านและรูปจากคุณ", template: "ทีมงานกำลังทำเว็บ", client_review: "รอคุณตรวจตัวอย่างเว็บ",
    invoice: "กำลังออกใบแจ้งหนี้", payment: "รอชำระเงิน", online: "เว็บออนไลน์แล้ว", care: "เว็บออนไลน์แล้ว (ดูแลรายปี)", paused: "งานพักไว้ชั่วคราว ทีมงานจะติดต่อกลับ",
  };
  const quick: QuickItem[] = ctx.job.stage === "new_chat" ? [{ label: "ดูแพ็กเกจ", data: "od:menu", display: "ขอดูแพ็กเกจ" }]
    : ctx.job.stage === "client_review" ? [{ label: "✅ อนุมัติเว็บ", data: "od:approve", display: "อนุมัติเว็บนี้" }, { label: "ขอแก้", data: "od:edit", display: "ขอแก้เว็บ" }] : [];
  await say(clientId, `สถานะงาน: ${next[ctx.job.stage]}${ctx.site && ["online", "care"].includes(ctx.job.stage) ? `\n${liveUrl(ctx.site.domain)}` : ""}${open.length ? `\n\nยอดค้างชำระ: ${open.map((d) => `${d.no} ${baht(d.due)}`).join(" · ")}` : ""}`, quick.length ? quick : undefined);
}
