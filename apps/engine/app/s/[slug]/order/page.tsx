import { notFound } from "next/navigation";
import { siteBySlug } from "@/lib/sites";
import OrderPage from "@/components/OrderPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "สั่งออนไลน์" };
export default async function Order({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await siteBySlug(slug);
  if (!site) notFound();
  return <OrderPage site={site} target={{ slug }} back={`/s/${slug}`} />;
}
