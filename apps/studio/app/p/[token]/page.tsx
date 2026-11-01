import QRCode from "qrcode";
import * as P from "@/lib/portal";
import { approveAction, requestEditAction, paidEditAction, slipAction, newLinkAction } from "@/lib/portal-actions";
import { promptPayPayload } from "@/lib/promptpay";
import { baht } from "@/lib/money";
import { previewUrl } from "@/lib/preview";
import ImageInput from "@/components/ImageInput";
import IntakeForm from "@/components/IntakeForm";
import SubmitButton from "@/components/SubmitButton";
export const dynamic = "force-dynamic";

const Top = ({ expires }: { expires?: string }) => (
  <header className="pt-top"><div className="pt-logo">One Day <span>Easy</span></div>
    <span className="pt-chip">{expires ? `ลิงก์ส่วนตัว · ใช้ได้ถึง ${new Date(expires).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : "ลิงก์ส่วนตัว"}</span></header>
);
const Steps = ({ n }: { n: number }) => <div className="pt-step" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</div>;
const T = ({ t }: { t: string }) => <input type="hidden" name="t" value={t} />;

async function Qr({ amount }: { amount: number }) {
  const id = process.env.PROMPTPAY_ID;
  if (!id) return <div className="pt-sm pt-mut">ทีมงานจะส่งช่องทางชำระเงินให้ทาง LINE</div>;
  const svg = await QRCode.toString(promptPayPayload(id, amount), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return <div className="pt-qr" role="img" aria-label={`QR พร้อมเพย์ ยอด ${baht(amount)}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string; ok?: string; extra?: string; link?: string }> }) {
  const { token } = await params; const sp = await searchParams;
  const r = await P.resolvePortal(token);

  if (r.status !== "ok") return (
    <div className="pt-wrap"><Top /><div className="pt-bd">
      <div className="pt-card" style={{ textAlign: "center", padding: "28px 16px" }}><h1 className="pt-h">{r.status === "expired" ? "ลิงก์นี้หมดอายุแล้ว" : "ไม่พบลิงก์นี้"}</h1>
        <p className="pt-sm pt-mut" style={{ marginTop: 6 }}>{r.status === "expired" ? `ลิงก์มีอายุ ${P.LINK_DAYS} วันเพื่อความปลอดภัยของข้อมูลร้าน` : "ตรวจว่าคัดลอกลิงก์ครบ หรือทักทีมงานทาง LINE"}</p></div>
      {r.status === "expired" && (sp.link === "sent" ? <div className="pt-note">ส่งลิงก์ใหม่ไปที่ LINE ของร้านแล้ว</div>
        : <form action={newLinkAction}><T t={token} />
          {sp.link === "too-soon" && <div className="pt-err" style={{ marginBottom: 10 }}>เพิ่งส่งลิงก์ใหม่ไป รอ 10 นาทีแล้วลองอีกครั้ง</div>}
          {sp.link === "no-line" && <div className="pt-err" style={{ marginBottom: 10 }}>ร้านนี้ยังไม่ได้เชื่อม LINE กรุณาทักทีมงาน</div>}
          <SubmitButton className="pt-btn" pending="กำลังส่ง…">ขอลิงก์ใหม่ทาง LINE</SubmitButton>
          <p className="pt-sm pt-mut" style={{ textAlign: "center", marginTop: 8 }}>ระบบส่งลิงก์ใหม่ไปที่ LINE ที่ลงทะเบียนไว้ทันที</p></form>)}
    </div></div>
  );

  const { ctx } = r, { client: c, job, site } = ctx;
  const shortSlip = sp.ok === "slip" && (job.stage === "payment") ? await (async () => { const d = (await P.openDocs(ctx))[0]; const sl = await P.latestSlip(ctx); return !!(d && sl?.status === "pending" && sl.amount != null && sl.amount < d.total - d.paid); })() : false;
  const msg = sp.err ? <div className="pt-err" role="alert">{sp.err}</div>
    : sp.ok && !shortSlip ? <div className="pt-note">{({ intake: "ได้รับข้อมูลแล้ว ทีมงานกำลังทำเว็บให้", edit: "ส่งคำขอแก้แล้ว ทีมงานจะแจ้งเมื่อเสร็จ", approved: "อนุมัติแล้ว ขอบคุณค่ะ", slip: "ได้รับสลิปแล้ว ทีมงานกำลังตรวจสอบ", paid: "ชำระเรียบร้อย ขอบคุณค่ะ" } as Record<string, string>)[sp.ok] ?? ""}</div> : null;
  const page = (n: number, label: string, title: string, body: React.ReactNode, sub?: string) => (
    <div className="pt-wrap"><Top expires={ctx.expiresAt} /><div className="pt-bd">
      {n > 0 && <Steps n={n} />}<div><div className="pt-sm pt-mut">{label}</div><h1 className="pt-h">{title}</h1>{sub && <p className="pt-sm pt-mut">{sub}</p>}</div>
      {msg}{body}
    </div></div>
  );

  // ---------- 1 · ข้อมูลร้าน ----------
  if (job.stage === "new_chat" || job.stage === "intake") return page(1, "ขั้นที่ 1/4 · ข้อมูลร้าน", c.name, (
    <IntakeForm token={token} initial={{ name: c.name, phone: c.phone ?? "", hours: c.openingHours ?? "", customerType: c.customerType, legalName: c.legalName ?? "", taxId: c.taxId ?? "",
      branch: c.branch && c.branch !== "สำนักงานใหญ่" ? "branch" : "hq", branchNo: c.branch?.replace(/\D/g, "") ?? "", address: c.address ?? "", poNo: c.poNo ?? "", wht: c.wht ? "1" : "", pdpa: job.pdpa ? "1" : "" }} />
  ), "กรอกเท่าที่มี ส่วนที่ขาดทีมงานจะทักถามทาง LINE");

  // ---------- 2 · ตรวจเว็บ ----------
  if (job.stage === "template") return page(2, "ขั้นที่ 2/4 · ทีมงานกำลังทำเว็บ", "กำลังทำเว็บของคุณ",
    <div className="pt-card pt-sm">ทีมงานจะส่งตัวอย่างเว็บให้ตรวจทาง LINE เร็วๆ นี้ · เปิดลิงก์นี้อีกครั้งเมื่อได้รับแจ้ง{job.editRequests.length > 0 && <div className="pt-mut" style={{ marginTop: 8 }}>คำขอแก้ล่าสุด: {job.editRequests.at(-1)!.text}</div>}</div>);

  if (job.stage === "client_review") {
    const hero = (site?.config.hero ?? {}) as { title?: string; subtitle?: string; cta?: string };
    const free = Math.max(0, P.FREE_EDITS - job.editRounds);
    const pv = site ? previewUrl((await P.siteIdOf(ctx))!, 2 * 86400) : null;
    if (sp.extra != null) {
      const price = await P.extraEditPrice();
      return page(2, `ขั้นที่ 2/4 · ขอแก้รอบที่ ${job.editRounds + 1}`, "รอบแก้ฟรีครบแล้ว", (<>
        <div className="pt-card"><div className="pt-sm pt-mut">สิ่งที่ขอแก้</div><p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{sp.extra}</p></div>
        <div className="pt-card"><div className="pt-row"><span>แก้ไขรอบที่ {job.editRounds + 1}</span><span>{price ? baht(price) : "—"}</span></div><div className="pt-row" style={{ border: 0, fontWeight: 700 }}><span>ยอดชำระ</span><span>{price ? baht(price) : "—"}</span></div></div>
        <form action={paidEditAction}><T t={token} /><input type="hidden" name="text" value={sp.extra} /><SubmitButton className="pt-btn" pending="กำลังส่ง…">{`ยืนยันคำขอแก้ (${price ? baht(price) : "-"} ชำระพร้อมยอดหลัก)`}</SubmitButton></form>
        <a className="pt-btn o" href={`/p/${token}`}>ยกเลิกคำขอแก้</a>
      </>), `คุณใช้รอบแก้ฟรีครบ ${P.FREE_EDITS} รอบแล้ว รอบนี้มีค่าบริการ`);
    }
    return page(2, "ขั้นที่ 2/4 · ตรวจเว็บ", `ตัวอย่างเว็บของคุณ (v${site?.version ?? 1})`, (<>
      {pv ? (<div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
          <iframe src={pv} title="ตัวอย่างเว็บของคุณ" style={{ width: "100%", height: 520, border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer" />
          <a className="pt-sm" style={{ display: "block", padding: "12px 16px" }} href={pv} target="_blank" rel="noopener noreferrer">เปิดดูเต็มจอ ↗</a></div>)
        : <div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ background: "#c8102e", color: "#fff", padding: "22px 16px" }}>{c.openingHours && <div className="pt-sm" style={{ opacity: .85 }}>เปิด {c.openingHours}</div>}
          <div style={{ fontSize: 21, fontWeight: 700, margin: "6px 0 4px" }}>{hero.title ?? c.name}</div>{hero.subtitle && <div className="pt-sm" style={{ opacity: .9, marginBottom: 10 }}>{hero.subtitle}</div>}
          {hero.cta && <span className="pt-chip" style={{ background: "#fcc419", color: "#141a2b" }}>{hero.cta}</span>}</div>
        {site && <div className="pt-sm pt-mut" style={{ padding: "12px 16px" }}>{site.domain}</div>}</div>}
      <div className="pt-card"><div className="pt-row" style={{ paddingTop: 0 }}><span>รอบแก้ฟรีคงเหลือ</span><b>{free} / {P.FREE_EDITS}</b></div><p className="pt-sm pt-mut" style={{ marginTop: 8 }}>รอบที่ {P.FREE_EDITS + 1} ขึ้นไปมีค่าบริการ</p></div>
      <form action={approveAction}><T t={token} /><SubmitButton className="pt-btn g" pending="กำลังอนุมัติ…">อนุมัติเว็บนี้</SubmitButton></form>
      <form action={requestEditAction} className="pt-card"><T t={token} /><label className="pt-lbl" style={{ marginTop: 0 }} htmlFor="e">หรือบอกสิ่งที่อยากแก้</label>
        <textarea id="e" name="text" className="pt-inp" rows={3} required minLength={3} maxLength={1000} placeholder="เช่น เปลี่ยนรูปหน้าแรก เพิ่มเมนูข้าวมันไก่ทอด" />
        <div style={{ marginTop: 10 }}><SubmitButton className="pt-btn o" pending="กำลังส่ง…">ส่งคำขอแก้</SubmitButton></div></form>
    </>));
  }

  // ---------- 3 · ชำระเงิน ----------
  if (job.stage === "invoice" || job.stage === "payment") {
    const docs = await P.openDocs(ctx);
    if (!docs.length) return page(3, "ขั้นที่ 3/4 · ชำระเงิน", "กำลังออกใบแจ้งหนี้", <div className="pt-card pt-sm">ทีมงานกำลังออกใบแจ้งหนี้ จะแจ้งทาง LINE เมื่อพร้อม</div>);
    // ชำระทีละใบ (เก่าสุดก่อน) · สลิปหนึ่งใบจับคู่ได้กับใบแจ้งหนี้หนึ่งใบ
    const cur = docs[0], rest = docs.slice(1);
    const due = cur.total - cur.paid;
    const slip = await P.latestSlip(ctx);
    const pending = slip?.status === "pending";
    const short = pending && slip!.amount != null && slip!.amount < due;
    return page(3, "ขั้นที่ 3/4 · ชำระเงิน", `ใบแจ้งหนี้ ${cur.no}`, (<>
      {short && <div className="pt-card" style={{ background: "#fdecec", borderColor: "#f5c2c2" }}><h2 className="pt-h" style={{ color: "#b42323" }}>ยอดในสลิปยังไม่ครบ</h2><p className="pt-sm" style={{ marginTop: 6 }}>สลิปล่าสุด {baht(slip!.amount!)} จากยอด {baht(due)} · ทีมงานกำลังตรวจสอบ</p></div>}
      {pending && !short && <div className="pt-note">ได้รับสลิปแล้ว ทีมงานกำลังตรวจสอบ</div>}
      <div className="pt-card">
        <div className="pt-row"><span>ยอดตามใบแจ้งหนี้</span><span>{baht(cur.total)}</span></div>
        {cur.paid > 0 && <div className="pt-row"><span>ชำระแล้ว</span><span>{baht(cur.paid)}</span></div>}
        <div className="pt-row" style={{ border: 0, fontWeight: 700, fontSize: 17 }}><span>{cur.paid > 0 ? "คงเหลือ" : "ยอดชำระ"}</span><span>{baht(due)}</span></div>
        <a className="pt-btn o" style={{ marginTop: 6 }} href={`/p/${token}/doc/${cur.no}`}>ดาวน์โหลด PDF</a>
      </div>
      <div className="pt-card" style={{ textAlign: "center" }}><div style={{ fontWeight: 600 }}>{cur.paid > 0 ? "สแกนจ่ายส่วนที่เหลือ" : "สแกนจ่ายด้วยพร้อมเพย์"}</div><Qr amount={due} /><div className="pt-sm pt-mut">ยอดตรง {baht(due)} · อ้างอิง {cur.no}</div></div>
      <form action={slipAction} className="pt-bd" style={{ padding: 0 }}><T t={token} />
        <ImageInput name="slip" label={cur.paid > 0 ? "แนบสลิปส่วนที่เหลือ" : "แนบสลิป"} max={2000} limit={1} required />
        <SubmitButton className="pt-btn" pending="กำลังตรวจสลิป…">ส่งสลิป</SubmitButton>
        <p className="pt-sm pt-mut" style={{ textAlign: "center" }}>ระบบตรวจสลิปอัตโนมัติ และส่งใบเสร็จให้ทาง LINE ทันที</p></form>
      {rest.length > 0 && <div className="pt-card pt-sm"><div className="pt-mut">ใบถัดไป (ชำระหลังใบนี้)</div>{rest.map((d) => <div key={d.no} className="pt-row"><span>{d.no}</span><span>{baht(d.total - d.paid)}</span></div>)}</div>}
    </>));
  }

  // ---------- 4 · เสร็จ ----------
  if (job.stage === "online" || job.stage === "care") {
    const rc = await P.latestReceipt(ctx);
    return page(4, "", "", (<>
      <div className="pt-card" style={{ textAlign: "center", padding: "28px 16px" }}><div className="pt-ok" style={{ fontSize: 40 }} aria-hidden="true">✓</div><h2 className="pt-h">ชำระเรียบร้อย · เว็บออนไลน์แล้ว</h2>{site && <p className="pt-sm pt-mut" style={{ marginTop: 6 }}>{site.domain}</p>}</div>
      <div className="pt-card">{rc && <div className="pt-row"><span>ใบเสร็จ</span><b>{rc.no}</b></div>}<div className="pt-row" style={{ border: 0 }}><span>สถานะเว็บ</span><b className="pt-ok">ออนไลน์</b></div></div>
      {site && <a className="pt-btn" href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer">เปิดเว็บไซต์</a>}
      {rc && <a className="pt-btn o" href={`/p/${token}/doc/${rc.no}`}>ดาวน์โหลดใบเสร็จ</a>}
    </>));
  }

  return page(0, "", "งานนี้พักไว้ชั่วคราว", <div className="pt-card pt-sm">ทีมงานจะติดต่อกลับทาง LINE</div>);
}
