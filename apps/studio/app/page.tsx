import Link from "next/link";
import { listJobs, listSlips, listTasks, listSites, listDocs, listClients, avgEditRounds } from "@/lib/store";
import { STAGE_LABEL, type Stage } from "@/lib/workflow";
import { baht } from "@/lib/money";
import { Header, Card, Kpi } from "@/components/ui";

export default async function Today({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "board" ? 1 : 0;
  const [jobs, slips, tasks, sites, docs, clients, rounds] = await Promise.all([listJobs(), listSlips(), listTasks(), listSites(), listDocs(), listClients(), avgEditRounds()]);
  const pkg = Object.fromEntries(clients.map((c) => [c.id, c.pkg]));
  const sla = (h: number | null) => h ?? 999;
  const queue = [
    ...jobs.filter((j) => j.stage === "template").map((j) => ({ t: j.siteId ? "ปรับเนื้อหาก่อนส่งลูกค้า" : "เลือกเทมเพลต", sla: sla(j.slaHours), d: `${j.title} · ${j.siteId ? `ร่าง ${j.template} · ตรวจผ่าน ${j.checksPassed}/6` : "ข้อมูลครบจากฟอร์มลูกค้า"}`, href: `/builder?job=${j.id}`, cta: j.siteId ? "เปิดปรับแก้" : "เลือกเทมเพลต" })),
    ...slips.filter((s) => s.amount !== s.due).map((s) => ({ t: "สลิปไม่ตรงยอด", sla: -1, d: `${s.clientName} · ${s.docNo} · สลิป ${baht(s.amount)} ยอดค้าง ${baht(s.due)}`, href: "/finance", cta: "ตรวจ" })),
    ...jobs.filter((j) => j.stage === "client_review" && sla(j.slaHours) < 0).map((j) => ({ t: "ลูกค้าไม่ตอบเกินกำหนด", sla: sla(j.slaHours), d: `${j.title} · เกินมา ${-sla(j.slaHours)} ชม.`, href: `/clients/${j.clientId}`, cta: "เปิดโปรไฟล์" })),
    ...tasks.filter((t) => t.status === "dead").map((t) => ({ t: "งานอัตโนมัติล้มเหลว", sla: -99, d: `${t.name} · ${t.error} (dead-letter)`, href: "/workflow", cta: "ดูงาน" })),
  ].sort((a, b) => a.sla - b.sla);
  const cols: Stage[] = ["new_chat", "intake", "template", "client_review", "invoice", "payment", "online", "paused"];
  const live = jobs.filter((j) => j.stage === "online" || j.stage === "care").length;
  const revenue = docs.filter((d) => d.type === "RC").reduce((a, d) => a + d.total, 0);
  return (<>
    <Header crumb="ภาพรวมงาน · คนทำเฉพาะงานที่ต้องตัดสินใจ" title="งานวันนี้"><Link className="btn" href="/clients">+ ลูกค้าใหม่</Link></Header>
    <div className="bd">
      <div className="kpis">
        <Kpi label="งานที่กำลังทำ" value={jobs.filter((j) => !["online", "care"].includes(j.stage)).length} sub={`ออนไลน์แล้ว ${live} เว็บ`} />
        <Kpi label="รอบแก้ต่อเว็บ" value={rounds.toFixed(1)} sub="เป้า ≤ 2" />
        <Kpi label="สลิปรอตรวจ" value={slips.length} />
        <Kpi label="รายได้ต่อเว็บ" value={baht(live ? revenue / live : 0)} sub="จากใบเสร็จ ÷ เว็บออนไลน์" />
      </div>
      {sites.filter((s) => s.status === "down").map((s) => <div key={s.id} className="alert a-r"><span><b>เว็บล่ม</b> <span className="mut">{s.domain}</span></span><Link href="/workflow">ดูเหตุการณ์</Link></div>)}
      <div className="tabs" role="tablist" style={{ alignSelf: "flex-start" }}>
        <Link role="tab" aria-selected={!tab} className={"tab" + (!tab ? " on" : "")} href="/">คิวที่ต้องมีคนทำ</Link>
        <Link role="tab" aria-selected={!!tab} className={"tab" + (tab ? " on" : "")} href="/?tab=board">การ์ดงานทั้งหมด</Link>
      </div>
      {!tab ? (
        <div className="row">
          <Card className="main" title="คิวที่ต้องมีคนทำ" right={<span className="sm mut">{queue.length} งาน · เรียงตามความเร่ง</span>} pad={false}>
            {queue.length === 0 && <div className="cb mut">ไม่มีงานค้าง 🎉</div>}
            {queue.map((q, i) => (
              <div className="qi" key={i}><div style={{ flex: "1 1 320px" }}><div className="f"><b>{q.t}</b><span className={"chip " + (q.sla < 0 ? "c-r" : q.sla <= 2 ? "c-y" : "c-b")}>{q.sla < 0 ? "เกิน SLA" : q.sla >= 999 ? "ไม่มี SLA" : `เหลือ ${q.sla} ชม.`}</span></div><div className="sm mut">{q.d}</div></div><Link className="btn o" href={q.href}>{q.cta}</Link></div>
            ))}
          </Card>
          <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <Card title="ระบบกำลังทำให้อยู่" right={<span className="chip c-p">⚙ อัตโนมัติ</span>}><div className="list">
              {tasks.filter((t) => t.status !== "dead").slice(0, 6).map((t) => <div key={t.id} className="f" style={{ justifyContent: "space-between" }}><span>{t.name}</span><span className="sm mut">{t.status}</span></div>)}
              {!tasks.length && <span className="sm mut">ไม่มีงานในคิว</span>}
            </div></Card>
            <Card title="สถานะระบบอัตโนมัติ"><div className="f">
              <span className="chip c-g">● ฐานข้อมูลเชื่อมต่อแล้ว</span><span className="chip c-g">● คิวค้าง {tasks.filter((t) => t.status === "queued").length}</span>
              {tasks.some((t) => t.status === "dead") && <span className="chip c-r">● dead-letter {tasks.filter((t) => t.status === "dead").length} งาน</span>}
            </div></Card>
          </div>
        </div>
      ) : (
        <Card title="การ์ดงานทั้งหมด"><div className="kb">
          {cols.map((st) => { const js = jobs.filter((j) => j.stage === st); return (
            <div className="col" key={st}><div className="f" style={{ justifyContent: "space-between", fontWeight: 500 }}><span>{STAGE_LABEL[st]}</span><span className="mut">{js.length}</span></div>
              {js.map((j) => <Link key={j.id} href={`/clients/${j.clientId}`} className="card" style={{ padding: "12px 14px", textDecoration: "none" }}><div style={{ fontWeight: 600 }}>{j.title}</div><div className="sm mut">{pkg[j.clientId]} · {j.assignee}</div>{sla(j.slaHours) < 0 && <span className="chip c-r" style={{ marginTop: 6 }}>ค้าง</span>}</Link>)}
            </div>); })}
        </div></Card>
      )}
    </div>
  </>);
}
