// ประเภทธุรกิจจากคำที่ลูกค้าพิมพ์ (ไม่เรียกฐานข้อมูล · เทสได้)
import type { Business } from "@ode/blocks/templates";

/** เดาประเภทธุรกิจจากข้อความ เช่น "เต็นท์รถมือสอง" "รีสอร์ทริมน้ำ" "ร้านกาแฟ" */
export function businessOf(kind: string | null | undefined): Business {
  const k = (kind ?? "").toLowerCase();
  if (/เต็นท์รถ|รถมือสอง|ขายรถ|รถยนต์|car\s*dealer|used\s*car/.test(k)) return "car_dealer";
  if (/ที่พัก|รีสอร์ท|รีสอร์ต|โฮมสเตย์|แคมป์|แคมปิ้ง|โรงแรม|บ้านพัก|glamp|resort|hotel|homestay|camp/.test(k)) return "hotel_camp";
  if (/คาเฟ่|กาแฟ|cafe|coffee|เบเกอรี|ขนม/.test(k)) return "cafe";
  return "restaurant";
}

/** เทมเพลตตั้งต้นที่ Agent ใช้ต่อธุรกิจ · ร้านอาหาร/คาเฟ่ใช้เทมเพลตรุ่นเดิม (T1/T3) · ธุรกิจใหม่ใช้เทมเพลตที่อนุมัติแล้ว (D1/H1) */
export const AGENT_TEMPLATE: Record<Business, string> = { restaurant: "T3", cafe: "T1", car_dealer: "D1", hotel_camp: "H1" };
/** เทมเพลตที่เป็นเวอร์ชันล็อกในตาราง template_versions (ไม่ใช่รุ่นเดิมในโค้ด) */
export const isVersionedKey = (id: string) => /^[A-Z]\d+$/.test(id) && !/^T\d+$/.test(id);
