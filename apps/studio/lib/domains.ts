import "server-only";
import { q, one, tx } from "./db";
import * as V from "./vercel";
import { normalizeDomain, isPlatformDomain, parsePrice, toE164Dot } from "./domain-rules";

export interface SiteDomain { id: string; siteId: string; domain: string; source: string; status: string; verified: boolean; dnsOk: boolean; sslOk: boolean; dnsHint: DnsHint | null; lastError: string | null; orderId: string | null; priceUsd: string | null; checkedAt: string | null; activatedAt: string | null }
export interface DnsHint { records: { type: string; name: string; value: string; why: string }[] }
const COLS = `id::text, site_id "siteId", domain, source, status, verified, dns_ok "dnsOk", ssl_ok "sslOk", dns_hint "dnsHint", last_error "lastError", order_id "orderId", price_usd::text "priceUsd", checked_at::text "checkedAt", activated_at::text "activatedAt"`;
export const listSiteDomains = (siteId: string) => q<SiteDomain>(`select ${COLS} from site_domains where site_id = $1 and status <> 'removed' order by id`, [siteId]);
export const maxPriceUsd = () => Number(process.env.DOMAIN_MAX_PRICE_USD ?? 30);

async function emit(name: string, siteId: string, after: unknown) {
  const job = await one<{ id: string }>(`select id from jobs where site_id = $1 order by created_at desc limit 1`, [siteId]);
  await q(`insert into events (name, job_id, actor, source, after) values ($1,$2,'system','system',$3)`, [name, job?.id ?? null, JSON.stringify(after)]);
}

/** เรคคอร์ด DNS ที่ลูกค้าต้องตั้ง: challenge ยืนยัน (TXT) + ชี้มาที่ Vercel (A สำหรับโดเมนหลัก / CNAME สำหรับ subdomain) */
function hintFrom(domain: string, pd: V.ProjectDomain | null, cfg: V.DomainConfig | null): DnsHint {
  const apex = domain.split(".").length === 2 || /\.(co|in|or|ac|go|net|mi)\.th$/.test(domain) && domain.split(".").length === 3;
  const records: DnsHint["records"] = (pd?.verification ?? []).map((v) => ({ type: v.type, name: v.domain, value: v.value, why: "ยืนยันความเป็นเจ้าของ" }));
  if (apex) {
    const ip = cfg?.recommendedIPv4?.sort((a, b) => a.rank - b.rank)[0]?.value?.[0] ?? "76.76.21.21";
    records.push({ type: "A", name: "@", value: ip, why: "ชี้โดเมนมาที่เว็บ" });
  } else {
    const cname = cfg?.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value ?? "cname.vercel-dns.com";
    records.push({ type: "CNAME", name: domain.split(".")[0], value: cname, why: "ชี้โดเมนมาที่เว็บ" });
  }
  return { records };
}

/** เปิด https ได้จริงหรือไม่ (ใบรับรองออกแล้ว) · สถานะ HTTP ใดก็ได้ ขอแค่ TLS ผ่าน */
async function sslWorks(domain: string) {
  if (process.env.DOMAIN_SSL_PROBE === "off") return true;
  try { await fetch(`https://${domain}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) }); return true; } catch { return false; }
}

/** ผูกโดเมนที่ลูกค้ามีอยู่แล้วเข้ากับ Site Engine */
export async function attachDomain(siteId: string, input: string, by: string) {
  if (!V.vercelConfigured()) throw new Error("ยังไม่ได้ตั้ง VERCEL_TOKEN / ENGINE_PROJECT_ID");
  const domain = normalizeDomain(input);
  if (!domain) throw new Error("รูปแบบโดเมนไม่ถูกต้อง เช่น kruapadaeng.com");
  if (isPlatformDomain(domain)) throw new Error("โดเมนของระบบใช้ได้อยู่แล้ว ไม่ต้องผูก");
  if (await one(`select 1 from site_domains where domain = $1 and status <> 'removed'`, [domain])) throw new Error("โดเมนนี้ผูกกับเว็บอื่นอยู่แล้ว");
  let pd: V.ProjectDomain;
  try { pd = await V.addProjectDomain(domain); }
  catch (e) {
    const err = e as V.VercelError;
    if (err.status === 409 || err.code === "domain_already_in_use") throw new Error("โดเมนนี้ใช้อยู่ในบัญชี Vercel อื่น · ให้ลูกค้าถอดออกก่อน หรือยืนยันด้วย TXT");
    throw new Error(err.message);
  }
  const row = await one<{ id: string }>(`insert into site_domains (site_id, domain, source, created_by, dns_hint) values ($1,$2,'attach',$3,$4) returning id::text`, [siteId, domain, by, JSON.stringify(hintFrom(domain, pd, null))]);
  await checkDomain(row!.id);
  return row!.id;
}

/** ตรวจสถานะ: ยืนยันเจ้าของ → DNS ถูก → https ใช้ได้ → active */
export async function checkDomain(id: string) {
  const d = await one<{ domain: string; siteId: string; status: string }>(`select domain, site_id "siteId", status from site_domains where id = $1`, [id]);
  if (!d || d.status === "removed") return;
  try {
    let pd = await V.getProjectDomain(d.domain);
    if (!pd.verified) { try { pd = await V.verifyProjectDomain(d.domain); } catch (e) { if ((e as V.VercelError).status !== 400) throw e; } }
    const cfg = await V.getDomainConfig(d.domain);
    const dnsOk = pd.verified && !cfg.misconfigured;
    const sslOk = dnsOk && (await sslWorks(d.domain));
    const wasActive = d.status === "active";
    const active = pd.verified && dnsOk && sslOk;
    await q(`update site_domains set verified = $2, dns_ok = $3, ssl_ok = $4, dns_hint = $5, last_error = null, checked_at = now(),
      status = case when $6 then 'active' else 'pending' end, activated_at = case when $6 and activated_at is null then now() else activated_at end where id = $1`,
      [id, pd.verified, dnsOk, sslOk, JSON.stringify(hintFrom(d.domain, pd, cfg)), active]);
    if (active && !wasActive) { await emit("domain.attached", d.siteId, { domain: d.domain }); await emit("ssl.issued", d.siteId, { domain: d.domain }); }
  } catch (e) {
    await q(`update site_domains set last_error = $2, checked_at = now() where id = $1`, [id, (e as Error).message.slice(0, 300)]);
  }
}

/** ตรวจโดเมนที่ยังไม่พร้อม (เรียกจาก cron) */
export async function runDueDomainChecks(limit = 20) {
  const due = await q<{ id: string }>(`select id::text from site_domains where status = 'pending' and (checked_at is null or checked_at < now() - interval '5 minutes') and created_at > now() - interval '14 days' order by checked_at nulls first limit $1`, [limit]);
  for (const d of due) await checkDomain(d.id);
  return due.length;
}

export async function removeDomain(id: string) {
  const d = await one<{ domain: string; status: string }>(`select domain, status from site_domains where id = $1`, [id]);
  if (!d || d.status === "removed") throw new Error("ไม่พบโดเมน");
  try { await V.removeProjectDomain(d.domain); } catch (e) { if ((e as V.VercelError).status !== 404) throw e; }
  await q(`update site_domains set status = 'removed' where id = $1`, [id]);
}

// ---------- ซื้อโดเมนใหม่ (Owner เท่านั้น · มีค่าใช้จ่ายจริง) ----------
export interface Quote { domain: string; available: boolean; priceUsd: number | null; renewalUsd: number | null; years: number; overCap: boolean }
export async function quoteDomain(input: string): Promise<Quote> {
  const domain = normalizeDomain(input);
  if (!domain) throw new Error("รูปแบบโดเมนไม่ถูกต้อง");
  if (isPlatformDomain(domain)) throw new Error("โดเมนนี้เป็นของระบบ");
  const { available } = await V.getAvailability(domain);
  if (!available) return { domain, available: false, priceUsd: null, renewalUsd: null, years: 1, overCap: false };
  const p = await V.getPrice(domain);
  const price = parsePrice(p.purchasePrice);
  return { domain, available: true, priceUsd: price, renewalUsd: parsePrice(p.renewalPrice), years: p.years, overCap: price == null || price > maxPriceUsd() };
}

function registrant(): V.Contact {
  const e = process.env;
  const phone = toE164Dot(e.REGISTRANT_PHONE ?? "");
  const need = { REGISTRANT_FIRST_NAME: e.REGISTRANT_FIRST_NAME, REGISTRANT_LAST_NAME: e.REGISTRANT_LAST_NAME, REGISTRANT_EMAIL: e.REGISTRANT_EMAIL, REGISTRANT_PHONE: phone, REGISTRANT_ADDRESS: e.REGISTRANT_ADDRESS, REGISTRANT_CITY: e.REGISTRANT_CITY, REGISTRANT_STATE: e.REGISTRANT_STATE, REGISTRANT_ZIP: e.REGISTRANT_ZIP };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`ยังไม่ได้ตั้งข้อมูลผู้จดโดเมน: ${missing.join(", ")}`);
  return { firstName: need.REGISTRANT_FIRST_NAME!, lastName: need.REGISTRANT_LAST_NAME!, email: need.REGISTRANT_EMAIL!, phone: phone!, address1: need.REGISTRANT_ADDRESS!, city: need.REGISTRANT_CITY!, state: need.REGISTRANT_STATE!, zip: need.REGISTRANT_ZIP!, country: e.REGISTRANT_COUNTRY || "TH", companyName: e.REGISTRANT_COMPANY || undefined };
}

/** ซื้อโดเมน: ราคาที่คนเห็นต้องตรงกับราคาตอนซื้อ (expectedPrice) · ไม่เกินเพดาน · พิมพ์ชื่อโดเมนยืนยัน · กันกดซ้ำ */
export async function purchaseDomain(siteId: string, input: string, confirmText: string, shownPrice: number, by: string) {
  if (!V.vercelConfigured()) throw new Error("ยังไม่ได้ตั้ง VERCEL_TOKEN / ENGINE_PROJECT_ID");
  const domain = normalizeDomain(input);
  if (!domain || confirmText.trim().toLowerCase() !== domain) throw new Error("พิมพ์ชื่อโดเมนให้ตรงเพื่อยืนยันการซื้อ");
  const contact = registrant();
  const quote = await quoteDomain(domain);
  if (!quote.available) throw new Error("โดเมนนี้ไม่ว่างแล้ว");
  if (quote.priceUsd == null || quote.priceUsd !== shownPrice) throw new Error(`ราคาเปลี่ยนเป็น $${quote.priceUsd ?? "?"} · ตรวจราคาใหม่ก่อนซื้อ`);
  if (quote.overCap) throw new Error(`ราคา $${quote.priceUsd} เกินเพดาน $${maxPriceUsd()} (DOMAIN_MAX_PRICE_USD)`);
  // จองแถวก่อนเรียกซื้อ (unique domain) → กดซ้ำ/สองแท็บพร้อมกันจะไม่ซื้อซ้ำ
  const row = await tx(async (c) => {
    const r = await c.query(`insert into site_domains (site_id, domain, source, created_by, price_usd) values ($1,$2,'purchase',$3,$4) on conflict (domain) do nothing returning id::text`, [siteId, domain, by, quote.priceUsd]);
    return r.rows[0] as { id: string } | undefined;
  });
  if (!row) throw new Error("โดเมนนี้กำลังดำเนินการอยู่แล้ว");
  try {
    const order = await V.buyDomain(domain, { autoRenew: true, years: quote.years, expectedPrice: quote.priceUsd, contactInformation: contact });
    await q(`update site_domains set order_id = $2 where id = $1`, [row.id, order.orderId]);
  } catch (e) {
    await q(`update site_domains set status = 'error', last_error = $2 where id = $1`, [row.id, (e as Error).message.slice(0, 300)]);
    await q(`update site_domains set domain = domain || '#failed-' || id where id = $1`, [row.id]); // ปล่อยชื่อให้ลองใหม่ได้
    throw new Error(`ซื้อไม่สำเร็จ: ${(e as Error).message}`);
  }
  try { await V.addProjectDomain(domain); } catch (e) { await q(`update site_domains set last_error = $2 where id = $1`, [row.id, (e as Error).message.slice(0, 300)]); }
  await checkDomain(row.id);
  return row.id;
}
