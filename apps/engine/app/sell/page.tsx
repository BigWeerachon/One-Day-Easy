import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteByHost } from "@/lib/sites";
import SellPage from "@/components/SellPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "ขายรถให้เรา" };
export default async function Sell() {
  const site = await siteByHost((await headers()).get("host"));
  if (!site) notFound();
  return <SellPage site={site} target={{}} back="/" />;
}
