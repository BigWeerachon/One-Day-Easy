import { runDueLineTasks } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ลองส่ง LINE ที่ล้มเหลวซ้ำตามเวลา (backoff) · เรียกทุก 1–5 นาที เช่น Vercel Cron / Supabase pg_cron
// ต้องส่ง header Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ran: await runDueLineTasks() });
}
