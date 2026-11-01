import { requirePage, listStaff } from "@/lib/auth";
import { addStaffAction, updateStaffAction } from "@/lib/auth-actions";
import { ROLES, ROLE_LABEL, PERMS, grantsOf } from "@/lib/permissions";
import { Err } from "@/components/ui";
import { Header, Card } from "@/components/ui";
const ENV = [["DATABASE_URL", "Supabase Postgres (server เท่านั้น)"], ["LINE_CHANNEL_SECRET", "ตรวจลายเซ็น webhook /api/line/webhook"], ["LINE_CHANNEL_ACCESS_TOKEN", "ส่งข้อความ push (long-lived)"], ["CRON_SECRET", "ป้องกัน /api/cron/line (ลองส่งซ้ำ)"], ["ANTHROPIC_API_KEY", "Claude: สรุปแชท · แก้เว็บ · อ่านสลิป"], ["SHOP_RECEIVER_ACCOUNTS", "บัญชีร้านสำหรับตรวจสลิป"], ["SHOP_RECEIVER_NAMES", "ชื่อบัญชีร้านสำหรับตรวจสลิป"]];
export default async function Settings({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requirePage("team.manage");
  const { err } = await searchParams;
  const team = await listStaff();
  return (<>
    <Header crumb="ตั้งค่า" title="ตั้งค่า & ระบบ" />
    <div className="bd"><div className="row">
      <div className="main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Err msg={err} />
        <Card title="ทีม" right={<span className="sm mut">{team.filter((t) => t.active).length} คนใช้งานอยู่</span>} pad={false}><div className="tw"><table>
          <thead><tr><th>สมาชิก</th><th>บทบาท</th><th>สถานะ</th><th>รีเซ็ตรหัสผ่าน</th></tr></thead><tbody>
          {team.map((t) => (<tr key={t.id} style={{ opacity: t.active ? 1 : .5 }}>
            <td><b>{t.name}</b>{t.id === me.id && <span className="chip" style={{ marginLeft: 6 }}>คุณ</span>}<div className="sm mut">{t.email}</div></td>
            <td><form action={updateStaffAction} className="f"><input type="hidden" name="id" value={t.id} />
              <select name="role" defaultValue={t.role} disabled={t.id === me.id} style={{ width: 130 }} aria-label={`บทบาทของ ${t.name}`}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
              {t.id !== me.id && <button className="btn o sm">เปลี่ยน</button>}</form></td>
            <td>{t.id === me.id ? <span className="chip c-g">ใช้งาน</span> : <form action={updateStaffAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="active" value={t.active ? "0" : "1"} /><button className={"btn sm " + (t.active ? "r" : "o")}>{t.active ? "ปิดบัญชี" : "เปิดใช้"}</button></form>}
              {t.mustChangePassword && <div className="sm mut">รอตั้งรหัสใหม่</div>}</td>
            <td>{t.id !== me.id && <form action={updateStaffAction} className="f"><input type="hidden" name="id" value={t.id} /><input className="inp" name="reset" type="text" placeholder="รหัสชั่วคราว" minLength={10} required style={{ width: 150 }} autoComplete="off" /><button className="btn o sm">รีเซ็ต</button></form>}</td>
          </tr>))}
        </tbody></table></div></Card>
        <Card title="+ เพิ่มสมาชิก"><form action={addStaffAction} className="f">
          <input className="inp" name="name" placeholder="ชื่อ" required style={{ maxWidth: 160 }} />
          <input className="inp" name="email" type="email" placeholder="อีเมล" required style={{ maxWidth: 220 }} />
          <select name="role" defaultValue="builder" style={{ maxWidth: 140 }}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          <input className="inp" name="password" type="text" placeholder="รหัสผ่านชั่วคราว (≥10)" minLength={10} required style={{ maxWidth: 200 }} autoComplete="off" />
          <button className="btn">เพิ่ม</button>
          <div className="sm mut" style={{ width: "100%" }}>ส่งรหัสชั่วคราวให้สมาชิกเอง · ระบบบังคับให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก</div>
        </form></Card>
        <Card title="สิทธิ์ตามบทบาท" pad={false}><div className="tw"><table><thead><tr><th>สิทธิ์</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead><tbody>
          {(Object.keys(PERMS) as (keyof typeof PERMS)[]).map((p) => <tr key={p}><td className="sm">{PERMS[p]}</td>{ROLES.map((r) => <td key={r}>{grantsOf(r).includes(p) ? "✓" : "—"}</td>)}</tr>)}
        </tbody></table></div></Card>
      </div>
      <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Card title="การเชื่อมต่อ"><div className="list">{ENV.map(([k, d]) => <div key={k}><span className="mono sm">{k}</span> <span className={"chip " + (process.env[k] ? "c-g" : "c-y")}>{process.env[k] ? "ตั้งแล้ว" : "ยังไม่ตั้ง"}</span><div className="sm mut">{d}</div></div>)}</div></Card>
        <Card title="ค่า SLA & นโยบาย"><div className="list sm"><div>SLA ส่งร่างให้ลูกค้า: 8 ชม.</div><div>เตือนลูกค้าไม่ตอบ: 24 / 48 / 72 ชม.</div><div>รอบแก้ฟรี: 2 รอบ (เกินคิด EDIT-X)</div><div>ใบเสนอราคาหมดอายุ: 15 วัน</div><div>เพดาน token ต่อเว็บ: 40k</div></div></Card>
      </div>
    </div></div>
  </>);
}
