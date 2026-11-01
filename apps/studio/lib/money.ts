// เงินเก็บเป็นสตางค์ (integer) เสมอ
export const baht = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
export type DocType = "QT" | "INV" | "RC" | "RN" | "CN";
export const DOC_LABEL: Record<DocType, string> = { QT: "ใบเสนอราคา", INV: "ใบแจ้งหนี้", RC: "ใบเสร็จ", RN: "ใบต่ออายุ", CN: "ใบลดหนี้" };
// doc_sequences: เลขเรียงต่อเนื่องแยกประเภท/ปี (ปี ค.ศ. 2 หลัก + เดือน เช่น INV-2611-008)
export function formatDocNo(type: DocType, year: number, month: number, seq: number) {
  const yy = year % 100;
  return `${type}-${String(yy).padStart(2, "0")}${String(month).padStart(2, "0")}-${String(seq).padStart(3, "0")}`;
}
export const slipMatches = (slip: number, due: number) => slip === due;
export const EXPIRY_DAYS = 15; // P5
