import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { siteByHost } from "@/lib/sites";
import Site from "@/components/Site";
export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : "");
export async function generateMetadata(): Promise<Metadata> {
  const site = await siteByHost((await headers()).get("host"));
  if (!site) return { title: "ไม่พบเว็บไซต์" };
  const hero = (site.config.hero ?? {}) as Record<string, unknown>;
  const title = str(hero.title) || site.clientName;
  return { title, description: str(hero.subtitle) || undefined, openGraph: { title, description: str(hero.subtitle) || undefined, locale: "th_TH", type: "website" } };
}
export default async function Home() {
  const site = await siteByHost((await headers()).get("host"));
  if (!site) notFound();
  return <Site site={site} />;
}
