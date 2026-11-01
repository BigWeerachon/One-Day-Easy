// กฎตรวจสลิป (pure · ทดสอบได้) · อนุมัติอัตโนมัติเมื่อผ่านทุกข้อเท่านั้น
export interface SlipRead {
  is_transfer_slip: boolean;
  amount: number | null;          // บาท
  ref: string | null;             // เลขอ้างอิงธุรกรรม
  paid_at: string | null;         // ISO 8601
  bank: string | null;
  sender_name: string | null;
  receiver_name: string | null;
  receiver_account: string | null; // อาจถูกปิดบางหลัก เช่น xxx-x-x1234-x
}
export interface OpenDoc { no: string; due: number; issuedAt: string } // due = สตางค์
export interface Check { rule: string; ok: boolean; detail: string }
export interface Receiver { names: string[]; accountDigits: string[] } // จาก SHOP_RECEIVER_NAMES / SHOP_RECEIVER_ACCOUNTS

const norm = (s: string) => s.toLowerCase().replace(/\s+|นาย|นาง|นางสาว|น\.ส\.|mr\.?|mrs\.?|ms\.?|บจก\.?|บริษัท|จำกัด|co\.?,?\s*ltd\.?/g, "");
const digits = (s: string) => s.replace(/\D/g, "");

/** บัญชีบนสลิปถูกปิดบางหลัก (เช่น xxx-x-x6789-x) · ตรงเมื่อชุดเลขที่มองเห็นติดกันยาวสุด (≥4 หลัก) อยู่ในเลขบัญชีเรา */
export function receiverMatches(read: SlipRead, r: Receiver): boolean {
  const visible = (read.receiver_account ?? "").match(/\d+/g)?.sort((a, b) => b.length - a.length)[0] ?? "";
  if (visible.length >= 4 && r.accountDigits.some((a) => digits(a).includes(visible))) return true;
  const name = norm(read.receiver_name ?? "");
  return name.length >= 3 && r.names.some((n) => { const m = norm(n); return m.length >= 3 && (name.includes(m) || m.includes(name)); });
}

export function evaluateSlip(read: SlipRead, docs: OpenDoc[], opts: { receiver: Receiver; refUsed: boolean; now: Date; maxAgeDays: number }) {
  const checks: Check[] = [];
  const amount = read.amount != null ? Math.round(read.amount * 100) : null;
  const doc = amount != null ? [...docs].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt)).find((d) => d.due === amount) : undefined;
  const paid = read.paid_at ? new Date(read.paid_at) : null;

  checks.push({ rule: "เป็นสลิปโอนเงิน", ok: read.is_transfer_slip, detail: read.is_transfer_slip ? "ใช่" : "รูปนี้ไม่ใช่สลิปโอนเงิน" });
  checks.push({ rule: "ยอดตรงใบแจ้งหนี้", ok: !!doc, detail: doc ? `${doc.no}` : amount == null ? "อ่านยอดไม่ได้" : docs.length ? `ไม่มีใบที่ค้าง ${(amount / 100).toLocaleString()}฿ พอดี` : "ลูกค้าไม่มีใบแจ้งหนี้ค้าง" });
  checks.push({ rule: "เลขอ้างอิงไม่ซ้ำ", ok: !!read.ref && !opts.refUsed, detail: !read.ref ? "อ่านเลขอ้างอิงไม่ได้" : opts.refUsed ? `เลข ${read.ref} เคยใช้แล้ว (สลิปซ้ำ)` : read.ref });
  const configured = opts.receiver.names.length + opts.receiver.accountDigits.length > 0;
  const recvOk = configured && receiverMatches(read, opts.receiver);
  checks.push({ rule: "โอนเข้าบัญชีร้าน", ok: recvOk, detail: !configured ? "ยังไม่ได้ตั้ง SHOP_RECEIVER_NAMES / SHOP_RECEIVER_ACCOUNTS" : recvOk ? (read.receiver_name ?? read.receiver_account ?? "") : `ผู้รับ: ${read.receiver_name ?? "?"} ${read.receiver_account ?? ""}`.trim() });
  const ageDays = paid ? (opts.now.getTime() - paid.getTime()) / 864e5 : null;
  const afterIssue = paid && doc ? paid.toISOString().slice(0, 10) >= doc.issuedAt.slice(0, 10) : true;
  const dateOk = ageDays != null && ageDays >= -0.05 && ageDays <= opts.maxAgeDays && afterIssue;
  checks.push({ rule: "วันที่โอนสมเหตุสมผล", ok: dateOk, detail: !paid || isNaN(paid.getTime()) ? "อ่านวันที่ไม่ได้" : ageDays! < -0.05 ? "วันที่อยู่ในอนาคต" : ageDays! > opts.maxAgeDays ? `เก่ากว่า ${opts.maxAgeDays} วัน` : !afterIssue ? "โอนก่อนวันออกใบแจ้งหนี้" : paid.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) });
  return { checks, doc, amount, allPass: checks.every((c) => c.ok) };
}
