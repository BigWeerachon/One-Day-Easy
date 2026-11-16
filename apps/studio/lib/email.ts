import "server-only";

// ส่งอีเมลผ่าน Resend (https://resend.com/docs/api-reference/emails/send-email)
// EMAIL_API_BASE ใช้ชี้ไป mock ตอนทดสอบเท่านั้น
const base = () => process.env.EMAIL_API_BASE || "https://api.resend.com";
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export class EmailError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

export interface OutgoingEmail {
  to: string; subject: string; html: string; text: string;
  attachments?: { filename: string; content: Buffer }[];
  idempotencyKey: string;
}

/** ส่ง 1 ฉบับ · คืน id จากผู้ให้บริการ · Idempotency-Key กันส่งซ้ำเมื่อ retry */
export async function sendEmail(m: OutgoingEmail): Promise<string> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) throw new EmailError("ยังไม่ได้ตั้ง RESEND_API_KEY / EMAIL_FROM", false);
  let res: Response;
  try {
    res = await fetch(`${base()}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Idempotency-Key": m.idempotencyKey.slice(0, 256) },
      body: JSON.stringify({
        from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
        ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new EmailError(`ติดต่อผู้ให้บริการอีเมลไม่ได้: ${(e as Error).message}`, true);
  }
  const body = await res.text().catch(() => "");
  if (res.ok) {
    try { return (JSON.parse(body) as { id?: string }).id ?? ""; } catch { return ""; }
  }
  let msg = body;
  try { msg = (JSON.parse(body) as { message?: string }).message ?? body; } catch {}
  throw new EmailError(`อีเมล ${res.status}: ${msg}`.slice(0, 300), res.status === 429 || res.status >= 500);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
