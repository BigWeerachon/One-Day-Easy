import { currentStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { renderDocPdf } from "@/lib/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ no: string }> }) {
  const me = await currentStaff();
  if (!me) return new Response("unauthorized", { status: 401 });
  if (!can(me.role, "finance.view")) return new Response("forbidden", { status: 403 });
  const { no } = await params;
  if (!/^[A-Z]{2,3}-[\w-]{1,20}$/.test(no)) return new Response("not found", { status: 404 });
  const r = await renderDocPdf(no);
  if (!r) return new Response("not found", { status: 404 });
  const dl = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `${dl ? "attachment" : "inline"}; filename="${r.filename}"`, "cache-control": "private, no-store" } });
}
