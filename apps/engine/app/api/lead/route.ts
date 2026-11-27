import { headers } from "next/headers";
import { createHmac } from "node:crypto";
import { siteByHost, siteBySlug } from "@/lib/sites";
import { SELL_CAR_PHOTOS } from "@ode/blocks/leads";
export const maxDuration = 30;

// ฟอร์มขายรถ → Studio (Engine อ่าน DB อย่างเดียว) · ลงลายเซ็นด้วย PREVIEW_SECRET ที่ใช้ร่วมกัน
export async function POST(req: Request) {
  const studio = process.env.STUDIO_URL, secret = process.env.PREVIEW_SECRET;
  if (!studio || !secret) return Response.json({ error: "ระบบยังไม่พร้อม ลองติดต่อร้านทาง LINE" }, { status: 503 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const h = await headers();
  const slug = String(fd.get("slug") ?? "");
  const site = slug ? await siteBySlug(slug) : await siteByHost(h.get("host"));
  if (!site) return Response.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const files = fd.getAll("photos").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (files.length > SELL_CAR_PHOTOS.max) return Response.json({ error: `แนบได้ไม่เกิน ${SELL_CAR_PHOTOS.max} รูป` }, { status: 422 });
  if (files.some((f) => f.size > SELL_CAR_PHOTOS.maxBytes)) return Response.json({ error: "รูปใหญ่เกิน 3 MB ต่อรูป" }, { status: 422 });
  const fields: Record<string, string> = {};
  for (const k of ["name", "phone", "province", "brand", "model", "year", "mileage", "gear", "color", "asking", "note", "plate", "consent"]) {
    const v = fd.get(k); if (typeof v === "string") fields[k] = v.slice(0, 400);
  }
  const photos = await Promise.all(files.map(async (f) => ({ mime: f.type, b64: Buffer.from(await f.arrayBuffer()).toString("base64") })));
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const body = JSON.stringify({ siteId: site.id, ipHash: ip, fields, photos });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("base64url");
  const r = await fetch(`${studio.replace(/\/$/, "")}/api/leads`, { method: "POST", body, headers: { "content-type": "application/json", "x-ode-ts": String(ts), "x-ode-sig": sig } }).catch(() => null);
  if (!r) return Response.json({ error: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  const j = await r.json().catch(() => ({}));
  return Response.json(r.ok ? { ok: true } : { error: j.error ?? "ส่งไม่สำเร็จ" }, { status: r.ok ? 200 : r.status });
}
