import { expireHolds, sendReminders } from "@/lib/booking";
import { q } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ปล่อยที่ที่กันไว้แต่ไม่ยืนยัน · ส่ง LINE เตือนก่อนถึงคิว · ล้างตัวกันซ้ำของ webhook · ต้องส่ง Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const expired = await expireHolds();
  const reminded = await sendReminders();
  await q(`delete from line_booking_sessions where updated_at < now() - interval '2 day'`);
  return Response.json({ expired, reminded });
}
