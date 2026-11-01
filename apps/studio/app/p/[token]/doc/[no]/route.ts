import { resolvePortal } from "@/lib/portal";
import { renderDocPdf, docClientId } from "@/lib/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ลูกค้าดาวน์โหลดได้เฉพาะเอกสารของตัวเอง ผ่านลิงก์ Portal ที่ยังไม่หมดอายุ
export async function GET(_: Request, { params }: { params: Promise<{ token: string; no: string }> }) {
  const { token, no } = await params;
  const r = await resolvePortal(token);
  if (r.status !== "ok" || !/^[A-Z]{2,3}-[\w-]{1,20}$/.test(no) || (await docClientId(no)) !== r.ctx.clientId) return new Response("not found", { status: 404 });
  const out = await renderDocPdf(no);
  if (!out) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(out.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${out.filename}"`, "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
}
