import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteByHost } from "@/lib/sites";
import OrderPage from "@/components/OrderPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "สั่งออนไลน์" };
export default async function Order() {
  const host = (await headers()).get("host");
  const site = await siteByHost(host);
  if (!site) notFound();
  return <OrderPage site={site} target={{ host: host ?? "" }} back="/" />;
}
