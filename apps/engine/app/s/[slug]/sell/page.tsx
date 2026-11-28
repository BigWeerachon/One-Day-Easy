import { notFound } from "next/navigation";
import { siteBySlug } from "@/lib/sites";
import SellPage from "@/components/SellPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "ขายรถให้เรา" };
export default async function Sell({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await siteBySlug(slug);
  if (!site) notFound();
  return <SellPage site={site} target={{ slug }} back={`/s/${slug}`} />;
}
