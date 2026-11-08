import { requirePage } from "@/lib/auth";
import { one } from "@/lib/db";
import { setClientEmailAction } from "@/lib/notify-actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, clientNotes, listJobs, listSites, listDocs, listEvents, getIntake } from "@/lib/store";
import { addNoteAction, updateJobFlagsAction, extractIntakeAction, sendPortalLinkAction } from "@/lib/actions";
import { portalUrl } from "@/lib/portal";
import { aiConfigured } from "@/lib/ai";
import SubmitButton from "@/components/SubmitButton";
import { STAGE_LABEL } from "@/lib/workflow";
import { can } from "@/lib/permissions";
import { baht, DOC_LABEL } from "@/lib/money";
import { Header, Card, Err, Av } from "@/components/ui";
import JobActions from "@/components/JobActions";
export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; portal?: string; sent?: string }> }) {
  const me = await requirePage("clients.view");
  const { id } = await params; const { err, portal, sent } = await searchParams;
  const c = await getClient(id); if (!c) notFound();
  const [jobs, sites, docs, notes, ik] = await Promise.all([listJobs(id), listSites(id), listDocs(id), clientNotes(id), getIntake(id)]);
  const intake = ik?.intake;
  const email = (await one<{ v: string }>(`select value v from contacts where client_id = $1 and channel = 'Email' order by id desc limit 1`, [id]))?.v;
  const evs = jobs.length ? await listEvents(jobs.map((j) => j.id), 20) : [];
  const back = `/clients/${id}`;
  return (<>
    <Header crumb={`ลูกค้า · ${c.kind}`} title={c.name}><Link className="btn o" href={`/inbox?c=${id}`}>เปิดแชท</Link>
      <form action={sendPortalLinkAction}><input type="hidden" name="client" value={id} /><button className="btn">ส่งลิงก์ Portal</button></form></Header>
    <div className="bd">
      <Err msg={err} />
      {portal && <div className="note"><b>{sent === "1" ? "ส่งลิงก์ทาง LINE แล้ว" : "สร้างลิงก์แล้ว (ลูกค้ายังไม่มี LINE · ส่งเอง)"}</b> · ใช้ได้ 7 วัน · ลิงก์เก่าถูกยกเลิก<div className="mono sm" style={{ marginTop: 6, wordBreak: "break-all" }}>{portalUrl(portal)}</div></div>}
      <div className="row">
        <div className="main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {jobs.map((j) => (
            <Card key={j.id} title={`งาน: ${j.title}`} right={<span className="chip c-b">{STAGE_LABEL[j.stage]}</span>}>
              <div className="sm mut" style={{ marginBottom: 10 }}>เทมเพลต {j.template ?? "—"} · ตรวจผ่าน {j.checksPassed}/6 · รอบแก้ {j.editRounds} · ผู้รับผิดชอบ {j.assignee}</div>
              <form action={updateJobFlagsAction} className="f" style={{ marginBottom: 12 }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="back" value={back} />
                <label className="f"><input type="checkbox" name="checklist" defaultChecked={j.checklistDone} /> เช็กลิสต์ครบ</label>
                <label className="f"><input type="checkbox" name="pdpa" defaultChecked={j.pdpa} /> ยินยอม PDPA</label>
                <button className="btn o sm">บันทึก</button></form>
              <JobActions job={j} back={back} />
            </Card>))}
          <Card title="เว็บไซต์" pad={false}><div className="tw"><table><tbody>
            {sites.map((s) => <tr key={s.id}><td className="mono">{s.domain}</td><td>{s.template}</td><td>v{s.version}</td><td><span className={"chip " + (s.status === "live" ? "c-g" : s.status === "down" ? "c-r" : "c-y")}>{s.status}</span></td><td><Link className="btn o sm" href={`/builder?site=${s.id}`}>แก้</Link></td></tr>)}
            {!sites.length && <tr><td className="mut">ยังไม่มีเว็บ</td></tr>}
          </tbody></table></div></Card>
          <Card title="เอกสาร" pad={false}><div className="tw"><table><tbody>
            {docs.map((d) => <tr key={d.no}><td className="mono">{d.no}</td><td>{DOC_LABEL[d.type]}</td><td>{baht(d.total)}</td><td>{d.status}</td><td>{can(me.role, "finance.view") && <a className="btn o sm" href={`/api/docs/${d.no}/pdf`} target="_blank" rel="noopener">PDF</a>}</td></tr>)}
            {!docs.length && <tr><td className="mut">ยังไม่มีเอกสาร</td></tr>}
          </tbody></table></div></Card>
        </div>
        <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title="ข้อมูลติดต่อ"><div className="f"><Av c={c.color} n={c.name} /><div><b>{c.contact}</b><div className="sm mut">{c.channel} · แพ็ก {c.pkg}{c.taxId ? ` · ภาษี ${c.taxId}` : ""}</div></div></div>
            <form action={setClientEmailAction} className="f" style={{ marginTop: 12 }}><input type="hidden" name="client" value={id} />
              <input className="inp" name="email" type="email" defaultValue={email ?? ""} placeholder="อีเมลลูกค้า (รับยืนยันคิว ใบแจ้งหนี้ ใบเสร็จ)" style={{ flex: 1 }} /><button className="btn o sm">บันทึก</button></form></Card>
          <Card title="ข้อมูลจากแชท (Claude)" right={<form action={extractIntakeAction}><input type="hidden" name="client" value={id} /><SubmitButton className="btn o sm" pending="กำลังอ่านแชท…">{intake ? "สรุปใหม่" : "สรุปจากแชท"}</SubmitButton></form>}>
            {!aiConfigured() && <div className="sm mut">ยังไม่ได้ตั้ง ANTHROPIC_API_KEY</div>}
            {intake ? (<div className="list sm">
              {([["ชื่อร้าน", intake.business_name], ["ประเภท", intake.business_type], ["ผู้ติดต่อ", intake.contact_name], ["โทร", intake.phone], ["LINE", intake.line_id], ["ที่อยู่", intake.address], ["เวลาเปิด", intake.opening_hours], ["เทมเพลตที่แนะนำ", intake.suggested_template]] as const).map(([k, v]) => <div key={k}><span className="mut">{k}:</span> {v ?? "—"}</div>)}
              {intake.products.length > 0 && <div><span className="mut">สินค้า/เมนู:</span> {intake.products.map((p) => `${p.name}${p.price != null ? ` ${p.price}฿` : ""}`).join(" · ")}</div>}
              {intake.missing.length > 0 ? <div className="note">ยังขาด: {intake.missing.join(" · ")}</div> : <span className="chip c-g">ข้อมูลครบ</span>}
              <div className="mut">อัปเดต {new Date(ik!.at!).toLocaleString("th-TH")} · ตรวจก่อนติ๊ก "เช็กลิสต์ครบ"</div>
            </div>) : <div className="sm mut">ยังไม่ได้สรุป</div>}
          </Card>
          <Card title="ความจำลูกค้า (client_notes)">
            <form action={addNoteAction} className="f" style={{ marginBottom: 10 }}><input type="hidden" name="client" value={id} /><input className="inp" name="note" placeholder="เช่น ชอบโทนเขียว" style={{ flex: 1 }} /><button className="btn sm">เพิ่ม</button></form>
            <div className="list">{notes.map((n, i) => <div key={i} className="sm">• {n}</div>)}</div>
          </Card>
          <Card title="ไทม์ไลน์ (events)"><div className="list">{evs.map((e) => <div key={e.id} className="sm"><span className="mono">{e.name}</span> <span className="mut">· {e.actor} · {new Date(e.at).toLocaleString("th-TH")}</span></div>)}{!evs.length && <span className="sm mut">ยังไม่มีเหตุการณ์</span>}</div></Card>
        </div>
      </div>
    </div>
  </>);
}
