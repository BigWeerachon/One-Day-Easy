// แปลงจำนวนเงิน (สตางค์) เป็นตัวอักษรไทย เช่น 159000 → "หนึ่งพันห้าร้อยเก้าสิบบาทถ้วน"
const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** 0 < n < 1,000,000 · หลักหน่วยเป็น 1 และมีหลักที่สูงกว่า → "เอ็ด" · หลักสิบ 1 → "สิบ", 2 → "ยี่สิบ" */
function under1M(n: number): string {
  const d = String(n).split("").map(Number).reverse();
  let out = "";
  for (let i = d.length - 1; i >= 0; i--) {
    const x = d[i];
    if (!x) continue;
    if (i === 1) out += x === 1 ? "สิบ" : x === 2 ? "ยี่สิบ" : DIGIT[x] + "สิบ";
    else if (i === 0 && x === 1 && n > 9) out += "เอ็ด";
    else out += DIGIT[x] + POS[i];
  }
  return out;
}
function compose(n: number): string {
  if (n < 1_000_000) return under1M(n);
  const hi = Math.floor(n / 1_000_000), lo = n % 1_000_000;
  return compose(hi) + "ล้าน" + (lo ? under1M(lo) : "");
}
export function bahtText(satang: number): string {
  if (!Number.isInteger(satang) || satang < 0) throw new Error("จำนวนเงินไม่ถูกต้อง");
  const b = Math.floor(satang / 100), s = satang % 100;
  if (b === 0 && s === 0) return "ศูนย์บาทถ้วน";
  return (b ? compose(b) + "บาท" : "") + (s ? compose(s) + "สตางค์" : "ถ้วน");
}
