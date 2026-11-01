import Link from "next/link";
import { db } from "@/lib/store";
import { addClientAction } from "@/lib/actions";
import { Header, Card, Kpi, Err, ago, Av } from "@/components/ui";
const ST = { lead: ["Lead", "c-y"], active: ["กำลังทำ", "c-b"], care: ["ดูแลต่อ", "c-g"] } as const;
const CH = { LINE: "#06c755", Email: "#e5373a", Web: "#141a2b", FB: "#1877f2" };
export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; err?: string }> }) {
  const { q = "", s = "", err } = await searchParams;
  const rows = db.clients.filter((c) => (!s || c.status === s) && (!q || [c.name, c.contact, c.kind].join(" ").toLowerCase().includes(q.toLowerCase())));
  const f = (k: string, l: string) => <Link className={"btn " + (s === k ? "" : "o")} href={`/clients?s=${k}&q=${encodeURIComponent(q)}`}>{l}</Link>;
  return (<>
    <Header crumb="ลูกค้า" title="ลูกค้าทั้งหมด" />
    <div className="bd">
      <Err msg={err} />
      <Card title="+ เพิ่มลูกค้า"><form action={addClientAction} className="f">
        <input className="inp" name="name" placeholder="ชื่อร้าน *" style={{ maxWidth: 220 }} required />
        <input className="inp" name="kind" placeholder="ประเภท เช่น ร้านอาหาร" style={{ maxWidth: 180 }} />
        <input className="inp" name="contact" placeholder="ผู้ติดต่อ" style={{ maxWidth: 160 }} />
        <select name="channel" style={{ maxWidth: 120 }}><option>LINE</option><option>Email</option><option>Web</option><option>FB</option></select>
        <button className="btn">เพิ่มลูกค้า</button>
      </form></Card>
      <section className="card">
        <div className="ch"><form className="f" style={{ flex: 1 }}><input className="inp" name="q" defaultValue={q} style={{ maxWidth: 330 }} aria-label="ค้นหาลูกค้า" placeholder="ค้นหาชื่อร้าน, ผู้ติดต่อ, ประเภท..." /><input type="hidden" name="s" value={s} />{f("", "ทั้งหมด")}{f("lead", "Lead")}{f("active", "กำลังทำ")}{f("care", "ดูแลต่อ")}</form><span className="sm mut">แสดง {rows.length} จาก {db.clients.length} ราย</span></div>
        <div className="tw"><table><thead><tr><th>ลูกค้า</th><th>สถานะ</th><th>แพ็กเกจ</th><th>ช่องทาง / ผู้ติดต่อ</th><th>ติดต่อล่าสุด</th><th /></tr></thead><tbody>
          {rows.map((c) => (<tr key={c.id}>
            <td><div className="f"><Av c={c.color} n={c.name} /><div><div style={{ fontWeight: 600 }}>{c.name}</div><div className="sm mut">{c.kind}</div></div></div></td>
            <td><span className={"chip " + ST[c.status][1]}>{ST[c.status][0]}</span></td><td>{c.pkg}</td>
            <td><span className="f"><span className="av" style={{ background: CH[c.channel], width: 20, height: 20, borderRadius: 5, fontSize: 10 }}>{c.channel[0]}</span>{c.contact}</span></td>
            <td>{ago(c.lastContactMin)}</td><td><Link className="btn o" href={`/clients/${c.id}`}>เปิด</Link></td>
          </tr>))}
          {rows.length === 0 && <tr><td colSpan={6} className="mut">ไม่พบลูกค้า</td></tr>}
        </tbody></table></div>
      </section>
      <div className="kpis">
        <Kpi label="Lead" value={db.clients.filter((c) => c.status === "lead").length} />
        <Kpi label="ลูกค้าแพ็กดูแลรายปี" value={db.clients.filter((c) => c.status === "care").length} sub="ต่ออายุ 92%" tone="#0a7a3a" />
        <Kpi label="ข้อมูลไม่ครบ" value={db.clients.filter((c) => !c.taxId).length} sub="ขาดเลขผู้เสียภาษี" tone="#c62828" />
      </div>
    </div>
  </>);
}
