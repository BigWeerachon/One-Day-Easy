import "server-only";
import type { SiteRow } from "./sites";
import { staleCache } from "./stale-cache";

// เว็บร้านที่เชื่อมกับระบบร้าน Sabai: เมนู ราคา และของหมดมาจาก POS · ลูกค้าสั่งจากเว็บ ออเดอร์เข้าจอครัว (ช่องทาง "เว็บไซต์" ไม่มี GP)
// คีย์ของสาขาอยู่ในฐานข้อมูลฝั่งเรา Engine เป็นคนเรียก Sabai เบราว์เซอร์ไม่เห็นคีย์

export interface SabaiItem { id: string; name: string; description: string | null; imageUrl: string | null; price: string; available: boolean; category: string }
export interface SabaiMenu { shop: string; branch: string; ordering: boolean; items: SabaiItem[] }

// เมนูจาก Sabai: ค่าใหม่ทุก 1 นาที · Sabai ล่ม → ใช้เมนูชุดล่าสุดได้อีก 1 วัน (แล้วค่อยกลับไปใช้เมนูที่บันทึกในเว็บ)
const cache = staleCache<SabaiMenu>({ ttl: 60_000, staleFor: 86_400_000, max: 2000 });

export const linked = (s: SiteRow) => !!(s.sabaiApi && s.sabaiKey);

/** เมนูจาก Sabai (แคช 1 นาที) · เชื่อมไม่ได้ = null แล้วเว็บใช้เมนูที่บันทึกไว้แทน เว็บไม่ล่ม */
export async function sabaiMenu(s: SiteRow): Promise<SabaiMenu | null> {
  if (!linked(s)) return null;
  try {
    return await cache.get(s.id, async () => {
      const r = await fetch(`${s.sabaiApi}/v1/public/menu`, { headers: { "x-website-key": s.sabaiKey! }, signal: AbortSignal.timeout(4000), cache: "no-store" });
      if (!r.ok) throw new Error(`sabai menu ${r.status}`);
      const j = (await r.json()) as { shop: string; branch: string; ordering: boolean; categories: { name: string; items: Omit<SabaiItem, "category">[] }[] };
      return { shop: j.shop, branch: j.branch, ordering: j.ordering, items: j.categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name }))) };
    });
  } catch { return null; } // ไม่เคยได้เมนูเลย → ใช้เมนูที่บันทึกในเว็บ
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
    if (r.ok && j.orderNo) { return { ok: true, orderNo: j.orderNo, total: j.total ?? "" }; }
    const code = j.error?.code;
    return { ok: false, error: code === "MENU_ITEM_SOLD_OUT" ? "มีเมนูที่เพิ่งหมด ลองเลือกใหม่อีกครั้ง"
      : code === "RATE_LIMITED" ? "ตอนนี้ออเดอร์เยอะ ลองอีกครั้งในอีกสักครู่ หรือโทรสั่งที่ร้าน"
      : code === "VALIDATION" ? "กรอกชื่อและเบอร์โทรให้ครบ" : "สั่งไม่สำเร็จ ลองอีกครั้ง หรือโทรสั่งที่ร้าน" };
  } catch {
    return { ok: false, error: "เชื่อมต่อร้านไม่ได้ ลองอีกครั้ง หรือโทรสั่งที่ร้าน" };
  }
}
