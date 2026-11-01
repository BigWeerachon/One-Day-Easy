// PromptPay QR (EMVCo / Thai QR Payment) · pure · ทดสอบได้
const tlv = (id: string, v: string) => id + String(v.length).padStart(2, "0") + v;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const b of Buffer.from(s, "utf8")) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** id = เบอร์มือถือ 10 หลัก, เลขบัตร/ภาษี 13 หลัก หรือ e-Wallet 15 หลัก · amount เป็นสตางค์ */
export function promptPayPayload(id: string, amountSatang?: number): string {
  const d = id.replace(/\D/g, "");
  let target: string;
  if (d.length === 10 && d.startsWith("0")) target = tlv("01", "0066" + d.slice(1));
  else if (d.length === 13) target = tlv("02", d);
  else if (d.length === 15) target = tlv("03", d);
  else throw new Error("PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก เลข 13 หลัก หรือ e-Wallet 15 หลัก");
  const hasAmount = amountSatang != null && amountSatang > 0;
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") +                // 12 = ใช้ครั้งเดียว (มียอด) · 11 = ใช้ซ้ำได้
    tlv("29", tlv("00", "A000000677010111") + target) +
    tlv("53", "764") +                                  // THB
    (hasAmount ? tlv("54", (amountSatang! / 100).toFixed(2)) : "") +
    tlv("58", "TH") + "6304";
  return body + crc16(body);
}
