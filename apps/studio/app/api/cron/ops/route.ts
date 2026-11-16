import { followUps, dailyDigest, checkLiveSites } from "@/lib/ops";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ops Agent: ตามลูกค้าที่เงียบเกิน 24 ชม. + สรุปงานรายวันทางอีเมล · ต้องส่ง Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ followedUp: await followUps(), sitesChecked: await checkLiveSites(), digest: await dailyDigest() });
}
