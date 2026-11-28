import { headers } from "next/headers";
import { siteByHost, siteBySlug } from "@/lib/sites";
import { sabaiOrder } from "@/lib/sabai";

// ออเดอร์จากหน้าสั่งออนไลน์ → Sabai (คีย์อยู่ฝั่งนี้) · ร้านตามโดเมนที่เปิดอยู่ หรือชื่อย่อ /s/<slug>
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const site = typeof b.slug === "string" && b.slug ? await siteBySlug(b.slug) : await siteByHost((await headers()).get("host"));
  if (!site) return Response.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const items = Array.isArray(b.items) ? b.items.slice(0, 30).map((i: { menuItemId?: unknown; qty?: unknown }) => ({ menuItemId: String(i.menuItemId ?? ""), qty: Math.trunc(Number(i.qty)) })) : [];
  const s = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const r = await sabaiOrder(site, {
    customerName: s("customerName", 60), phone: s("phone", 20), externalRef: s("externalRef", 80), items,
    ...(s("pickupAt", 40) ? { pickupAt: s("pickupAt", 40) } : {}), ...(s("note", 200) ? { note: s("note", 200) } : {}),
  });
  return r.ok ? Response.json({ orderNo: r.orderNo, total: r.total }) : Response.json({ error: r.error }, { status: 422 });
}
