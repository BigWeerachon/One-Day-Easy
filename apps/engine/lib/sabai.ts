import "server-only";
import type { SiteRow } from "./sites";

// เว็บร้านที่เชื่อมกับระบบร้าน Sabai: เมนู ราคา และของหมดมาจาก POS · ลูกค้าสั่งจากเว็บ ออเดอร์เข้าจอครัว (ช่องทาง "เว็บไซต์" ไม่มี GP)
// คีย์ของสาขาอยู่ในฐานข้อมูลฝั่งเรา Engine เป็นคนเรียก Sabai เบราว์เซอร์ไม่เห็นคีย์

export interface SabaiItem { id: string; name: string; description: string | null; imageUrl: string | null; price: string; available: boolean; category: string }
export interface SabaiMenu { shop: string; branch: string; ordering: boolean; items: SabaiItem[] }

const TTL = 60_000;
const cache = new Map<string, { at: number; menu: SabaiMenu | null }>();

export const linked = (s: SiteRow) => !!(s.sabaiApi && s.sabaiKey);

/** เมนูจาก Sabai (แคช 1 นาที) · เชื่อมไม่ได้ = null แล้วเว็บใช้เมนูที่บันทึกไว้แทน เว็บไม่ล่ม */
export async function sabaiMenu(s: SiteRow): Promise<SabaiMenu | null> {
  if (!linked(s)) return null;
  const hit = cache.get(s.id);
  if (hit && Date.now() - hit.at < TTL) return hit.menu;
  let menu: SabaiMenu | null = null;
  try {
    const r = await fetch(`${s.sabaiApi}/v1/public/menu`, { headers: { "x-website-key": s.sabaiKey! }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { shop: string; branch: string; ordering: boolean; categories: { name: string; items: Omit<SabaiItem, "category">[] }[] };
      menu = { shop: j.shop, branch: j.branch, ordering: j.ordering, items: j.categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name }))) };
    }
  } catch { /* ใช้เมนูที่บันทึกไว้ */ }
  cache.set(s.id, { at: Date.now(), menu });
  return menu;
}

export interface OrderInput { customerName: string; phone: string; note?: string; pickupAt?: string; externalRef: string; items: { menuItemId: string; qty: number }[] }

/** ส่งออเดอร์ไป Sabai · คืนเลขออเดอร์ หรือข้อความที่ลูกค้าอ่านเข้าใจ */
export async function sabaiOrder(s: SiteRow, o: OrderInput): Promise<{ ok: true; orderNo: string; total: string } | { ok: false; error: string }> {
  if (!linked(s)) return { ok: false, error: "ร้านนี้ยังไม่เปิดสั่งออนไลน์" };
  try {
    const r = await fetch(`${s.sabaiApi}/v1/public/orders`, {
      method: "POST", headers: { "x-website-key": s.sabaiKey!, "content-type": "application/json" }, body: JSON.stringify(o), signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json().catch(() => ({}))) as { orderNo?: string; total?: string; error?: { code?: string; message?: string } };
    if (r.ok && j.orderNo) { cache.delete(s.id); return { ok: true, orderNo: j.orderNo, total: j.total ?? "" }; }
    const code = j.error?.code;
    return { ok: false, error: code === "MENU_ITEM_SOLD_OUT" ? "มีเมนูที่เพิ่งหมด ลองเลือกใหม่อีกครั้ง"
      : code === "RATE_LIMITED" ? "ตอนนี้ออเดอร์เยอะ ลองอีกครั้งในอีกสักครู่ หรือโทรสั่งที่ร้าน"
      : code === "VALIDATION" ? "กรอกชื่อและเบอร์โทรให้ครบ" : "สั่งไม่สำเร็จ ลองอีกครั้ง หรือโทรสั่งที่ร้าน" };
  } catch {
    return { ok: false, error: "เชื่อมต่อร้านไม่ได้ ลองอีกครั้ง หรือโทรสั่งที่ร้าน" };
  }
}
