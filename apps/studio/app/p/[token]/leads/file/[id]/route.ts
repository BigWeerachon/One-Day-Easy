import { resolvePortal } from "@/lib/portal";
import { leadFile } from "@/lib/leads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// รูปรถที่ลูกค้าส่งมา · เปิดได้เฉพาะเจ้าของร้านผ่านลิงก์ Portal ที่ยังไม่หมดอายุ
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const r = await resolvePortal(token);
  if (r.status !== "ok" || !/^\d{1,18}$/.test(id)) return new Response("not found", { status: 404 });
  const f = await leadFile(r.ctx.clientId, id);
  if (!f) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes), { headers: { "content-type": f.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
}
