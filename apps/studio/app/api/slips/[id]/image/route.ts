import { slipImage } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  const img = await slipImage(id);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
