import Link from "next/link";
import { db, clientOf } from "@/lib/store";
import { STAGE_LABEL, type Stage } from "@/lib/workflow";
import { baht } from "@/lib/money";
import { Header, Card, Kpi } from "@/components/ui";

export default async function Today({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "board" ? 1 : 0;
  const slipIssues = db.slips.filter((s) => s.status === "pending").map((s) => ({ s, d: db.docs.find((d) => d.no === s.docNo)! })).filter(({ s, d }) => s.amount !== d.total - d.paid);
  const queue = [
    ...db.jobs.filter((j) => j.stage === "template").map((j) => ({ t: j.template ? "ปรับเนื้อหาก่อนส่งลูกค้า" : "เลือกเทมเพลต", sla: j.slaHours, d: `${j.title} · ${j.template ? `ร่าง ${j.template} · ตรวจผ่าน ${j.checksPassed}/6` : "ข้อมูลครบจากฟอร์มลูกค้า"}`, href: `/builder?job=${j.id}`, cta: j.template ? "เปิดปรับแก้" : "เลือกเทมเพลต" })),
    ...slipIssues.map(({ s, d }) => ({ t: "สลิปไม่ตรงยอด", sla: -1, d: `${clientOf(d.clientId)?.name} · ${d.no} · สลิป ${baht(s.amount)} ยอดค้าง ${baht(d.total - d.paid)}`, href: "/finance", cta: "ตรวจ" })),
    ...db.jobs.filter((j) => j.stage === "client_review" && j.slaHours < 0).map((j) => ({ t: "ลูกค้าไม่ตอบ 72 ชม.", sla: j.slaHours, d: `${j.title} · ระบบเตือนทาง LINE แล้ว 2 ครั้ง`, href: `/clients/${j.clientId}`, cta: "เปิดโปรไฟล์" })),
    ...db.tasks.filter((t) => t.status === "dead").map((t) => ({ t: "งานอัตโนมัติล้มเหลว", sla: -99, d: `${t.name} · ${t.error} (dead-letter)`, href: "/workflow", cta: "ดูงาน" })),
  ].sort((a, b) => a.sla - b.sla);
  const down = db.sites.filter((s) => s.status === "down");
  const cols: Stage[] = ["new_chat", "intake", "template", "client_review", "payment", "online"];
  const live = db.jobs.filter((j) => j.stage === "online" || j.stage === "care").length;
  const revenue = db.docs.filter((d) => d.type === "RC").reduce((a, d) => a + d.total, 0);
  const avgRounds = db.jobs.reduce((a, j) => a + j.editRounds, 0) / db.jobs.length;
  return (<>
    <Header crumb="ภาพรวมงาน · คนทำเฉพาะงานที่ต้องตัดสินใจ" title="งานวันนี้"><Link className="btn" href="/builder">+ สร้างเว็บ</Link></Header>
    <div className="bd">
      <div className="kpis">
        <Kpi label="แชท → ออนไลน์ (เฉลี่ย)" value="5.2 ชม." sub="เป้า < 8 ชม." />
        <Kpi label="Token ต่อเว็บ" value="18k" sub="เพดาน 40k" />
        <Kpi label="รอบแก้ต่อเว็บ" value={avgRounds.toFixed(1)} sub="เป้า ≤ 2" />
        <Kpi label="ต่ออายุรายปี" value="92%" sub="+3% เดือนนี้" />
        <Kpi label="รายได้ต่อเว็บ" value={baht(live ? revenue / live : 0)} sub="ต้นทุน AI ~35฿" />
      </div>
      {down.map((s) => <div key={s.id} className="alert a-r"><span><b>เว็บล่ม</b> <span className="mut">{s.domain} ตอบช้า &gt; 5 วิ</span></span><Link href="/workflow">ดูเหตุการณ์</Link></div>)}
      <div className="alert a-y"><span><b>โดเมนใกล้หมดอายุ</b> <span className="mut">mokahouse.com หมดใน 12 วัน</span></span><Link href="/finance">ต่ออายุ</Link></div>
      <div className="tabs" role="tablist" style={{ alignSelf: "flex-start" }}>
        <Link role="tab" aria-selected={!tab} className={"tab" + (!tab ? " on" : "")} href="/">คิวที่ต้องมีคนทำ</Link>
        <Link role="tab" aria-selected={!!tab} className={"tab" + (tab ? " on" : "")} href="/?tab=board">การ์ดงานทั้งหมด</Link>
      </div>
      {!tab ? (
        <div className="row">
          <Card className="main" title="คิวที่ต้องมีคนทำ" right={<span className="sm mut">{queue.length} งาน · เรียงตามความเร่ง</span>} pad={false}>
            {queue.length === 0 && <div className="cb mut">ไม่มีงานค้าง 🎉</div>}
            {queue.map((q, i) => (
              <div className="qi" key={i}><div style={{ flex: "1 1 320px" }}><div className="f"><b>{q.t}</b><span className={"chip " + (q.sla < 0 ? "c-r" : q.sla <= 2 ? "c-y" : "c-b")}>{q.sla < 0 ? "เกิน SLA" : `เหลือ ${q.sla} ชม.`}</span></div><div className="sm mut">{q.d}</div></div><Link className="btn o" href={q.href}>{q.cta}</Link></div>
            ))}
          </Card>
          <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <Card title="ระบบกำลังทำให้อยู่" right={<span className="chip c-p">⚙ อัตโนมัติ</span>}><div className="list">
              {db.tasks.filter((t) => t.status !== "dead").map((t) => <div key={t.id} className="f" style={{ justifyContent: "space-between" }}><span>{t.name}</span><span className="sm mut">{t.status}</span></div>)}
            </div></Card>
            <Card title="สถานะระบบอัตโนมัติ"><div className="f">
              <span className="chip c-g">● คิวงานปกติ · ค้าง {db.tasks.filter((t) => t.status === "queued").length}</span><span className="chip c-g">● LINE webhook</span><span className="chip c-g">● Claude API ปกติ</span>
              {db.tasks.some((t) => t.status === "dead") && <span className="chip c-r">● dead-letter {db.tasks.filter((t) => t.status === "dead").length} งาน</span>}
            </div></Card>
          </div>
        </div>
      ) : (
        <Card title="การ์ดงานทั้งหมด"><div className="kb">
          {cols.map((st) => { const js = db.jobs.filter((j) => j.stage === st); return (
            <div className="col" key={st}><div className="f" style={{ justifyContent: "space-between", fontWeight: 500 }}><span>{STAGE_LABEL[st]}</span><span className="mut">{js.length}</span></div>
              {js.map((j) => <Link key={j.id} href={`/clients/${j.clientId}`} className="card" style={{ padding: "12px 14px", textDecoration: "none" }}><div style={{ fontWeight: 600 }}>{j.title}</div><div className="sm mut">{clientOf(j.clientId)?.pkg} · {j.assignee}</div>{j.slaHours < 0 && <span className="chip c-r" style={{ marginTop: 6 }}>ค้าง</span>}</Link>)}
            </div>); })}
        </div></Card>
      )}
    </div>
  </>);
}
