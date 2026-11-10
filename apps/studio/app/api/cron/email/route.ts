import { runDueEmails } from "@/lib/notify";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ส่งอีเมลที่ค้างหรือถึงเวลาลองใหม่ · ต้องส่ง Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ran: await runDueEmails() });
}
