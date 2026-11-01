import { slipImage } from "@/lib/store";
import { currentStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me) return new Response("unauthorized", { status: 401 });
  if (!can(me.role, "finance.view")) return new Response("forbidden", { status: 403 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  const img = await slipImage(id);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
