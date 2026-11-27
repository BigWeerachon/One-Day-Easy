import * as P from "@/lib/portal";
import { listLeads } from "@/lib/leads";
import { leadStatusAction } from "@/lib/portal-actions";
import { LEAD_STATUS } from "@ode/blocks/leads";
import SubmitButton from "@/components/SubmitButton";
export const dynamic = "force-dynamic";
export const metadata = { title: "ข้อเสนอขายรถ", robots: { index: false } };

const thb = (n: number) => n.toLocaleString("th-TH");
const ICON: Record<string, string> = { new: "●", contacted: "☎", inspecting: "🔍", bought: "✓", declined: "✕" };

export default async function Leads({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { token } = await params; const sp = await searchParams;
  const r = await P.resolvePortal(token);
  const shell = (body: React.ReactNode) => (
    <div className="pt-wrap"><header className="pt-top"><div className="pt-logo">One Day <span>Easy</span></div><span className="pt-chip">ข้อเสนอขายรถ</span></header>
      <div className="pt-bd">{body}</div></div>);
  if (r.status !== "ok") return shell(<div className="pt-card"><h1 className="pt-h">ลิงก์นี้ใช้ไม่ได้แล้ว</h1><p className="pt-sm pt-mut" style={{ marginTop: 6 }}>พิมพ์ &quot;ดูข้อเสนอ&quot; ในแชท LINE ของร้านเพื่อรับลิงก์ใหม่</p></div>);
  const leads = await listLeads(r.ctx.clientId);
  return shell(<>
    <h1 className="pt-h">ข้อเสนอขายรถ ({leads.length})</h1>
    {sp.err && <div className="pt-err" role="alert">{sp.err}</div>}
    {sp.ok && <div className="pt-note" role="status">บันทึกแล้ว</div>}
    {leads.length === 0 && <div className="pt-card"><p className="pt-sm pt-mut">ยังไม่มีคนส่งข้อมูลรถมา เมื่อมีคนกรอกฟอร์ม &quot;ขายรถให้เรา&quot; บนเว็บ ระบบจะแจ้งทาง LINE ทันที</p></div>}
    {leads.map((l) => (
      <div className="pt-card" key={l.id} id={`l${l.id}`}>
        <div className="pt-sm pt-mut">#{l.id} · {new Date(l.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · <span>{ICON[l.status]} {LEAD_STATUS[l.status]}</span></div>
        <h2 className="pt-h" style={{ fontSize: 18 }}>{l.data.brand} {l.data.model} {l.data.year}</h2>
        <p className="pt-sm">ไมล์ {thb(l.data.mileage)} กม. · เกียร์{l.data.gear}{l.data.color ? ` · สี${l.data.color}` : ""} · {l.data.province}
          {l.data.asking != null && <> · ต้องการ ฿{thb(l.data.asking)}</>}</p>
        {l.data.note && <p className="pt-sm pt-mut">{l.data.note}</p>}
        <p className="pt-sm"><b>{l.name}</b> · <a href={`tel:${l.phone}`} style={{ display: "inline-block", minHeight: 44, lineHeight: "44px" }}>โทร {l.phone}</a></p>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 8 }}>
          {l.photos.map((f, i) => <a key={f} href={`/p/${token}/leads/file/${f}`} target="_blank" rel="noreferrer"><img src={`/p/${token}/leads/file/${f}`} alt={`รูปรถที่ ${i + 1}`} width={120} height={90} loading="lazy" style={{ objectFit: "cover", borderRadius: 8 }} /></a>)}
        </div>
        <form action={leadStatusAction} style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input type="hidden" name="t" value={token} /><input type="hidden" name="id" value={l.id} />
          <label className="pt-sm">สถานะ<select name="status" defaultValue={l.status} className="pt-in" style={{ minHeight: 44, display: "block", width: "100%" }}>
            {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="pt-sm">บันทึก (ไม่บังคับ)<input name="note" defaultValue={l.note ?? ""} maxLength={500} className="pt-in" style={{ minHeight: 44, display: "block", width: "100%" }} /></label>
          <SubmitButton className="pt-btn o" pending="กำลังบันทึก…">บันทึกสถานะ</SubmitButton>
        </form>
      </div>
    ))}
  </>);
}
