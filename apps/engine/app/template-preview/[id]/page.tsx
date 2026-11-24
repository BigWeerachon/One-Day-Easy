import { notFound } from "next/navigation";
import { verifyPreview } from "@ode/blocks/sign";
import { sampleConfig, type SampleKind, type TemplateSpec } from "@ode/blocks/templates";
import { one } from "@/lib/db";
import Site from "@/components/Site";
export const dynamic = "force-dynamic";
export const metadata = { title: "ตัวอย่างเทมเพลต", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

// ตัวอย่างเทมเพลต (ร่างหรืออนุมัติแล้ว) ด้วยข้อมูล 3 ชุด: ตัวอย่าง · ยาวสุด · ว่าง · ลิงก์ต้องมีลายเซ็นจาก Studio
export default async function TemplatePreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ data?: string; site?: string; exp?: string; sig?: string }> }) {
  const { id } = await params; const { data, site: siteId, exp, sig } = await searchParams;
  // ?site=<id> = ดูเว็บจริงของร้านบนเวอร์ชันนี้ก่อนอัปเกรด (ลายเซ็นผูกทั้งเทมเพลตและร้าน)
  if (!/^\d+$/.test(id) || (siteId && !/^[0-9a-f-]{36}$/i.test(siteId))) notFound();
  if (!verifyPreview(siteId ? `tpl:${id}:site:${siteId}` : `tpl:${id}`, exp ?? null, sig ?? null, process.env.PREVIEW_SECRET)) notFound();
  const tv = await one<{ key: string; version: number; name: string; business: TemplateSpec["business"]; spec: Omit<TemplateSpec, "key" | "version" | "name" | "business">; status: string }>(
    `select key, version, name, business, spec, status from template_versions where id = $1`, [id]);
  if (!tv) notFound();
  const kind: SampleKind = data === "long" || data === "empty" ? data : "sample";
  const spec: TemplateSpec = { ...tv.spec, key: tv.key, version: tv.version, name: tv.name, business: tv.business };
  if (siteId) {
    const real = await one<{ config: Record<string, unknown>; name: string }>(`select s.config, c.name from sites s join clients c on c.id = s.client_id where s.id = $1`, [siteId]);
    if (!real) notFound();
    const site = { id: siteId, clientId: "", domain: "", template: "", status: "draft", version: tv.version, config: real.config, clientName: real.name, sabaiApi: null, sabaiKey: null, spec };
    return <><Site site={site} fileQuery={`?site=${siteId}&tv=${id}&exp=${exp}&sig=${encodeURIComponent(sig!)}`} /><div className="ribbon">{real.name} บน {tv.key} v{tv.version} · ตัวอย่างก่อนอัปเกรด</div></>;
  }
  const site = { id: `tpl-${id}`, clientId: "", domain: "", template: "", status: "draft", version: tv.version, config: sampleConfig(tv.business, kind), clientName: kind === "long" ? "ร้าน".repeat(15) : "ร้านตัวอย่าง", sabaiApi: null, sabaiKey: null, spec };
  return <><Site site={site} /><div className="ribbon">{tv.key} v{tv.version} · {kind === "long" ? "ข้อมูลยาวสุด" : kind === "empty" ? "ข้อมูลน้อยสุด" : "ข้อมูลตัวอย่าง"} · {tv.status === "approved" ? "อนุมัติแล้ว" : "ร่าง"}</div></>;
}
