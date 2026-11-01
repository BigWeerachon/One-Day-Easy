import { headers } from "next/headers";
import { one } from "@/lib/db";
import { siteByHost, siteForPreview } from "@/lib/sites";
export const dynamic = "force-dynamic";
// รูปของลูกค้า: ให้เฉพาะไฟล์ของเจ้าของเว็บที่กำลังเปิดอยู่ (ตามโดเมน หรือ preview ที่มีลายเซ็น)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  const u = new URL(req.url);
  const site = u.searchParams.get("site")
    ? await siteForPreview(u.searchParams.get("site")!, u.searchParams.get("exp"), u.searchParams.get("sig"))
    : await siteByHost((await headers()).get("host"));
  if (!site) return new Response("not found", { status: 404 });
  const f = await one<{ mime: string; bytes: Buffer }>(`select mime, bytes from client_files where id = $1 and client_id = $2`, [id, site.clientId]);
  if (!f || !f.mime.startsWith("image/")) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes), { headers: { "content-type": f.mime, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}
