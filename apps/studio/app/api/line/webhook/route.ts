import { after } from "next/server";
import { verifySignature, getProfileName, describeMessage, downloadContent, type LineEvent } from "@/lib/line";
import { receiveLineMessage, hasOpenInvoice, createSlipFromImage, processSlip, notifySlipResult } from "@/lib/store";
import { revalidatePath } from "next/cache";
import { handleBookingText, handleBookingPostback } from "@/lib/booking-chat";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

// ตั้งใน LINE Developers → Messaging API → Webhook URL: https://<โดเมน>/api/line/webhook
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  let events: LineEvent[];
  try { events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? []; }
  catch { return Response.json({ error: "bad json" }, { status: 400 }); }

  let saved = 0;
  for (const ev of events) {
    // กดปุ่มจองคิว (postback) · ลูกค้าต้องเคยทักมาแล้วจึงมีปุ่มให้กด
    if (ev.type === "postback" && ev.postback?.data && ev.source?.type === "user" && ev.source.userId) {
      const userId = ev.source.userId, data = ev.postback.data, eventId = ev.webhookEventId;
      const ct = (await q<{ client_id: string; name: string }>(`select ct.client_id, c.name from contacts ct join clients c on c.id = ct.client_id where ct.channel = 'LINE' and ct.value = $1`, [userId]))[0];
      if (!ct) continue;
      // กัน LINE ส่ง event ซ้ำ (redelivery)
      if (eventId && !(await q(`insert into line_booking_sessions (line_user_id, state) values ($1, '{}') on conflict do nothing returning 1`, [`ev:${eventId}`])).length) continue;
      after(async () => {
        try { await handleBookingPostback(ct.client_id, userId, data, ct.name); revalidatePath("/", "layout"); }
        catch (e) { console.error("booking postback", e); }
      });
      continue;
    }
    // รับเฉพาะข้อความจากแชท 1:1 · ปุ่ม Verify ใน LINE Console ส่ง events ว่าง → ตอบ 200
    if (ev.type !== "message" || !ev.message || ev.source?.type !== "user" || !ev.source.userId) continue;
    const r = await receiveLineMessage({
      userId: ev.source.userId,
      messageId: ev.message.id,
      text: describeMessage(ev.message),
      displayName: await getProfileName(ev.source.userId),
    });
    if (r.status !== "new") continue;
    saved++;
    // ข้อความเรื่องคิว (จอง/ว่างไหม/ยกเลิก/เลื่อน) → บอทตอบเอง · ไม่ใช่เรื่องคิว → รอทีมตอบตามปกติ
    if (ev.message.type === "text" && ev.message.text) {
      const userId = ev.source.userId, text = ev.message.text, messageId = ev.message.id, clientId = r.clientId;
      after(async () => {
        try {
          const name = (await q<{ name: string }>(`select name from clients where id = $1`, [clientId]))[0]?.name ?? "ลูกค้า LINE";
          if (await handleBookingText(clientId, userId, text, name)) {
            await q(`update messages set read_at = now() where external_id = $1 and read_at is null`, [`line:${messageId}`]);
            revalidatePath("/", "layout");
          }
        } catch (e) { console.error("booking chat", e); }
      });
    }
    // รูปจากลูกค้าที่มีใบค้างชำระ = อาจเป็นสลิป → ตรวจหลังตอบ LINE แล้ว (LINE ต้องการคำตอบเร็ว)
    if (ev.message.type === "image" && (await hasOpenInvoice(r.clientId))) {
      const messageId = ev.message.id, clientId = r.clientId;
      after(async () => {
        try {
          const img = await downloadContent(messageId);
          const mime = IMAGE_MIME.find((m) => m === img.mime) ?? "image/jpeg";
          const slipId = await createSlipFromImage({ clientId, source: "line", lineMessageId: messageId, bytes: img.bytes, mime });
          if (!slipId) return;
          const res = await processSlip(slipId);
          await notifySlipResult(slipId, res.outcome);
          revalidatePath("/", "layout");
        } catch (e) { console.error("slip pipeline", e); }
      });
    }
  }
  if (saved) revalidatePath("/", "layout");
  return Response.json({ ok: true, saved });
}
