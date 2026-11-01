import { requirePage } from "@/lib/auth";
import { listDocs, listSlips, listCatalog, listClients, listJobs } from "@/lib/store";
import { issueDocAction, verifySlipAction, addSlipAction, voidDocAction, uploadSlipAction, reprocessSlipAction } from "@/lib/actions";
import { listSlips as listSlipsBy, slipAutoApprove } from "@/lib/store";
import SubmitButton from "@/components/SubmitButton";
import { baht, DOC_LABEL } from "@/lib/money";
import { Header, Card, Kpi, Err } from "@/components/ui";
const TONE = { issued: "c-b", paid: "c-g", voided: "", expired: "c-y", draft: "" };
export default async function Finance({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requirePage("finance.view");
  const { err } = await searchParams;
  const [docs, slips, catalog, clients, jobs, verified] = await Promise.all([listDocs(), listSlips(), listCatalog(), listClients(), listJobs(), listSlipsBy("verified")]);
  const autoToday = verified.filter((s) => s.decidedBy === "auto").length;
  const outstanding = docs.filter((d) => d.type === "INV" && d.status === "issued").reduce((a, d) => a + d.total - d.paid, 0);
  const received = docs.filter((d) => d.type === "RC").reduce((a, d) => a + d.total, 0);
  return (<>
    <Header crumb="แคตตาล็อก → เอกสาร → ชำระ → กระทบยอด" title="การเงิน" />
    <div className="bd">
      <Err msg={err} />
      <div className="kpis"><Kpi label="ยอดค้างชำระ" value={baht(outstanding)} /><Kpi label="รับแล้ว (ใบเสร็จ)" value={baht(received)} tone="#0a7a3a" /><Kpi label="สลิปรอตรวจ" value={slips.length} /></div>
      <Card title="สลิปรอตรวจ" right={<span className="sm mut">{slipAutoApprove() ? "อนุมัติอัตโนมัติเมื่อผ่านทุกข้อ · ไม่ผ่านข้อใดรอคนตรวจ" : "ปิดอนุมัติอัตโนมัติ (SLIP_AUTO_APPROVE=off)"}</span>} pad={false}>
        {slips.map((s) => { const open = docs.filter((d) => d.status === "issued" && (d.type === "INV" || d.type === "RN") && (!s.clientId || d.clientId === s.clientId)); return (
          <div key={s.id} className="qi" style={{ alignItems: "flex-start" }}>
            {s.hasImage && <a href={`/api/slips/${s.id}/image`} target="_blank"><img src={`/api/slips/${s.id}/image`} alt={`สลิป #${s.id}`} style={{ width: 84, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e8ef" }} /></a>}
            <div style={{ flex: "1 1 320px" }}>
              <div className="f"><b>#{s.id} · {s.clientName ?? "ไม่ทราบลูกค้า"}{s.docNo ? ` · ${s.docNo}` : ""}</b><span className="chip">{({ line: "LINE", upload: "อัปโหลด", manual: "บันทึกมือ" } as Record<string, string>)[s.source]}</span></div>
              <div className="sm mut">สลิป {s.amount != null ? baht(s.amount) : "—"}{s.due != null ? ` · ยอดค้าง ${baht(s.due)}` : ""}{s.bank ? ` · ${s.bank}` : ""}{s.ref ? ` · อ้างอิง ${s.ref}` : ""}{s.paidAt ? ` · โอน ${new Date(s.paidAt).toLocaleString("th-TH")}` : ""}</div>
              {s.checks && <div className="list sm" style={{ gap: 2, marginTop: 6 }}>{s.checks.map((c) => <div key={c.rule}>{c.ok ? "✅" : "❌"} {c.rule} <span className="mut">· {c.detail}</span></div>)}</div>}
            </div>
            <div className="list" style={{ gap: 6 }}>
              <form action={verifySlipAction} className="f"><input type="hidden" name="slip" value={s.id} /><input type="hidden" name="accept" value="1" />
                {!s.docNo && <select name="doc" style={{ width: 150 }} required>{open.map((d) => <option key={d.no} value={d.no}>{d.no} · {baht(d.total - d.paid)}</option>)}</select>}
                <button className="btn sm" disabled={!s.docNo && !open.length}>ยืนยันรับเงิน</button></form>
              <form action={verifySlipAction}><input type="hidden" name="slip" value={s.id} /><input type="hidden" name="accept" value="0" /><button className="btn r sm">ปฏิเสธ</button></form>
              {s.hasImage && <form action={reprocessSlipAction}><input type="hidden" name="slip" value={s.id} /><SubmitButton className="btn o sm" pending="กำลังอ่าน…">อ่านใหม่</SubmitButton></form>}
            </div>
          </div>); })}
        {!slips.length && <div className="cb mut">ไม่มีสลิปรอตรวจ · วันนี้อนุมัติอัตโนมัติแล้ว {autoToday} ใบ</div>}
        <form action={uploadSlipAction} className="f cb" style={{ borderTop: "1px solid #eef0f4" }}>
          <span className="sm mut">อัปโหลดสลิป:</span>
          <select name="client" style={{ maxWidth: 200 }}><option value="">— ไม่ทราบลูกค้า —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required className="inp" style={{ maxWidth: 260 }} />
          <SubmitButton className="btn o sm" pending="กำลังอ่านสลิป…">ตรวจสลิป</SubmitButton>
        </form>
        <form action={addSlipAction} className="f cb"><span className="sm mut">บันทึกยอดมือ (ไม่มีรูป):</span><select name="doc" style={{ maxWidth: 180 }}>{docs.filter((d) => d.status === "issued").map((d) => <option key={d.no}>{d.no}</option>)}</select><input className="inp" name="amount" type="number" step="0.01" placeholder="ยอด (บาท)" style={{ maxWidth: 140 }} /><button className="btn o sm">เพิ่ม</button></form>
      </Card>
      <div className="row">
        <Card className="main" title="เอกสารทั้งหมด" right={<span className="sm mut">append-only · ยกเลิกแทนการลบ</span>} pad={false}><div className="tw"><table><thead><tr><th>เลขที่</th><th>ประเภท</th><th>ลูกค้า</th><th>ยอด</th><th>ชำระ</th><th>สถานะ</th><th /></tr></thead><tbody>
          {docs.map((d) => <tr key={d.no}><td className="mono">{d.no}{d.revision > 1 && <span className="sm mut"> r{d.revision}</span>}</td><td>{DOC_LABEL[d.type]}</td><td>{d.clientName}</td><td>{baht(d.total)}</td><td>{baht(d.paid)}</td><td><span className={"chip " + TONE[d.status]}>{d.status}</span></td>
            <td>{d.status === "issued" && <form action={voidDocAction}><input type="hidden" name="doc" value={d.no} /><button className="btn r sm">ยกเลิก</button></form>}</td></tr>)}
        </tbody></table></div></Card>
        <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title="ออกเอกสารใหม่"><form action={issueDocAction} className="list">
            <select name="type">{(["QT", "INV", "RN", "CN"] as const).map((t) => <option key={t} value={t}>{DOC_LABEL[t]} ({t})</option>)}</select>
            <select name="client">{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select name="job"><option value="">— ไม่ผูกงาน —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.stage})</option>)}</select>
            <input className="inp" name="total" type="number" step="0.01" placeholder="ยอดรวม (บาท)" required />
            <button className="btn">ออกเอกสาร</button><div className="sm mut">เลขที่ออกต่อเนื่องแยกประเภท/เดือน · ใบเสนอราคาหมดอายุ 15 วัน</div>
          </form></Card>
          <Card title="แคตตาล็อกราคาเดียว" pad={false}><div className="tw"><table><tbody>{catalog.map((i) => <tr key={i.code}><td><div>{i.name}</div><div className="sm mut mono">{i.code}{i.recurring ? " · รายปี" : ""}</div></td><td style={{ whiteSpace: "nowrap" }}>{baht(i.price)}</td></tr>)}</tbody></table></div></Card>
        </div>
      </div>
    </div>
  </>);
}
