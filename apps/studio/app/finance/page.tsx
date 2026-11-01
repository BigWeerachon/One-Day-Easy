import { db, clientOf } from "@/lib/store";
import { issueDocAction, verifySlipAction, addSlipAction, voidDocAction } from "@/lib/actions";
import { baht, DOC_LABEL } from "@/lib/money";
import { Header, Card, Kpi, Err } from "@/components/ui";
const TONE = { issued: "c-b", paid: "c-g", voided: "", expired: "c-y", draft: "" };
export default async function Finance({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const outstanding = db.docs.filter((d) => d.type === "INV" && d.status === "issued").reduce((a, d) => a + d.total - d.paid, 0);
  const received = db.docs.filter((d) => d.type === "RC").reduce((a, d) => a + d.total, 0);
  return (<>
    <Header crumb="แคตตาล็อก → เอกสาร → ชำระ → กระทบยอด" title="การเงิน" />
    <div className="bd">
      <Err msg={err} />
      <div className="kpis"><Kpi label="ยอดค้างชำระ" value={baht(outstanding)} /><Kpi label="รับแล้ว (ใบเสร็จ)" value={baht(received)} tone="#0a7a3a" /><Kpi label="สลิปรอตรวจ" value={db.slips.filter((s) => s.status === "pending").length} /></div>
      <Card title="สลิปรอตรวจ" right={<span className="sm mut">ยอดต้องตรงทุกสตางค์ · คนยืนยันเมื่อไม่ตรง</span>} pad={false}>
        {db.slips.filter((s) => s.status === "pending").map((s) => { const d = db.docs.find((x) => x.no === s.docNo)!; const due = d.total - d.paid; const match = s.amount === due; return (
          <div key={s.id} className="qi"><div style={{ flex: 1 }}><div className="f"><b>{clientOf(d.clientId)?.name} · {d.no}</b><span className={"chip " + (match ? "c-g" : "c-r")}>{match ? "ยอดตรง" : "ไม่ตรงยอด"}</span></div><div className="sm mut">สลิป {baht(s.amount)} · ยอดค้าง {baht(due)}</div></div>
            <form action={verifySlipAction}><input type="hidden" name="slip" value={s.id} /><input type="hidden" name="accept" value="1" /><button className="btn sm">ยืนยัน{match ? "" : " (ชำระบางส่วน)"}</button></form>
            <form action={verifySlipAction}><input type="hidden" name="slip" value={s.id} /><input type="hidden" name="accept" value="0" /><button className="btn r sm">ปฏิเสธ</button></form></div>); })}
        {!db.slips.some((s) => s.status === "pending") && <div className="cb mut">ไม่มีสลิปรอตรวจ</div>}
        <form action={addSlipAction} className="f cb"><span className="sm mut">บันทึกสลิปใหม่:</span><select name="doc" style={{ maxWidth: 180 }}>{db.docs.filter((d) => d.status === "issued").map((d) => <option key={d.no}>{d.no}</option>)}</select><input className="inp" name="amount" type="number" step="0.01" placeholder="ยอด (บาท)" style={{ maxWidth: 140 }} /><button className="btn o sm">เพิ่มสลิป</button></form>
      </Card>
      <div className="row">
        <Card className="main" title="เอกสารทั้งหมด" right={<span className="sm mut">append-only · ยกเลิกแทนการลบ</span>} pad={false}><div className="tw"><table><thead><tr><th>เลขที่</th><th>ประเภท</th><th>ลูกค้า</th><th>ยอด</th><th>ชำระ</th><th>สถานะ</th><th /></tr></thead><tbody>
          {db.docs.map((d) => <tr key={d.no}><td className="mono">{d.no}{d.revision > 1 && <span className="sm mut"> r{d.revision}</span>}</td><td>{DOC_LABEL[d.type]}</td><td>{clientOf(d.clientId)?.name}</td><td>{baht(d.total)}</td><td>{baht(d.paid)}</td><td><span className={"chip " + TONE[d.status]}>{d.status}</span></td>
            <td>{d.status === "issued" && <form action={voidDocAction}><input type="hidden" name="doc" value={d.no} /><button className="btn r sm">ยกเลิก</button></form>}</td></tr>)}
        </tbody></table></div></Card>
        <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title="ออกเอกสารใหม่"><form action={issueDocAction} className="list">
            <select name="type">{(["QT", "INV", "RN", "CN"] as const).map((t) => <option key={t} value={t}>{DOC_LABEL[t]} ({t})</option>)}</select>
            <select name="client">{db.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select name="job"><option value="">— ไม่ผูกงาน —</option>{db.jobs.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.stage})</option>)}</select>
            <input className="inp" name="total" type="number" step="0.01" placeholder="ยอดรวม (บาท)" required />
            <button className="btn">ออกเอกสาร</button><div className="sm mut">เลขที่ออกต่อเนื่องแยกประเภท/เดือน · ใบเสนอราคาหมดอายุ 15 วัน</div>
          </form></Card>
          <Card title="แคตตาล็อกราคาเดียว" pad={false}><div className="tw"><table><tbody>{db.catalog.map((i) => <tr key={i.code}><td><div>{i.name}</div><div className="sm mut mono">{i.code}{i.recurring ? " · รายปี" : ""}</div></td><td style={{ whiteSpace: "nowrap" }}>{baht(i.price)}</td></tr>)}</tbody></table></div></Card>
        </div>
      </div>
    </div>
  </>);
}
