import "server-only";
import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import path from "node:path";
import { one, q } from "./db";
import { bahtText } from "./baht-text";
import type { DocType } from "./money";

// ฟอนต์ Sarabun (SIL OFL 1.1) · assets/fonts/OFL.txt
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const REG = path.join(FONT_DIR, "Sarabun-Regular.ttf"), BOLD = path.join(FONT_DIR, "Sarabun-Bold.ttf");

// ภาษาไทยไม่เว้นวรรคระหว่างคำ และ Sarabun ไม่มี glyph ของ zero-width space
// → ตัดบรรทัดเองตามขอบคำ (Intl.Segmenter) โดยวัดความกว้างจริงของแต่ละคำ
const seg = new Intl.Segmenter("th", { granularity: "word" });
function wrapLines(doc: PDFKit.PDFDocument, s: string, width: number): string {
  const lines: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (const { segment } of seg.segment(para)) {
      const next = line + segment;
      if (line && doc.widthOfString(next) > width) { lines.push(line.trimEnd()); line = segment.trimStart(); }
      else line = next;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
const thb = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d: string) => new Date(d + (d.length === 10 ? "T00:00:00+07:00" : "")).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

const TITLE: Record<DocType, string> = { QT: "ใบเสนอราคา", INV: "ใบแจ้งหนี้", RC: "ใบเสร็จรับเงิน", RN: "ใบแจ้งต่ออายุบริการ", CN: "ใบลดหนี้" };
const DEFAULT_ITEM: Record<DocType, string> = { QT: "ค่าบริการทำเว็บไซต์", INV: "ค่าบริการทำเว็บไซต์", RC: "ค่าบริการทำเว็บไซต์", RN: "ค่าบริการดูแลเว็บไซต์และโฮสติ้งรายปี", CN: "ลดหนี้ค่าบริการ" };

interface DocData {
  no: string; type: DocType; total: number; paid: number; status: string; issuedAt: string; expiresAt: string | null; revision: number; jobId: string | null;
  clientName: string; legalName: string | null; taxId: string | null; branch: string | null; address: string | null; poNo: string | null; wht: boolean; customerType: string; domain: string | null;
}
export const docClientId = async (no: string) => (await one<{ clientId: string }>(`select client_id "clientId" from documents where no = $1`, [no]))?.clientId ?? null;

async function load(no: string): Promise<DocData | null> {
  return (await one<DocData>(`
    select d.no, d.type, d.total_satang::int total, d.paid_satang::int paid, d.status, d.issued_at::text "issuedAt", d.expires_at::text "expiresAt", d.revision, d.job_id "jobId",
      c.name "clientName", c.legal_name "legalName", c.tax_id "taxId", c.branch, c.address, c.po_no "poNo", c.wht, c.customer_type "customerType",
      (select s.domain from jobs j join sites s on s.id = j.site_id where j.id = d.job_id) domain
    from documents d join clients c on c.id = d.client_id where d.no = $1`, [no])) ?? null;
}

/** รายการ: ถ้ายอดตรงสินค้าในแคตตาล็อก ใช้ชื่อนั้น · ไม่ตรงใช้ชื่อมาตรฐานตามประเภทเอกสาร */
async function itemName(d: DocData) {
  const m = await one<{ name: string }>(`select name from catalog_items where price_satang = $1 and active order by recurring = ($2 = 'RN') desc limit 1`, [d.total, d.type]);
  return (m?.name ?? DEFAULT_ITEM[d.type]) + (d.domain ? ` (${d.domain})` : "");
}

export async function renderDocPdf(no: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const d = await load(no);
  if (!d) return null;
  const payments = d.type === "RC" || d.paid > 0
    ? await q<{ amount: number; method: string | null; at: string }>(`select amount_satang::int amount, method, created_at::text at from payments where doc_no = $1 or doc_no in (select d2.no from documents d2 where d2.job_id = $2 and d2.type = 'INV' and $3 = 'RC') order by id`, [d.no, d.jobId, d.type])
    : [];
  const item = await itemName(d);
  const seller = {
    name: process.env.SELLER_NAME || "One Day Easy",
    address: process.env.SELLER_ADDRESS || "",
    taxId: process.env.SELLER_TAX_ID || "",
    phone: process.env.SELLER_PHONE || "",
  };
  const vat = process.env.SELLER_VAT_REGISTERED === "1";

  const doc = new PDFDocument({ size: "A4", margin: 48, info: {
    Title: `${TITLE[d.type]} ${d.no}`, Author: seller.name, Subject: TITLE[d.type],
    // วันที่คงที่ตามวันออกเอกสาร → ไฟล์เดิมได้ hash เดิม
    CreationDate: new Date(d.issuedAt + "T00:00:00+07:00"), ModDate: new Date(d.issuedAt + "T00:00:00+07:00"),
  } });
  doc.registerFont("r", REG); doc.registerFont("b", BOLD);
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((ok) => doc.on("end", () => ok()));
  const W = doc.page.width - 96, L = 48;
  const t = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions & { font?: "r" | "b"; size?: number; color?: string } = {}) => {
    doc.font(o.font ?? "r").fontSize(o.size ?? 11).fillColor(o.color ?? "#141a2b");
    const width = o.width ?? doc.page.width - 48 - x;
    doc.text(wrapLines(doc, s, width), x, y, { ...o, width });
  };

  // หัวเอกสาร
  t(seller.name, L, 48, { font: "b", size: 16, width: W * 0.55 });
  let y = doc.y + 2;
  for (const line of [seller.address, seller.taxId && `เลขประจำตัวผู้เสียภาษี ${seller.taxId}`, seller.phone && `โทร ${seller.phone}`].filter(Boolean) as string[]) { t(line, L, y, { size: 10, color: "#5d6577", width: W * 0.55 }); y = doc.y; }
  t(TITLE[d.type], L + W * 0.55, 48, { font: "b", size: 20, width: W * 0.45, align: "right" });
  t("ต้นฉบับ", L + W * 0.55, doc.y, { size: 10, color: "#5d6577", width: W * 0.45, align: "right" });
  const meta: [string, string][] = [["เลขที่", d.no + (d.revision > 1 ? ` (แก้ไขครั้งที่ ${d.revision - 1})` : "")], ["วันที่", thDate(d.issuedAt)]];
  if (d.type === "QT" && d.expiresAt) meta.push(["ยืนราคาถึง", thDate(d.expiresAt)]);
  if (d.poNo) meta.push(["อ้างอิง PO", d.poNo]);
  let my = doc.y + 6;
  for (const [k, v] of meta) { t(k, L + W * 0.55, my, { size: 10, color: "#5d6577", width: W * 0.18 }); t(v, L + W * 0.73, my, { size: 10, width: W * 0.27, align: "right" }); my = doc.y + 2; }

  // ลูกค้า
  y = Math.max(y, my) + 18;
  doc.roundedRect(L, y, W, 0.1, 0).fill("#e5e8ef");
  y += 10;
  t("ลูกค้า", L, y, { size: 10, color: "#5d6577" });
  const buyer = d.legalName || d.clientName;
  t(buyer, L, doc.y, { font: "b", size: 12, width: W });
  for (const line of [d.address, d.taxId && `เลขประจำตัวผู้เสียภาษี ${d.taxId}${d.branch ? ` · ${d.branch}` : ""}`].filter(Boolean) as string[]) t(line, L, doc.y, { size: 10, width: W });
  y = doc.y + 16;

  // ตารางรายการ
  const col = { no: L, desc: L + 40, qty: L + W - 210, amt: L + W - 120 };
  doc.rect(L, y, W, 24).fill("#f1f3f7");
  t("ลำดับ", col.no + 6, y + 6, { font: "b", size: 10 }); t("รายการ", col.desc, y + 6, { font: "b", size: 10 });
  t("จำนวน", col.qty, y + 6, { font: "b", size: 10, width: 80, align: "right" }); t("จำนวนเงิน (บาท)", col.amt, y + 6, { font: "b", size: 10, width: 120, align: "right" });
  y += 32;
  t("1", col.no + 6, y, { size: 11 });
  t(item, col.desc, y, { size: 11, width: col.qty - col.desc - 10 });
  const rowEnd = doc.y;
  t("1", col.qty, y, { size: 11, width: 80, align: "right" }); t(thb(d.total), col.amt, y, { size: 11, width: 120, align: "right" });
  y = Math.max(rowEnd, doc.y) + 12;
  doc.rect(L, y, W, 0.6).fill("#e5e8ef"); y += 10;

  // ยอดรวม
  const sumRow = (k: string, v: string, bold = false) => { t(k, col.qty - 120, y, { font: bold ? "b" : "r", size: bold ? 12 : 11, width: 200, align: "right" }); t(v, col.amt, y, { font: bold ? "b" : "r", size: bold ? 12 : 11, width: 120, align: "right" }); y = doc.y + 4; };
  if (vat) { const base = Math.round(d.total / 1.07); sumRow("มูลค่าก่อนภาษี", thb(base)); sumRow("ภาษีมูลค่าเพิ่ม 7%", thb(d.total - base)); }
  sumRow("ยอดรวมทั้งสิ้น", thb(d.total), true);
  t(`(${bahtText(d.total)})`, L, y, { size: 10, color: "#5d6577", width: col.qty - L });
  y = doc.y + 6;
  if (d.wht && (d.type === "INV" || d.type === "RN")) {
    const w = Math.round(d.total * 0.03);
    t(`กรณีหักภาษี ณ ที่จ่าย 3% (${thb(w)} บาท) ยอดโอนสุทธิ ${thb(d.total - w)} บาท · กรุณาส่งหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ทางร้าน`, L, y, { size: 10, width: W });
    y = doc.y + 6;
  }
  if (d.paid > 0 && d.type !== "RC") { t(`ชำระแล้ว ${thb(d.paid)} บาท · คงเหลือ ${thb(d.total - d.paid)} บาท`, L, y, { size: 10, width: W }); y = doc.y + 6; }

  // การชำระเงิน (ใบเสร็จ)
  if (d.type === "RC") {
    y += 8; t("การชำระเงิน", L, y, { font: "b", size: 11 }); y = doc.y + 2;
    if (payments.length) for (const p of payments) { t(`${thDate(p.at.slice(0, 10))} · ${p.method === "promptpay" ? "โอนพร้อมเพย์" : p.method ?? "โอนเงิน"} · ${thb(p.amount)} บาท`, L, y, { size: 10 }); y = doc.y + 2; }
    else { t(`ได้รับเงินจำนวน ${thb(d.total)} บาท เรียบร้อยแล้ว`, L, y, { size: 10 }); y = doc.y + 2; }
  } else if (d.type === "INV" || d.type === "RN") {
    y += 8; t("วิธีชำระเงิน", L, y, { font: "b", size: 11 }); y = doc.y + 2;
    t(`โอนผ่านพร้อมเพย์${process.env.PROMPTPAY_ID ? ` ${process.env.PROMPTPAY_ID}` : ""} ตามยอดข้างต้น · อ้างอิงเลขที่ ${d.no} · แนบสลิปผ่านลิงก์ที่ได้รับทาง LINE`, L, y, { size: 10, width: W }); y = doc.y + 2;
  }

  // ลายเซ็น
  const sy = Math.max(y + 48, doc.page.height - 190);
  for (const [i, label] of (d.type === "RC" ? ["ผู้รับเงิน", "ผู้จ่ายเงิน"] : ["ผู้ออกเอกสาร", "ผู้รับเอกสาร"]).entries()) {
    const x = L + i * (W / 2) + 30;
    doc.moveTo(x, sy).lineTo(x + W / 2 - 60, sy).lineWidth(0.6).strokeColor("#b8c2d6").stroke();
    t(`(${label})`, x, sy + 6, { size: 10, color: "#5d6577", width: W / 2 - 60, align: "center" });
    t("วันที่ ........ / ........ / ........", x, doc.y + 2, { size: 9, color: "#5d6577", width: W / 2 - 60, align: "center" });
  }
  t(vat ? "เอกสารนี้ออกโดยระบบ" : "เอกสารนี้ไม่ใช่ใบกำกับภาษี · ออกโดยระบบ One Day Easy", L, doc.page.height - 70, { size: 8, color: "#8a92a3", width: W, align: "center" });

  // ลายน้ำสถานะ
  const stamp = d.status === "voided" ? "ยกเลิก" : d.status === "expired" ? "หมดอายุ" : null;
  if (stamp) {
    doc.save().rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font("b").fontSize(110).fillColor("#c62828").opacity(0.18).text(stamp, 0, doc.page.height / 2 - 70, { width: doc.page.width, align: "center" });
    doc.restore();
  }
  doc.end(); await done;
  const pdf = Buffer.concat(chunks);
  // P2: เก็บ hash ของไฟล์ครั้งแรกที่สร้างต่อรอบเอกสาร · ไฟล์สร้างซ้ำได้ hash เดิม (วันที่ใน PDF คงที่) จึงตรวจย้อนหลังได้
  await q(`insert into document_files (doc_no, revision, sha256, bytes) values ($1,$2,$3,$4) on conflict do nothing`, [d.no, d.revision, createHash("sha256").update(pdf).digest("hex"), pdf.length]);
  return { pdf, filename: `${d.no}.pdf` };
}
export const DOC_TITLE = TITLE;
