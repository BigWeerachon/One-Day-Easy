import "server-only";
import { previewQuery } from "@ode/blocks/sign";
// ลิงก์ดูเว็บร่างบน Site Engine · ใช้ได้ 7 วัน
export const engineConfigured = () => Boolean(process.env.ENGINE_URL && process.env.PREVIEW_SECRET);
export function previewUrl(siteId: string, ttlSeconds = 7 * 86400) {
  if (!engineConfigured()) return null;
  return `${process.env.ENGINE_URL!.replace(/\/$/, "")}/preview/${siteId}?${previewQuery(siteId, process.env.PREVIEW_SECRET!, ttlSeconds)}`;
}
export const liveUrl = (domain: string) => `https://${domain}`;
