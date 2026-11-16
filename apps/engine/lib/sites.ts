import "server-only";
import { one } from "./db";
import { verifyPreview } from "@ode/blocks/sign";

export interface SiteRow { id: string; clientId: string; domain: string; template: string; status: string; version: number; config: Record<string, unknown>; clientName: string }
const COLS = `s.id, s.client_id "clientId", s.domain, s.template, s.status, s.version, s.config, c.name "clientName"`;

// แคชสั้นๆ ต่อโดเมน (30 วิ) · แก้เว็บใน Studio แล้วเห็นผลภายในครึ่งนาที
const TTL = 30_000;
const cache = new Map<string, { at: number; site: SiteRow | null }>();

export const normalizeHost = (h: string | null) => (h ?? "").toLowerCase().split(":")[0].replace(/^www\./, "").replace(/\.$/, "");

/** เว็บจริง: ตามโดเมน · แสดงเฉพาะเว็บที่ขึ้นออนไลน์แล้ว (live/down) ไม่แสดงร่าง */
export async function siteByHost(hostHeader: string | null): Promise<SiteRow | null> {
  let host = normalizeHost(hostHeader);
  if (process.env.ENGINE_DEV_HOST && (host === "localhost" || host === "127.0.0.1")) host = process.env.ENGINE_DEV_HOST;
  if (!host) return null;
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.site;
  // โดเมนหลักของระบบ หรือโดเมนของลูกค้าที่ผูกแล้ว (DNS + SSL พร้อม)
  const site = (await one<SiteRow>(`select ${COLS} from sites s join clients c on c.id = s.client_id
    where s.status in ('live','down') and (lower(s.domain) = $1 or exists (select 1 from site_domains d where d.site_id = s.id and d.domain = $1 and d.status = 'active'))`, [host])) ?? null;
  cache.set(host, { at: Date.now(), site });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return site;
}

/** เว็บจริงตามชื่อย่อ (ส่วนแรกของโดเมนระบบ เช่น kruapadaeng-a1b2c3) · เฉพาะเว็บที่ออนไลน์แล้ว */
export async function siteBySlug(slug: string): Promise<SiteRow | null> {
  const s = slug.toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(s)) return null;
  const hit = cache.get(`/s/${s}`);
  if (hit && Date.now() - hit.at < TTL) return hit.site;
  const site = (await one<SiteRow>(`select ${COLS} from sites s join clients c on c.id = s.client_id where s.status in ('live','down') and split_part(lower(s.domain), '.', 1) = $1 limit 1`, [s])) ?? null;
  cache.set(`/s/${s}`, { at: Date.now(), site });
  return site;
}

/** ร่าง: ต้องมีลายเซ็นจาก Studio (PREVIEW_SECRET) และยังไม่หมดอายุ · ไม่ใช้แคช */
export async function siteForPreview(siteId: string, exp: string | null, sig: string | null): Promise<SiteRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !verifyPreview(siteId, exp, sig, process.env.PREVIEW_SECRET)) return null;
  return (await one<SiteRow>(`select ${COLS} from sites s join clients c on c.id = s.client_id where s.id = $1`, [siteId])) ?? null;
}
