import { ingestSellCar, verifyLead, LeadError } from "@/lib/leads";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// รับข้อมูล "ขายรถให้เรา" ที่ Engine ส่งต่อมา (ลงลายเซ็นด้วย PREVIEW_SECRET)
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 45 * 1024 * 1024) return Response.json({ error: "ข้อมูลใหญ่เกินไป" }, { status: 413 });
  if (!verifyLead(body, req.headers.get("x-ode-ts"), req.headers.get("x-ode-sig"), process.env.PREVIEW_SECRET)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const r = await ingestSellCar(JSON.parse(body));
    return Response.json({ ok: true, id: r.id });
  } catch (e) {
    if (e instanceof LeadError) return Response.json({ error: e.message }, { status: e.status });
    console.error("leads", e);
    return Response.json({ error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
