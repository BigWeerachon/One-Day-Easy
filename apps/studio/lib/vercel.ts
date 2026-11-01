import "server-only";
// Vercel REST API (ตาม docs: projects/domains, domains/config, registrar) · VERCEL_API_BASE ใช้ชี้ mock ตอนทดสอบเท่านั้น
const base = () => process.env.VERCEL_API_BASE || "https://api.vercel.com";
export const vercelConfigured = () => Boolean(process.env.VERCEL_TOKEN && process.env.ENGINE_PROJECT_ID);

export class VercelError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new VercelError("ยังไม่ได้ตั้ง VERCEL_TOKEN", 0);
  const url = new URL(base() + path);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  } catch (e) { throw new VercelError(`ติดต่อ Vercel ไม่ได้: ${(e as Error).message}`, 0); }
  const text = await res.text();
  let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string }; code?: string; message?: string } | null) ?? {};
    const code = err.error?.code ?? err.code, msg = err.error?.message ?? err.message ?? text.slice(0, 200);
    throw new VercelError(`Vercel ${res.status}${code ? ` ${code}` : ""}: ${msg}`, res.status, code);
  }
  return json as T;
}
const project = () => encodeURIComponent(process.env.ENGINE_PROJECT_ID!);

export interface ProjectDomain { name: string; verified: boolean; verification?: { type: string; domain: string; value: string; reason: string }[] }
export interface DomainConfig { misconfigured: boolean; configuredBy?: string | null; recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] }

export const addProjectDomain = (name: string) => call<ProjectDomain>("POST", `/v10/projects/${project()}/domains`, { name });
export const getProjectDomain = (name: string) => call<ProjectDomain>("GET", `/v9/projects/${project()}/domains/${encodeURIComponent(name)}`);
export const verifyProjectDomain = (name: string) => call<ProjectDomain>("POST", `/v9/projects/${project()}/domains/${encodeURIComponent(name)}/verify`);
export const removeProjectDomain = (name: string) => call<unknown>("DELETE", `/v9/projects/${project()}/domains/${encodeURIComponent(name)}`);
export const getDomainConfig = (name: string) => call<DomainConfig>("GET", `/v6/domains/${encodeURIComponent(name)}/config`);

export const getAvailability = (name: string) => call<{ available: boolean }>("GET", `/v1/registrar/domains/${encodeURIComponent(name)}/availability`);
export const getPrice = (name: string) => call<{ years: number; purchasePrice: number | string; renewalPrice: number | string }>("GET", `/v1/registrar/domains/${encodeURIComponent(name)}/price`);
export interface Contact { firstName: string; lastName: string; email: string; phone: string; address1: string; city: string; state: string; zip: string; country: string; companyName?: string }
export const buyDomain = (name: string, body: { autoRenew: boolean; years: number; expectedPrice: number; contactInformation: Contact }) =>
  call<{ orderId: string }>("POST", `/v1/registrar/domains/${encodeURIComponent(name)}/buy`, body);
