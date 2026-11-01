import { notFound } from "next/navigation";
import { siteForPreview } from "@/lib/sites";
import Site from "@/components/Site";
export const dynamic = "force-dynamic";
export const metadata = { title: "ตัวอย่างเว็บ", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Preview({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ exp?: string; sig?: string }> }) {
  const { siteId } = await params; const { exp, sig } = await searchParams;
  const site = await siteForPreview(siteId, exp ?? null, sig ?? null);
  if (!site) notFound();
  // ไฟล์รูปในหน้าตัวอย่างใช้ลายเซ็นเดียวกัน
  const q = `?site=${site.id}&exp=${exp}&sig=${encodeURIComponent(sig!)}`;
  return <><Site site={site} fileQuery={q} /><div className="ribbon">ตัวอย่าง v{site.version} · ยังไม่เผยแพร่</div></>;
}
