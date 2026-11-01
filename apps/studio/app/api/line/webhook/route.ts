import { verifySignature, getProfileName, describeMessage, type LineEvent } from "@/lib/line";
import { receiveLineMessage } from "@/lib/store";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (r === "new") saved++;
  }
  if (saved) revalidatePath("/", "layout");
  return Response.json({ ok: true, saved });
}
