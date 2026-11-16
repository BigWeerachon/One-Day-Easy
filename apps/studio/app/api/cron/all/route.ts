import { runAllDue } from "@/lib/tick";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// งานตามเวลาทั้งหมดในคำขอเดียว · เรียกจาก GitHub Actions ทุก 5 นาที และ Vercel Cron วันละครั้ง
// ต้องส่ง Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await runAllDue());
}
