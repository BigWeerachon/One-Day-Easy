import "server-only";
import { q, one } from "./db";
import { can, type Perm, type Role } from "./permissions";
import { sendEmail, emailConfigured, EmailError, isEmail } from "./email";

// แจ้งเตือนทางอีเมล · ทุกฉบับเข้ากล่องขาออกก่อน แล้วค่อยส่ง (ล้มเหลวลองใหม่ผ่าน cron)
// เรียกหลัง commit เสมอ · การแจ้งเตือนล้มเหลวต้องไม่ทำให้งานหลักล้ม

export const GROUPS = {
  booking: "คิว: จองใหม่ · ยกเลิก",
  payment: "การเงิน: รับชำระแล้ว · สลิปรอตรวจ",
  portal: "ลูกค้าใน Portal: ส่งข้อมูล · อนุมัติเว็บ · ขอแก้",
  system: "ระบบ: งานอัตโนมัติล้มเหลว",
} as const;
export type Group = keyof typeof GROUPS;

// ใครได้รับ: ตามสิทธิ์ของบทบาท
const GROUP_PERM: Record<Group, Perm> = { booking: "queue.edit", payment: "finance.edit", portal: "clients.edit", system: "team.manage" };
export const groupsFor = (role: Role) => (Object.keys(GROUPS) as Group[]).filter((g) => can(role, GROUP_PERM[g]));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const studioUrl = (path: string) => `${(process.env.STUDIO_URL ?? "").replace(/\/$/, "")}${path}`;
const shopName = () => process.env.SELLER_NAME || "One Day Easy";

interface Mail { subject: string; lines: string[]; link?: { href: string; label: string } }
function render(m: Mail, footer: string) {
  const html = `<!doctype html><html><body style="font-family:Sarabun,'IBM Plex Sans Thai',system-ui,sans-serif;color:#141a2b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
<h2 style="font-size:18px;margin:0 0 12px">${esc(m.subject)}</h2>
${m.lines.map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join("\n")}
${m.link?.href ? `<p style="margin:18px 0"><a href="${esc(m.link.href)}" style="background:#0b6cf0;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">${esc(m.link.label)}</a></p>` : ""}
<p style="margin-top:24px;font-size:12px;color:#8a92a3">${esc(footer)}</p></body></html>`;
  const text = [m.subject, "", ...m.lines, ...(m.link?.href ? ["", `${m.link.label}: ${m.link.href}`] : []), "", footer].join("\n");
  return { html, text };
}

async function enqueue(event: string, ref: string, to: string, m: Mail, footer: string, attachDoc?: string) {
  const { html, text } = render(m, footer);
  const r = await q<{ id: string }>(`insert into email_outbox (event, to_addr, subject, html, text_body, attach_doc, idempotency_key, status, last_error)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (idempotency_key) do nothing returning id::text`,
    [event, to.toLowerCase(), m.subject, html, text, attachDoc ?? null, `${event}:${ref}:${to.toLowerCase()}`,
     emailConfigured() ? "queued" : "skipped", emailConfigured() ? null : "ยังไม่ได้ตั้ง RESEND_API_KEY / EMAIL_FROM"]);
  return r[0]?.id;
}

/** แจ้งทีม: ส่งถึงทุกคนที่บทบาทมีสิทธิ์ในกลุ่มนั้นและไม่ได้ปิดรับ */
async function toTeam(group: Group, event: string, ref: string, m: Mail) {
  const staff = await q<{ email: string; role: Role; prefs: Record<string, boolean> }>(`select email, role, email_prefs prefs from staff where active`);
  const ids: string[] = [];
  for (const s of staff) {
    if (!can(s.role, GROUP_PERM[group]) || s.prefs?.[group] === false) continue;
    const id = await enqueue(event, ref, s.email, m, `แจ้งเตือนจาก Studio · ปิดรับได้ที่หน้า "บัญชีของฉัน"`);
    if (id) ids.push(id);
  }
  return ids;
}
/** แจ้งลูกค้า: เฉพาะลูกค้าที่มีอีเมลในระบบ */
async function toClient(clientId: string, event: string, ref: string, m: Mail, attachDoc?: string) {
  const c = await one<{ email: string }>(`select value email from contacts where client_id = $1 and channel = 'Email' order by id desc limit 1`, [clientId]);
  if (!c || !isEmail(c.email)) return [];
  const id = await enqueue(event, ref, c.email, m, `${shopName()} · อีเมลนี้ส่งอัตโนมัติ ตอบกลับทาง LINE ของร้านได้เลย`, attachDoc);
  return id ? [id] : [];
}

/** จุดเดียวที่ระบบเรียกเมื่อมีเหตุการณ์ · ไม่ throw */
export async function notify(e: NotifyEvent): Promise<void> {
  try {
    const ids = await build(e);
    for (const id of ids) await deliver(id);
  } catch (err) { console.error("notify", e.type, err); }
}

export type NotifyEvent =
  | { type: "booking.created"; bookingId: string }
  | { type: "booking.cancelled"; bookingId: string; reason?: string; by: string }
  | { type: "payment.received"; docNo: string; amount: number }
  | { type: "slip.needs_review"; slipId: string; reason?: string }
  | { type: "portal.intake"; clientId: string }
  | { type: "portal.approved"; clientId: string }
  | { type: "portal.edit"; clientId: string; text: string }
  | { type: "invoice.issued"; docNo: string }
  | { type: "task.dead"; taskId: string; name: string; error: string };

const baht = (satang: number) => `${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const when = (d: Date) => {
  const x = new Date(d.getTime() + 7 * 3600e3);
  return `${x.getUTCDate()} ${TH_MO[x.getUTCMonth()]} ${x.getUTCFullYear() + 543} เวลา ${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")} น.`;
};
const SOURCE: Record<string, string> = { line: "ลูกค้าจองผ่าน LINE", staff: "ทีมจองให้", walkin: "Walk-in", portal: "Portal" };

async function build(e: NotifyEvent): Promise<string[]> {
  switch (e.type) {
    case "booking.created":
    case "booking.cancelled": {
      const b = await one<{ code: string; customer: string; service: string; resource: string; start: Date; source: string; client_id: string | null; queue_no: number | null; status: string }>(
        `select b.code, b.customer_name customer, s.name service, r.name resource, b.starts_at start, b.source, b.client_id, b.queue_no, b.status from bookings b
         join booking_services s on s.code = b.service_code join booking_resources r on r.id = b.resource_id where b.id = $1`, [e.bookingId]);
      if (!b) return [];
      const detail = [`${b.service} · ${b.resource}`, when(b.start), `รหัส ${b.code}${b.queue_no ? ` · คิวที่ ${b.queue_no}` : ""}`];
      const day = new Date(b.start.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
      const link = { href: studioUrl(`/queue?day=${day}`), label: "เปิดหน้าคิว" };
      if (e.type === "booking.created") {
        return [
          ...await toTeam("booking", e.type, e.bookingId, { subject: `คิวใหม่: ${b.customer} · ${when(b.start)}`, lines: [`${SOURCE[b.source] ?? b.source}`, ...detail], link }),
          ...(b.client_id ? await toClient(b.client_id, "customer.booking", e.bookingId, { subject: `ยืนยันการจองคิว ${b.code}`, lines: [`${b.customer} จองคิวสำเร็จแล้ว`, ...detail, "ถ้าต้องการเลื่อนหรือยกเลิก พิมพ์ \"คิวของฉัน\" ใน LINE ของร้าน"] }) : []),
        ];
      }
      const reason = e.reason ? `เหตุผล: ${e.reason}` : "";
      return [
        ...await toTeam("booking", e.type, e.bookingId, { subject: `ยกเลิกคิว: ${b.customer} · ${when(b.start)}`, lines: [`ยกเลิกโดย ${e.by}`, ...detail, ...(reason ? [reason] : [])], link }),
        ...(b.client_id ? await toClient(b.client_id, "customer.booking_cancelled", e.bookingId, { subject: `คิว ${b.code} ถูกยกเลิก`, lines: [...detail, ...(reason ? [reason] : []), "จองใหม่ได้โดยพิมพ์ \"จองคิว\" ใน LINE ของร้าน"] }) : []),
      ];
    }
    case "payment.received": {
      const d = await one<{ client_id: string; client: string; status: string; total: number; paid: number }>(
        `select d.client_id, c.name client, d.status, d.total_satang::int total, d.paid_satang::int paid from documents d join clients c on c.id = d.client_id where d.no = $1`, [e.docNo]);
      if (!d) return [];
      const rc = d.status === "paid" ? await one<{ no: string }>(`select no from documents where type = 'RC' and client_id = $1 order by no desc limit 1`, [d.client_id]) : undefined;
      const left = d.total - d.paid;
      const lines = [`${d.client} ชำระ ${baht(e.amount)} สำหรับ ${e.docNo}`, left > 0 ? `คงเหลือ ${baht(left)}` : `ชำระครบแล้ว${rc ? ` · ออกใบเสร็จ ${rc.no}` : ""}`];
      return [
        ...await toTeam("payment", e.type, `${e.docNo}:${d.paid}`, { subject: `รับชำระแล้ว ${baht(e.amount)} · ${d.client}`, lines, link: { href: studioUrl("/finance"), label: "เปิดหน้าการเงิน" } }),
        ...await toClient(d.client_id, "customer.payment", `${e.docNo}:${d.paid}`,
          { subject: rc ? `ใบเสร็จรับเงิน ${rc.no}` : `ได้รับชำระ ${baht(e.amount)} สำหรับ ${e.docNo}`, lines: [`ได้รับชำระ ${baht(e.amount)} สำหรับ ${e.docNo} เรียบร้อยแล้ว ขอบคุณค่ะ`, ...(rc ? ["แนบใบเสร็จรับเงินมาในอีเมลนี้"] : [`ยอดคงเหลือ ${baht(left)}`])] }, rc?.no),
      ];
    }
    case "slip.needs_review": {
      const s = await one<{ client: string | null; amount: number | null; doc_no: string | null }>(
        `select c.name client, s.amount_satang::int amount, s.doc_no from slips s left join documents d on d.no = s.doc_no left join clients c on c.id = coalesce(s.client_id, d.client_id) where s.id = $1`, [e.slipId]);
      if (!s) return [];
      return toTeam("payment", e.type, e.slipId, { subject: `สลิปรอตรวจ · ${s.client ?? "ไม่ทราบลูกค้า"}${s.amount ? ` · ${baht(s.amount)}` : ""}`,
        lines: [`สลิป #${e.slipId}${s.doc_no ? ` สำหรับ ${s.doc_no}` : ""}`, ...(e.reason ? [`ข้อที่ไม่ผ่าน: ${e.reason}`] : [])], link: { href: studioUrl("/finance"), label: "ตรวจสลิป" } });
    }
    case "portal.intake":
    case "portal.approved":
    case "portal.edit": {
      const c = await one<{ name: string }>(`select name from clients where id = $1`, [e.clientId]);
      if (!c) return [];
      const m = {
        "portal.intake": { subject: `${c.name} ส่งข้อมูลร้านแล้ว`, lines: ["ลูกค้ากรอกข้อมูลร้านใน Portal เรียบร้อย พร้อมเริ่มทำเว็บ"] },
        "portal.approved": { subject: `${c.name} อนุมัติเว็บแล้ว`, lines: ["ระบบออกใบแจ้งหนี้ให้อัตโนมัติ รอลูกค้าชำระ"] },
        "portal.edit": { subject: `${c.name} ขอแก้เว็บ`, lines: [`สิ่งที่ขอแก้: ${e.type === "portal.edit" ? e.text : ""}`] },
      }[e.type];
      return toTeam("portal", e.type, `${e.clientId}:${Date.now()}`, { ...m, link: { href: studioUrl(`/clients/${e.clientId}`), label: "เปิดหน้าลูกค้า" } });
    }
    case "invoice.issued": {
      const d = await one<{ client_id: string; total: number; type: string; expires: string | null }>(`select client_id, total_satang::int total, type, expires_at::text expires from documents where no = $1`, [e.docNo]);
      if (!d || !["INV", "RN", "QT"].includes(d.type)) return [];
      const label = { INV: "ใบแจ้งหนี้", RN: "ใบแจ้งต่ออายุบริการ", QT: "ใบเสนอราคา" }[d.type]!;
      return toClient(d.client_id, "customer.document", e.docNo, { subject: `${label} ${e.docNo} · ${baht(d.total)}`,
        lines: [`แนบ${label}เลขที่ ${e.docNo} ยอด ${baht(d.total)} มาในอีเมลนี้`, ...(d.type === "QT" && d.expires ? [`ยืนราคาถึง ${d.expires}`] : ["ชำระผ่านพร้อมเพย์แล้วส่งสลิปทาง LINE ของร้าน"])] }, e.docNo);
    }
    case "task.dead":
      return toTeam("system", e.type, e.taskId, { subject: `งานอัตโนมัติล้มเหลว: ${e.name}`, lines: [e.error, "ลองใหม่ได้ที่หน้า Workflow"], link: { href: studioUrl("/workflow"), label: "เปิดหน้า Workflow" } });
  }
}

// ---------- ส่ง ----------
const MAX_ATTEMPTS = 5;
/** ส่งฉบับเดียว · ล้มเหลวชั่วคราว → failed (cron ลองใหม่) · ล้มเหลวถาวรหรือครบ 5 ครั้ง → dead */
export async function deliver(id: string) {
  const m = await one<{ to_addr: string; subject: string; html: string; text_body: string; attach_doc: string | null; idempotency_key: string; attempts: number }>(
    `update email_outbox set status = 'sending', attempts = attempts + 1, run_after = now() where id = $1 and status in ('queued','failed') returning to_addr, subject, html, text_body, attach_doc, idempotency_key, attempts`, [id]);
  if (!m) return;
  try {
    let attachments: { filename: string; content: Buffer }[] | undefined;
    if (m.attach_doc) {
      const { renderDocPdf } = await import("./pdf");
      const pdf = await renderDocPdf(m.attach_doc);
      if (pdf) attachments = [{ filename: pdf.filename, content: pdf.pdf }];
    }
    const providerId = await sendEmail({ to: m.to_addr, subject: m.subject, html: m.html, text: m.text_body, attachments, idempotencyKey: m.idempotency_key });
    await q(`update email_outbox set status = 'sent', sent_at = now(), provider_id = $2, last_error = null where id = $1`, [id, providerId]);
  } catch (e) {
    const err = e instanceof EmailError ? e : new EmailError((e as Error).message, true);
    const dead = !err.retryable || m.attempts >= MAX_ATTEMPTS;
    await q(`update email_outbox set status = $2, last_error = $3, run_after = now() + interval '1 minute' * $4 where id = $1`, [id, dead ? "dead" : "failed", err.message, 2 ** m.attempts]);
  }
}
/** cron: ส่งฉบับที่ค้าง/ถึงเวลาลองใหม่ · ปลดฉบับที่ค้างสถานะ sending นานเกิน (เครื่องดับกลางคัน) */
export async function runDueEmails(limit = 30) {
  await q(`update email_outbox set status = 'failed' where status = 'sending' and run_after < now() - interval '10 minute'`);
  const due = await q<{ id: string }>(`select id::text from email_outbox where status in ('queued','failed') and run_after <= now() order by id limit $1`, [limit]);
  for (const d of due) await deliver(d.id);
  return due.length;
}
export async function retryEmail(id: string) {
  await q(`update email_outbox set status = 'queued', attempts = 0, run_after = now() where id = $1 and status in ('dead','failed','skipped')`, [id]);
  await deliver(id);
}
export const listOutbox = (limit = 50) => q<{ id: string; event: string; to: string; subject: string; status: string; attempts: number; error: string | null; at: string }>(
  `select id::text, event, to_addr "to", subject, status, attempts, last_error error, created_at::text at from email_outbox order by id desc limit $1`, [limit]);
