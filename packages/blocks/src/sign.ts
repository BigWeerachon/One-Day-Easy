import { createHmac, timingSafeEqual } from "node:crypto";
// ลิงก์ดูตัวอย่างเว็บร่าง: /preview/<siteId>?exp=<unix>&sig=<hmac> · ใช้ secret ร่วมกันระหว่าง Studio กับ Engine
export function signPreview(siteId: string, expUnix: number, secret: string) {
  return createHmac("sha256", secret).update(`${siteId}.${expUnix}`).digest("base64url");
}
export function verifyPreview(siteId: string, exp: string | null, sig: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || !exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  const want = Buffer.from(signPreview(siteId, Number(exp), secret)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
export function previewQuery(siteId: string, secret: string, ttlSeconds = 7 * 86400, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `exp=${exp}&sig=${signPreview(siteId, exp, secret)}`;
}
