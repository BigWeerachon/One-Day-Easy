import { requireStaff } from "@/lib/auth";
import { changePasswordAction } from "@/lib/auth-actions";
import { ROLE_LABEL, PERMS, grantsOf } from "@/lib/permissions";
import { Header, Card, Err } from "@/components/ui";
import { one } from "@/lib/db";
import { GROUPS, groupsFor } from "@/lib/notify";
import { saveEmailPrefsAction } from "@/lib/notify-actions";
export default async function Account({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; first?: string }> }) {
  const me = await requireStaff();
  const { err, ok, first } = await searchParams;
  const prefs = (await one<{ p: Record<string, boolean> }>(`select email_prefs p from staff where id = $1`, [me.id]))?.p ?? {};
  return (<>
    <Header crumb="บัญชีของฉัน" title={me.name} />
    <div className="bd"><div className="row">
      <Card className="main" title="เปลี่ยนรหัสผ่าน">
        {(first || me.mustChangePassword) && <div className="note" style={{ marginBottom: 12 }}>กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</div>}
        <Err msg={err} />{ok && <div className="chip c-g" style={{ marginBottom: 12 }}>เปลี่ยนรหัสผ่านแล้ว · ออกจากระบบอุปกรณ์อื่นแล้ว</div>}
        <form action={changePasswordAction} className="list" style={{ maxWidth: 360 }}>
          <label className="sm">รหัสผ่านปัจจุบัน<input className="inp" name="current" type="password" autoComplete="current-password" required /></label>
          <label className="sm">รหัสผ่านใหม่ (≥ 10 ตัว มีตัวอักษรและตัวเลข)<input className="inp" name="next" type="password" autoComplete="new-password" required minLength={10} /></label>
          <label className="sm">ยืนยันรหัสผ่านใหม่<input className="inp" name="confirm" type="password" autoComplete="new-password" required /></label>
          <div><button className="btn">บันทึก</button></div>
        </form>
      </Card>
      <Card className="side" title="อีเมลแจ้งเตือน" right={<span className="sm mut">ส่งถึง {me.email}</span>}>
        {ok === "prefs" && <div className="chip c-g" style={{ marginBottom: 10 }}>บันทึกแล้ว</div>}
        <form action={saveEmailPrefsAction} className="list" style={{ gap: 8 }}>
          {groupsFor(me.role).map((g) => <label key={g} className="f sm"><input type="checkbox" name={g} defaultChecked={prefs[g] !== false} style={{ width: "auto" }} /> {GROUPS[g]}</label>)}
          <div><button className="btn o sm">บันทึก</button></div>
        </form>
      </Card>
      <Card className="side" title="สิทธิ์ของฉัน" right={<span className="chip c-b">{ROLE_LABEL[me.role]}</span>}>
        <div className="list sm">{grantsOf(me.role).map((p) => <div key={p}>✓ {PERMS[p]}</div>)}</div>
        <div className="sm mut" style={{ marginTop: 10 }}>{me.email}</div>
      </Card>
    </div></div>
  </>);
}
