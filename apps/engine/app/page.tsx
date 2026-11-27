import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { siteByHost } from "@/lib/sites";
import Site from "@/components/Site";
import Landing from "@/components/Landing";
import { isMarketingHost } from "@/lib/sites";
export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : "");
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  if (isMarketingHost(host)) return { title: "One Day Easy · เว็บไซต์ร้านค้า เสร็จในวันเดียว ผ่าน LINE", description: "ดูตัวอย่างเว็บร้านคุณก่อน ถูกใจค่อยจ่าย เริ่มต้น 990 บาท ไม่มีมัดจำ", openGraph: { locale: "th_TH", type: "website" } };
  const site = await siteByHost(host);
  if (!site) return { title: "ไม่พบเว็บไซต์" };
  const hero = (site.config.hero ?? {}) as Record<string, unknown>;
  const title = str(hero.title) || site.clientName;
  return { title, description: str(hero.subtitle) || undefined, openGraph: { title, description: str(hero.subtitle) || undefined, locale: "th_TH", type: "website" } };
}
export default async function Home() {
  const host = (await headers()).get("host");
  if (isMarketingHost(host)) return <Landing />;
  const site = await siteByHost(host);
  if (!site) notFound();
  return <Site site={site} orderHref="/order" sellHref="/sell" />;
}
