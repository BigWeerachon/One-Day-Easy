import QRCode from "qrcode";
import { verifyPreview } from "@ode/blocks/sign";
import { promptPayPayload } from "@/lib/promptpay";
import { one } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// รูป QR พร้อมเพย์ของใบแจ้งหนี้ (ยอดคงเหลือ ณ ตอนเปิด) · ส่งเป็นรูปในแชท LINE
// ไม่ต้องล็อกอิน แต่ต้องมีลายเซ็นและยังไม่หมดอายุ · ไม่มีข้อมูลลูกค้าในรูป
export async function GET(req: Request, { params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const u = new URL(req.url);
  if (!verifyPreview(`pay:${no}`, u.searchParams.get("exp"), u.searchParams.get("sig"), process.env.PREVIEW_SECRET)) return new Response("not found", { status: 404 });
  const id = process.env.PROMPTPAY_ID;
  const d = await one<{ due: number }>(`select (total_satang - paid_satang)::int due from documents where no = $1 and status = 'issued'`, [no]);
  if (!id || !d || d.due <= 0) return new Response("not found", { status: 404 });
  const png = await QRCode.toBuffer(promptPayPayload(id, d.due), { type: "png", margin: 2, width: 600, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
