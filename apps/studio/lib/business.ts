// ประเภทธุรกิจจากคำที่ลูกค้าพิมพ์ (ไม่เรียกฐานข้อมูล · เทสได้)
import type { Business } from "@ode/blocks/templates";

/** เดาประเภทธุรกิจจากข้อความ เช่น "เต็นท์รถมือสอง" "รีสอร์ทริมน้ำ" "ร้านกาแฟ" */
export function businessOf(kind: string | null | undefined): Business {
  const k = (kind ?? "").toLowerCase();
  if (/เต็นท์รถ|รถมือสอง|ขายรถ|รถยนต์|car\s*dealer|used\s*car/.test(k)) return "car_dealer";
  if (/ที่พัก|รีสอร์ท|รีสอร์ต|โฮมสเตย์|แคมป์|แคมปิ้ง|โรงแรม|บ้านพัก|glamp|resort|hotel|homestay|camp/.test(k)) return "hotel_camp";
  if (/คาเฟ่|กาแฟ|cafe|coffee|เบเกอรี|ขนม/.test(k)) return "cafe";
  if (!k.trim() || /ร้านอาหาร|อาหาร|ตามสั่ง|ก๋วยเตี๋ยว|ข้าว|ส้มตำ|หมูกระทะ|ชาบู|ปิ้งย่าง|ซูชิ|ครัว|ภัตตาคาร|บุฟเฟ่ต์|restaurant|food|bistro/.test(k)) return "restaurant";
  return "general"; // ธุรกิจอื่นทั้งหมด → landing page ทั่วไป
}

/** เทมเพลตทั่วไปที่เหมาะกับธุรกิจ: สินค้า G2 · คอร์สเรียน G3 · บริษัท/แพ็กเกจ G4 · บริการอื่นทั้งหมด G1 */
export function generalTemplateOf(kind: string | null | undefined): "G1" | "G2" | "G3" | "G4" {
  const k = (kind ?? "").toLowerCase();
  if (/สอน|ติว|คอร์ส|โรงเรียน|สถาบัน|เรียน|course|school|tutor|academy/.test(k)) return "G3";
  if (/บริษัท|องค์กร|แพ็กเกจ|รายเดือน|เอเจนซี|agency|saas|software|ซอฟต์แวร์|ที่ปรึกษา|consult/.test(k)) return "G4";
  if (/ขาย|สินค้า|แบรนด์|ร้านค้า|ออนไลน์|เสื้อผ้า|ครีม|เครื่องสำอาง|shop|store|brand|product/.test(k)) return "G2";
  return "G1";
}

/** เทมเพลตตั้งต้นที่ Agent ใช้ต่อธุรกิจ · ร้านอาหาร/คาเฟ่ใช้เทมเพลตรุ่นเดิม (T1/T3) · ธุรกิจใหม่ใช้เทมเพลตที่อนุมัติแล้ว (D1/H1) */
export const AGENT_TEMPLATE: Record<Business, string> = { restaurant: "T3", cafe: "T1", car_dealer: "D1", hotel_camp: "H1", general: "G1" };
/** เทมเพลตที่ Agent ใช้จากคำที่ลูกค้าพิมพ์ */
export const agentTemplateFor = (kind: string | null | undefined) => { const b = businessOf(kind); return b === "general" ? generalTemplateOf(kind) : AGENT_TEMPLATE[b]; };
/** เทมเพลตที่เป็นเวอร์ชันล็อกในตาราง template_versions (ไม่ใช่รุ่นเดิมในโค้ด) */
export const isVersionedKey = (id: string) => /^[A-Z]\d+$/.test(id) && !/^T\d+$/.test(id);
