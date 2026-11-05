import "server-only";
import { verifySignature as verifySig } from "./line-signature";

// LINE Messaging API · https://developers.line.biz/en/reference/messaging-api/
// LINE_API_BASE ใช้ชี้ไป mock server ตอนทดสอบเท่านั้น
const base = () => process.env.LINE_API_BASE || "https://api.line.me";

export function lineConfigured() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

export function verifySignature(rawBody: string, signature: string | null) {
  return verifySig(rawBody, signature, process.env.LINE_CHANNEL_SECRET);
}

export class LineError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) { super(message); }
}

/** ส่ง push message · retryKey = X-Line-Retry-Key (UUID) กันส่งซ้ำเมื่อ retry */
export interface QuickItem { label: string; data: string; display?: string }
/** ปุ่มตอบด่วน (Quick reply) · LINE จำกัด 13 ปุ่ม · label ≤ 20 ตัวอักษร · data ≤ 300 */
export const quickReply = (items: QuickItem[]) => ({
  items: items.slice(0, 13).map((i) => ({ type: "action", action: { type: "postback", label: [...i.label].slice(0, 20).join(""), data: i.data.slice(0, 300), displayText: (i.display ?? i.label).slice(0, 300) } })),
});
export async function pushText(to: string, text: string, retryKey: string, quick?: QuickItem[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new LineError("ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN", 0, false);
  let res: Response;
  try {
    res = await fetch(`${base()}/v2/bot/message/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000), ...(quick?.length ? { quickReply: quickReply(quick) } : {}) }] }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new LineError(`ติดต่อ LINE ไม่ได้: ${(e as Error).message}`, 0, true);
  }
  // 409 = retry key นี้ส่งสำเร็จไปแล้ว → ถือว่าสำเร็จ
  if (res.ok || res.status === 409) return;
  const body = await res.text().catch(() => "");
  let msg = body;
  try { msg = JSON.parse(body).message ?? body; } catch {}
  throw new LineError(`LINE API ${res.status}: ${msg}`.slice(0, 300), res.status, res.status === 429 || res.status >= 500);
}

/** ชื่อที่แสดงของผู้ใช้ (ไม่บังคับ · ล้มเหลวได้) */
export async function getProfileName(userId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${base()}/v2/bot/profile/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
    return res.ok ? ((await res.json()) as { displayName?: string }).displayName ?? null : null;
  } catch { return null; }
}

export interface LineEvent {
  type: string; webhookEventId?: string; timestamp: number;
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string };
  postback?: { data: string };
  deliveryContext?: { isRedelivery: boolean };
}
export function describeMessage(m: NonNullable<LineEvent["message"]>): string {
  if (m.type === "text") return m.text ?? "";
  return ({ image: "[รูปภาพ]", video: "[วิดีโอ]", audio: "[เสียง]", file: "[ไฟล์]", sticker: "[สติกเกอร์]", location: "[ตำแหน่ง]" } as Record<string, string>)[m.type] ?? `[${m.type}]`;
}

/** ดาวน์โหลดรูปที่ลูกค้าส่งมา (เก็บที่ LINE ชั่วคราว) */
export async function downloadContent(messageId: string): Promise<{ bytes: Buffer; mime: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new LineError("ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN", 0, false);
  const base = process.env.LINE_DATA_API_BASE || "https://api-data.line.me";
  const res = await fetch(`${base}/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new LineError(`ดาวน์โหลดรูปจาก LINE ไม่ได้ (${res.status})`, res.status, res.status >= 500);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: (res.headers.get("content-type") ?? "image/jpeg").split(";")[0] };
}
