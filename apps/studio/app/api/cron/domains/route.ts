import { runDueDomainChecks } from "@/lib/domains";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ตรวจโดเมนที่รอ DNS/SSL ทุก 10 นาที · Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ checked: await runDueDomainChecks() });
}
