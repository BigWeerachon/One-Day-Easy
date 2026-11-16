import { after } from "next/server";
import { verifySignature, getProfileName, describeMessage, downloadContent, type LineEvent } from "@/lib/line";
import { receiveLineMessage, hasOpenInvoice, createSlipFromImage, processSlip, notifySlipResult, dropIfNotSlip } from "@/lib/store";
import { revalidatePath } from "next/cache";
import { handleBookingText, handleBookingPostback } from "@/lib/booking-chat";
import { handleOrderText, handleOrderPostback, onImageSaved } from "@/lib/order-chat";
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
        try {
          if (!(await handleOrderPostback(ct.client_id, userId, data))) await handleBookingPostback(ct.client_id, userId, data, ct.name);
          revalidatePath("/", "layout");
        } catch (e) { console.error("line postback", e); }
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
      const userId = ev.source.userId, text = ev.message.text, messageId = ev.message.id, clientId = r.clientId, first = !!r.firstContact;
      after(async () => {
        try {
          const name = (await q<{ name: string }>(`select name from clients where id = $1`, [clientId]))[0]?.name ?? "ลูกค้า LINE";
          // เรื่องคิวมาก่อน · ไม่ใช่ → เรื่องสั่งทำเว็บ (เมนูแพ็ก/สถานะ/ข้อความขอแก้) · ลูกค้าใหม่ได้ข้อความต้อนรับแต่ยังค้างในกล่องข้อความให้ทีมเห็น
          const handled = (await handleBookingText(clientId, userId, text, name)) || ((await handleOrderText(clientId, userId, text, first)) && !first);
          if (handled) {
            await q(`update messages set read_at = now() where external_id = $1 and read_at is null`, [`line:${messageId}`]);
            revalidatePath("/", "layout");
          }
        } catch (e) { console.error("booking chat", e); }
      });
    }
    // รูป: ลูกค้ามีใบค้างชำระ = ลองอ่านเป็นสลิปก่อน · ไม่ใช่สลิป หรือไม่มีใบค้าง = เก็บเป็นรูปของลูกค้า (รูปร้าน/ภาพ ref)
    if (ev.message.type === "image") {
      const messageId = ev.message.id, clientId = r.clientId, userId = ev.source.userId;
      const maybeSlip = await hasOpenInvoice(clientId);
      after(async () => {
        try {
          const img = await downloadContent(messageId);
          const mime = IMAGE_MIME.find((m) => m === img.mime) ?? "image/jpeg";
          if (maybeSlip) {
            const slipId = await createSlipFromImage({ clientId, source: "line", lineMessageId: messageId, bytes: img.bytes, mime });
            if (!slipId) return;
            const res = await processSlip(slipId);
            if (!(await dropIfNotSlip(slipId))) { await notifySlipResult(slipId, res.outcome); revalidatePath("/", "layout"); return; }
          }
          if (img.bytes.length > 5 * 1024 * 1024) return;
          const ins = await q(`insert into client_files (client_id, kind, mime, bytes, source, line_message_id, tagged) values ($1,'photo',$2,$3,'line',$4,false) on conflict (line_message_id) do nothing returning id`, [clientId, mime, img.bytes, messageId]);
          if (ins.length) await onImageSaved(clientId, userId, maybeSlip);
          revalidatePath("/", "layout");
        } catch (e) { console.error("line image", e); }
      });
    }
  }
  if (saved) revalidatePath("/", "layout");
  return Response.json({ ok: true, saved });
}
