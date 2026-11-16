import "server-only";
import { previewQuery } from "@ode/blocks/sign";
// ลิงก์ดูเว็บร่างบน Site Engine · ใช้ได้ 7 วัน
export const engineConfigured = () => Boolean(process.env.ENGINE_URL && process.env.PREVIEW_SECRET);
export function previewUrl(siteId: string, ttlSeconds = 7 * 86400) {
  if (!engineConfigured()) return null;
  return `${process.env.ENGINE_URL!.replace(/\/$/, "")}/preview/${siteId}?${previewQuery(siteId, process.env.PREVIEW_SECRET!, ttlSeconds)}`;
}
/** ที่อยู่เว็บจริง: มีโดเมนหลัก (PLATFORM_DOMAIN) = https://ชื่อร้าน.โดเมน · ยังไม่มี = <ENGINE_URL>/s/ชื่อร้าน · โดเมนของลูกค้าเองใช้ตรงๆ */
export function liveUrl(domain: string) {
  const platform = process.env.PLATFORM_DOMAIN;
  const isSystem = /\.onedayeasy\.app$/.test(domain) || (platform ? domain.endsWith(`.${platform}`) : false);
  if (isSystem && !platform && process.env.ENGINE_URL) return `${process.env.ENGINE_URL.replace(/\/$/, "")}/s/${domain.split(".")[0]}`;
  return `https://${domain}`;
}
