/** เลขประจำตัวผู้เสียภาษี/บัตรประชาชน 13 หลัก พร้อมตรวจหลักสุดท้าย */
export function validTaxId(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 13) return false;
  const sum = [...d.slice(0, 12)].reduce((a, c, i) => a + Number(c) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}
export const validThaiPhone = (v: string) => /^0\d{8,9}$/.test(v.replace(/[\s-]/g, ""));
