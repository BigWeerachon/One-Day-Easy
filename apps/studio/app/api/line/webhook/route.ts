import { after } from "next/server";
import { verifySignature, getProfileName, describeMessage, downloadContent, type LineEvent } from "@/lib/line";
import { receiveLineMessage, hasOpenInvoice, createSlipFromImage, processSlip, notifySlipResult } from "@/lib/store";
import { revalidatePath } from "next/cache";

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
