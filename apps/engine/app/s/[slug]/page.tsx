import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { siteBySlug } from "@/lib/sites";
import Site from "@/components/Site";
export const dynamic = "force-dynamic";
// ที่อยู่เว็บแบบ path: <engine>/s/<ชื่อร้าน> · ใช้ช่วงที่ยังไม่มีโดเมนหลักแบบ wildcard (ชื่อร้าน.โดเมน)
const str = (v: unknown) => (typeof v === "string" ? v : "");
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const site = await siteBySlug((await params).slug);
  if (!site) return { title: "ไม่พบเว็บไซต์" };
  const hero = (site.config.hero ?? {}) as Record<string, unknown>;
  const title = str(hero.title) || site.clientName;
  return { title, description: str(hero.subtitle) || undefined, openGraph: { title, description: str(hero.subtitle) || undefined, locale: "th_TH", type: "website" } };
}
export default async function BySlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await siteBySlug(slug);
  if (!site) notFound();
  return <Site site={site} fileQuery={`?slug=${encodeURIComponent(slug)}`} orderHref={`/s/${slug}/order`} sellHref={`/s/${slug}/sell`} />;
}
