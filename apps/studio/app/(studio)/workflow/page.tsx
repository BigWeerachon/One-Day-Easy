import { requirePage } from "@/lib/auth";
import { listTasks, listEvents } from "@/lib/store";
import { retryTaskAction } from "@/lib/actions";
import { TRANSITIONS, STAGE_LABEL } from "@/lib/workflow";
import { Header, Card, Err } from "@/components/ui";
const T = { done: "c-g", running: "c-b", queued: "c-y", failed: "c-r", dead: "c-r" };
export default async function Workflow({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requirePage("work.view");
  const { err } = await searchParams;
  const [tasks, events] = await Promise.all([listTasks(), listEvents(undefined, 100)]);
  return (<>
    <Header crumb="ระบบ" title="Workflow อัตโนมัติ" />
    <div className="bd">
      <Err msg={err} />
      <Card title="คิวงาน (workflow_runs / tasks)" right={<span className="sm mut">retry 3 ครั้ง → dead-letter · idempotency key กันทำซ้ำ</span>} pad={false}><div className="tw"><table><thead><tr><th>งาน</th><th>idempotency key</th><th>ครั้งที่</th><th>สถานะ</th><th /></tr></thead><tbody>
        {tasks.map((t) => <tr key={t.id}><td>{t.name}{t.error && <div className="sm" style={{ color: "#c62828" }}>{t.error}</div>}</td><td className="mono sm">{t.idemKey}</td><td>{t.attempts}/3</td><td><span className={"chip " + T[t.status]}>{t.status}</span></td>
          <td>{(t.status === "dead" || t.status === "failed") && <form action={retryTaskAction}><input type="hidden" name="task" value={t.id} /><button className="btn o sm">ลองใหม่</button></form>}</td></tr>)}
      </tbody></table></div></Card>
      <Card title="ตารางการเปลี่ยนขั้น (N4)" pad={false}><div className="tw"><table><thead><tr><th>จาก</th><th>ไป</th><th>ใครสั่ง</th><th>เงื่อนไข</th></tr></thead><tbody>
        {TRANSITIONS.map((t, i) => <tr key={i}><td>{t.from === "*" ? "ทุกขั้น" : STAGE_LABEL[t.from]}</td><td>{STAGE_LABEL[t.to]}</td><td>{t.by === "human" ? "👤 คน" : t.by === "client" ? "ลูกค้า" : "ระบบ"}</td><td>{t.condition}</td></tr>)}
      </tbody></table><div className="note" style={{ margin: "14px 20px" }}>ห้ามข้ามขั้น · ระบบและฐานข้อมูลปฏิเสธการเปลี่ยนขั้นที่ไม่อยู่ในตารางนี้</div></div></Card>
      <Card title="Event log ล่าสุด" right={<span className="sm mut">{events.length} events</span>} pad={false}><div className="tw"><table><tbody>
        {events.map((e) => <tr key={e.id}><td className="mono sm">{e.name}</td><td className="sm">{e.jobId?.slice(-6) ?? "—"}</td><td className="sm">{e.actor} ({e.source})</td><td className="sm mut">{JSON.stringify(e.before ?? "")} → {JSON.stringify(e.after ?? "")}</td><td className="sm mut">{new Date(e.at).toLocaleString("th-TH")}</td></tr>)}
        {!events.length && <tr><td className="mut">ยังไม่มี event</td></tr>}
      </tbody></table></div></Card>
    </div>
  </>);
}
