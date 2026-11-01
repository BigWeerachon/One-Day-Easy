import { Header, Card } from "@/components/ui";
const ENV = [["DATABASE_URL", "Supabase Postgres (server เท่านั้น)"], ["LINE_CHANNEL_SECRET", "ตรวจลายเซ็น webhook /api/line/webhook"], ["LINE_CHANNEL_ACCESS_TOKEN", "ส่งข้อความ push (long-lived)"], ["CRON_SECRET", "ป้องกัน /api/cron/line (ลองส่งซ้ำ)"], ["ANTHROPIC_API_KEY", "Claude → JSON patch"]];
const TEAM = [["Big", "Owner", "ทุกสิทธิ์"], ["มิ้น", "Builder", "สร้างเว็บ · ส่งลูกค้า"], ["ต้น", "Builder", "สร้างเว็บ · ตอบแชท"], ["ผู้ทำบัญชี", "Accountant", "ดูการเงินอย่างเดียว"]];
export default function Settings() {
  return (<>
    <Header crumb="ตั้งค่า" title="ตั้งค่า & ระบบ" />
    <div className="bd"><div className="row">
      <Card className="main" title="ทีม & สิทธิ์ (RLS)" pad={false}><div className="tw"><table><thead><tr><th>ชื่อ</th><th>บทบาท</th><th>สิทธิ์</th></tr></thead><tbody>{TEAM.map(([n, r, p]) => <tr key={n}><td>{n}</td><td><span className="chip c-b">{r}</span></td><td className="sm">{p}</td></tr>)}</tbody></table></div></Card>
      <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Card title="การเชื่อมต่อ"><div className="list">{ENV.map(([k, d]) => <div key={k}><span className="mono sm">{k}</span> <span className={"chip " + (process.env[k] ? "c-g" : "c-y")}>{process.env[k] ? "ตั้งแล้ว" : "ยังไม่ตั้ง"}</span><div className="sm mut">{d}</div></div>)}</div></Card>
        <Card title="ค่า SLA & นโยบาย"><div className="list sm"><div>SLA ส่งร่างให้ลูกค้า: 8 ชม.</div><div>เตือนลูกค้าไม่ตอบ: 24 / 48 / 72 ชม.</div><div>รอบแก้ฟรี: 2 รอบ (เกินคิด EDIT-X)</div><div>ใบเสนอราคาหมดอายุ: 15 วัน</div><div>เพดาน token ต่อเว็บ: 40k</div></div></Card>
      </div>
    </div></div>
  </>);
}
