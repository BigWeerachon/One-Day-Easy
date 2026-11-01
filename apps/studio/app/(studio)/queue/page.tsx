import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listClients } from "@/lib/store";
import * as B from "@/lib/booking";
import { localDate, localTime, addDays, isDate, weekdayOf, NEXT_STATUS, STATUS_LABEL, type BookingStatus } from "@/lib/booking-rules";
import {
  createBookingAction, setBookingStatusAction, callNextAction, saveSettingsAction, saveServiceAction, saveResourceAction,
  addHoursAction, deleteHoursAction, addClosureAction, deleteClosureAction,
} from "@/lib/booking-actions";
import { Header, Card, Kpi, Err } from "@/components/ui";

const TONE: Record<BookingStatus, string> = { held: "c-y", confirmed: "c-b", checked_in: "c-p", in_service: "c-g", done: "", cancelled: "c-r", no_show: "c-r", expired: "" };
const ACTION_LABEL: Partial<Record<BookingStatus, string>> = { confirmed: "ยืนยัน", checked_in: "มาถึงแล้ว", in_service: "เริ่มให้บริการ", done: "เสร็จ", no_show: "ไม่มา" };
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const baht = (s: number | null) => (s == null ? "—" : `฿${(s / 100).toLocaleString("th-TH")}`);

type SP = { view?: string; day?: string; svc?: string; err?: string };
export default async function Queue({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePage("queue.view");
  const sp = await searchParams;
  const today = localDate(new Date());
  const day = sp.day && isDate(sp.day) ? sp.day : today;
  const view = sp.view === "week" || sp.view === "setup" ? sp.view : "run";
  const edit = can(me.role, "queue.edit"), setup = can(me.role, "queue.setup");
  const href = (p: Partial<SP>) => "/queue?" + new URLSearchParams(Object.entries({ view, day, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const tabs = [["run", "รันคิว"], ["week", "ตารางงาน"], ...(setup ? [["setup", "ตั้งค่าการจอง"]] : [])];
  return (<>
    <Header crumb="จอง → ยืนยัน → มาถึง → ให้บริการ → เสร็จ" title="คิว & ตารางงาน">
      <nav className="tabs">{tabs.map(([v, l]) => <Link key={v} href={href({ view: v })} className={"tab" + (view === v ? " on" : "")}>{l}</Link>)}</nav>
    </Header>
    <div className="bd">
      <Err msg={sp.err} />
      {view === "run" && <RunView day={day} today={today} edit={edit} href={href} svc={sp.svc} />}
      {view === "week" && <WeekView day={day} href={href} />}
      {view === "setup" && setup && <SetupView />}
    </div>
  </>);
}

function DayNav({ day, today, href, step = 1 }: { day: string; today: string; href: (p: Partial<SP>) => string; step?: number }) {
  return <div className="f">
    <Link className="btn o sm" href={href({ day: addDays(day, -step) })}>‹</Link>
    <b>{B.thaiDay(day)}</b>
    <Link className="btn o sm" href={href({ day: addDays(day, step) })}>›</Link>
    {day !== today && <Link className="btn o sm" href={href({ day: today })}>วันนี้</Link>}
    <form className="f" action="/queue"><input type="hidden" name="view" value={step === 7 ? "week" : "run"} /><input type="date" name="day" defaultValue={day} className="inp" style={{ width: 150 }} /><button className="btn o sm">ไป</button></form>
  </div>;
}

async function RunView({ day, today, edit, href, svc }: { day: string; today: string; edit: boolean; href: (p: Partial<SP>) => string; svc?: string }) {
  const [list, resources, services, settings] = await Promise.all([B.listDay(day), B.listResources(), B.listServices(), B.getSettings()]);
  const st = B.statsOf(list);
  const back = href({});
  const svcCode = services.find((s) => s.code === svc)?.code ?? services[0]?.code;
  const avail = svcCode ? await B.availability(svcCode, day, 1, { ignoreNotice: true }).catch(() => null) : null;
  const clients = edit ? await listClients() : [];
  const active = list.filter((b) => b.status !== "cancelled" && b.status !== "expired");
  return (<>
    <div className="f" style={{ justifyContent: "space-between" }}>
      <DayNav day={day} today={today} href={href} />
      <span className="sm mut">จองผ่าน LINE: {settings.lineEnabled ? "เปิด" : "ปิด"} · กันที่ {settings.holdMin} นาที · เตือนก่อน {Math.round(settings.remindBeforeMin / 60)} ชม.</span>
    </div>
    <div className="kpis">
      <Kpi label="คิวทั้งหมด" value={st.total} sub={st.cancelled ? `ยกเลิก ${st.cancelled}` : undefined} />
      <Kpi label="มาถึงแล้ว รอเรียก" value={st.waiting} tone="#5b34c7" />
      <Kpi label="กำลังให้บริการ" value={st.inService} tone="#0a7a3a" />
      <Kpi label="เสร็จแล้ว" value={st.done} sub={st.noShow ? `ไม่มา ${st.noShow}` : undefined} tone="#c62828" />
    </div>

    <Card title="หน้างาน · เรียกคิว" right={<span className="sm mut">เรียกคิวถัดไป = คิวที่ "มาถึงแล้ว" เรียงตามเวลานัด · แจ้งลูกค้าทาง LINE อัตโนมัติ</span>}>
      <div className="kb">{resources.map((r) => {
        const now = list.find((b) => b.resourceId === r.id && b.status === "in_service");
        const waiting = list.filter((b) => b.resourceId === r.id && b.status === "checked_in").length;
        return <div key={r.id} className="col" style={{ minHeight: 0, borderTop: `3px solid ${r.color}` }}>
          <b>{r.name}</b>
          {now ? <div><div className="v">คิว {now.queueNo}</div><div className="sm">{now.customerName} · {now.serviceName}</div><div className="sm mut">เริ่ม {localTime(now.start)} น.</div></div> : <div className="mut sm">ว่าง</div>}
          <div className="sm mut">รออยู่ {waiting} คิว</div>
          {edit && <div className="f">
            {now && <StatusBtn id={now.id} to="done" back={back} label="เสร็จ" />}
            {!now && <form action={callNextAction}><input type="hidden" name="day" value={day} /><input type="hidden" name="resource" value={r.id} /><input type="hidden" name="back" value={back} /><button className="btn sm" disabled={!waiting}>เรียกคิวถัดไป</button></form>}
          </div>}
        </div>;
      })}
      {!resources.length && <div className="mut">ยังไม่มีผู้ให้บริการ · ไปที่แท็บ "ตั้งค่าการจอง"</div>}</div>
    </Card>

    <div className="row">
      <div className="main" style={{ flex: "3 1 700px" }}><Card title={`คิวของวัน (${active.length})`} pad={false}><div className="tw"><table>
        <thead><tr><th>คิว</th><th>เวลา</th><th>ลูกค้า</th><th>บริการ · ผู้ให้บริการ</th><th>สถานะ</th>{edit && <th />}</tr></thead>
        <tbody>{list.map((b) => <tr key={b.id} style={{ opacity: ["cancelled", "done", "no_show"].includes(b.status) ? 0.6 : 1 }}>
          <td><b>{b.queueNo ?? "—"}</b><div className="sm mut mono" style={{ whiteSpace: "nowrap" }}>{b.code}</div></td>
          <td style={{ whiteSpace: "nowrap" }}>{localTime(b.start)}–{localTime(b.end)}</td>
          <td>{b.clientId ? <Link href={`/clients/${b.clientId}`}>{b.customerName}</Link> : b.customerName}<div className="sm mut">{({ line: "จองผ่าน LINE", staff: "ทีมจองให้", walkin: "Walk-in", portal: "Portal" } as Record<string, string>)[b.source]}{b.note ? ` · ${b.note}` : ""}</div></td>
          <td>{b.serviceName}<div className="sm mut"><span style={{ color: b.color }}>●</span> {b.resourceName}</div></td>
          <td><span className={"chip " + TONE[b.status]}>{STATUS_LABEL[b.status]}</span>{b.status === "held" && b.holdExpiresAt && <div className="sm mut">หมดเวลา {localTime(new Date(b.holdExpiresAt))}</div>}</td>
          {edit && <td><div className="f">
            {NEXT_STATUS[b.status].filter((s) => s !== "cancelled" && s !== "expired" && !(b.status === "checked_in" && s === "confirmed") && !(b.status === "in_service" && s === "checked_in")).map((s) =>
              <StatusBtn key={s} id={b.id} to={s} back={back} label={ACTION_LABEL[s] ?? STATUS_LABEL[s]} tone={s === "no_show" ? "r" : s === "in_service" || s === "done" ? "" : "o"} />)}
            {NEXT_STATUS[b.status].includes("cancelled") && <details><summary className="btn r sm" style={{ listStyle: "none" }}>ยกเลิก</summary>
              <form action={setBookingStatusAction} className="f" style={{ marginTop: 6 }}>
              <input type="hidden" name="id" value={b.id} /><input type="hidden" name="to" value="cancelled" /><input type="hidden" name="back" value={back} />
              <input name="reason" className="inp" placeholder="เหตุผล (ส่งให้ลูกค้า)" required style={{ width: 160, padding: "3px 8px" }} /><button className="btn r sm">ยืนยันยกเลิก</button></form></details>}
          </div></td>}
        </tr>)}
        {!list.length && <tr><td colSpan={6} className="mut">ยังไม่มีคิวในวันนี้</td></tr>}</tbody>
      </table></div></Card></div>

      {edit && <div className="side"><Card title="จองคิวให้ลูกค้า">
        {!services.length ? <div className="mut">ยังไม่มีบริการ · ตั้งค่าก่อน</div> : <div className="list">
          <form className="f" action="/queue"><input type="hidden" name="day" value={day} />
            <select name="svc" defaultValue={svcCode}>{services.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.durationMin} นาที</option>)}</select>
            <button className="btn o sm">ดูเวลาว่าง</button></form>
          <form action={createBookingAction} className="list" style={{ gap: 8 }}>
            <input type="hidden" name="svc" value={svcCode} /><input type="hidden" name="back" value={back} />
            <label className="sm">เวลา ({B.thaiDay(day, true)})
              <select name="slot" required>{avail?.days[0].slots.map((s) => <option key={s.start.getTime()} value={s.start.getTime()}>{localTime(s.start)} น. · {resources.find((r) => r.id === s.resourceId)?.name}</option>)}</select>
              {!avail?.days[0].slots.length && <span className="sm" style={{ color: "#c62828" }}>วันนี้ไม่มีเวลาว่างสำหรับบริการนี้</span>}</label>
            <label className="sm">ผู้ให้บริการ<select name="resource"><option value="">ให้ระบบเลือก (คนที่งานน้อยที่สุด)</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="sm">ลูกค้าในระบบ<select name="client"><option value="">— ไม่ระบุ —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <input name="name" className="inp" placeholder="หรือพิมพ์ชื่อลูกค้า" />
            <input name="note" className="inp" placeholder="หมายเหตุ (ถ้ามี)" />
            <label className="sm f"><input type="checkbox" name="notify" defaultChecked style={{ width: "auto" }} /> แจ้งลูกค้าทาง LINE</label>
            <button className="btn" disabled={!avail?.days[0].slots.length}>จองคิว</button>
          </form>
          {day === localDate(new Date()) && <form action={createBookingAction} className="f" style={{ borderTop: "1px solid #eef0f4", paddingTop: 10 }}>
            <input type="hidden" name="svc" value={svcCode} /><input type="hidden" name="walkin" value="1" /><input type="hidden" name="back" value={back} />
            <input name="name" className="inp" placeholder="ชื่อลูกค้า walk-in" required style={{ flex: 1 }} />
            <select name="resource" style={{ width: "auto" }}><option value="">ใครว่างก่อน</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <label className="sm f"><input type="checkbox" name="force" value="1" style={{ width: "auto" }} /> แทรกคิว</label>
            <button className="btn o sm">รับ walk-in ตอนนี้</button>
          </form>}
        </div>}
      </Card></div>}
    </div>
  </>);
}

function StatusBtn({ id, to, back, label, tone = "o" }: { id: string; to: BookingStatus; back: string; label: string; tone?: string }) {
  return <form action={setBookingStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><input type="hidden" name="back" value={back} /><button className={`btn sm ${tone}`}>{label}</button></form>;
}

async function WeekView({ day, href }: { day: string; href: (p: Partial<SP>) => string }) {
  const start = addDays(day, -((weekdayOf(day) + 6) % 7)); // เริ่มวันจันทร์
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [list, resources, hours, closures] = await Promise.all([B.listRange(days[0], days[6]), B.listResources(), B.listHours(), B.listClosures(days[0])]);
  const today = localDate(new Date());
  const closed = (d: string, r: string) => closures.find((c) => (c.resourceId === null || c.resourceId === r) && c.from <= d && d <= c.to);
  const open = (d: string, r: string) => { const wd = weekdayOf(d); const own = hours.filter((h) => h.resourceId === r && h.weekday === wd); return (own.length ? own : hours.filter((h) => h.resourceId === null && h.weekday === wd)); };
  return (<>
    <div className="f" style={{ justifyContent: "space-between" }}><DayNav day={day} today={today} href={href} step={7} /><span className="sm mut">{B.thaiDay(days[0], true)} – {B.thaiDay(days[6], true)} · {list.length} คิว</span></div>
    <Card pad={false}><div className="tw"><table style={{ tableLayout: "fixed", minWidth: 900 }}>
      <thead><tr><th style={{ width: 130 }}>ผู้ให้บริการ</th>{days.map((d) => <th key={d} style={{ background: d === today ? "#eef4fe" : undefined }}><Link href={href({ view: "run", day: d })}>{WD[weekdayOf(d)]} {Number(d.slice(8))}</Link></th>)}</tr></thead>
      <tbody>{resources.map((r) => <tr key={r.id}>
        <td style={{ verticalAlign: "top" }}><span style={{ color: r.color }}>●</span> <b>{r.name}</b></td>
        {days.map((d) => { const c = closed(d, r.id); const h = open(d, r.id); const items = list.filter((b) => b.day === d && b.resourceId === r.id); return (
          <td key={d} style={{ verticalAlign: "top", padding: 8, background: c || !h.length ? "#f7f8fb" : undefined }}>
            <div className="sm mut">{c ? `ปิด · ${c.reason}` : h.length ? h.map((x) => `${x.open}–${x.close}`).join(", ") : "ไม่เปิด"}</div>
            <div className="list" style={{ gap: 4, marginTop: 4 }}>{items.map((b) => <div key={b.id} className="sm" style={{ borderLeft: `3px solid ${r.color}`, background: "#fff", border: "1px solid #eef0f4", borderLeftWidth: 3, borderLeftColor: r.color, borderRadius: 6, padding: "3px 6px" }}>
              <b>{localTime(b.start)}</b> {b.customerName}<div className="mut">{b.serviceName} · <span className={"chip " + TONE[b.status]} style={{ fontSize: 10.5, padding: "0 6px" }}>{STATUS_LABEL[b.status]}</span></div></div>)}</div>
          </td>); })}
      </tr>)}</tbody>
    </table></div></Card>
  </>);
}

async function SetupView() {
  const [settings, services, resources, hours, closures] = await Promise.all([B.getSettings(), B.listServices(true), B.listResources(true), B.listHours(), B.listClosures(localDate(new Date()))]);
  const rName = (id: string | null) => (id ? resources.find((r) => r.id === id)?.name ?? "?" : "ทุกคน (ค่ากลาง)");
  const num = (name: string, label: string, v: number, unit: string) => <label className="sm">{label}<div className="f"><input className="inp" type="number" name={name} defaultValue={v} min={0} style={{ width: 100 }} /><span className="mut">{unit}</span></div></label>;
  return (<div className="row">
    <div className="main list" style={{ gap: 24 }}>
      <Card title="บริการที่จองได้" pad={false}><div className="tw"><table>
        <thead><tr><th>รหัส · ชื่อ</th><th>เวลา</th><th>ต่อวัน</th><th>ราคา</th><th>ผู้ให้บริการ</th><th>LINE</th></tr></thead>
        <tbody>{services.map((s) => <tr key={s.code} style={{ opacity: s.active ? 1 : 0.5 }}><td><b>{s.name}</b><div className="sm mut mono">{s.code}{s.active ? "" : " · ปิด"}</div></td>
          <td>{s.durationMin} นาที{s.bufferMin ? <div className="sm mut">+ เผื่อ {s.bufferMin}</div> : null}</td><td>{s.maxPerDay ?? "∞"}</td><td>{baht(s.price)}</td>
          <td className="sm">{s.resourceIds.map((id) => rName(id)).join(", ") || <span style={{ color: "#c62828" }}>ยังไม่มี</span>}</td><td>{s.lineBookable ? "✅" : "—"}</td></tr>)}</tbody>
      </table></div>
        <form action={saveServiceAction} className="cb list" style={{ gap: 8, borderTop: "1px solid #eef0f4" }}>
          <div className="sm mut">เพิ่ม/แก้บริการ (ใส่รหัสเดิมเพื่อแก้)</div>
          <div className="f"><input name="code" className="inp" placeholder="รหัส เช่น CONSULT" required style={{ width: 160 }} /><input name="name" className="inp" placeholder="ชื่อบริการ" required style={{ flex: 1 }} /></div>
          <div className="f">{num("durationMin", "ใช้เวลา", 60, "นาที")}{num("bufferMin", "เผื่อหลังจบ", 0, "นาที")}
            <label className="sm">ต่อวันสูงสุด<input className="inp" type="number" name="maxPerDay" min={1} placeholder="ไม่จำกัด" style={{ width: 110 }} /></label>
            <label className="sm">ราคา (บาท)<input className="inp" type="number" name="price" min={0} step="0.01" style={{ width: 110 }} /></label></div>
          <div className="f sm">ผู้ให้บริการ: {resources.filter((r) => r.active).map((r) => <label key={r.id} className="f"><input type="checkbox" name="resources" value={r.id} defaultChecked style={{ width: "auto" }} /> {r.name}</label>)}</div>
          <div className="f sm"><label className="f"><input type="checkbox" name="lineBookable" defaultChecked style={{ width: "auto" }} /> ลูกค้าจองเองผ่าน LINE ได้</label><label className="f"><input type="checkbox" name="active" defaultChecked style={{ width: "auto" }} /> เปิดใช้</label></div>
          <div><button className="btn sm">บันทึกบริการ</button></div>
        </form></Card>

      <Card title="เวลาทำการรายสัปดาห์" right={<span className="sm mut">ตั้งของคนใดคนหนึ่งไว้ = ใช้แทนค่ากลางในวันนั้น</span>} pad={false}><div className="tw"><table>
        <thead><tr><th>วัน</th><th>ใช้กับ</th><th>เวลา</th><th /></tr></thead>
        <tbody>{hours.map((h) => <tr key={h.id}><td>{WD[h.weekday]}</td><td>{rName(h.resourceId)}</td><td>{h.open}–{h.close}</td>
          <td><form action={deleteHoursAction}><input type="hidden" name="id" value={h.id} /><button className="btn r sm">ลบ</button></form></td></tr>)}
          {!hours.length && <tr><td colSpan={4} className="mut">ยังไม่ได้ตั้งเวลาทำการ · ลูกค้าจะจองไม่ได้</td></tr>}</tbody>
      </table></div>
        <form action={addHoursAction} className="cb f" style={{ borderTop: "1px solid #eef0f4" }}>
          {WD.map((w, i) => <label key={i} className="f sm"><input type="checkbox" name="wd" value={i} defaultChecked={i >= 1 && i <= 5} style={{ width: "auto" }} />{w}</label>)}
          <input type="time" name="open" defaultValue="09:00" className="inp" style={{ width: 110 }} /> – <input type="time" name="close" defaultValue="18:00" className="inp" style={{ width: 110 }} />
          <select name="resource" style={{ width: "auto" }}><option value="">ทุกคน (ค่ากลาง)</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <button className="btn sm">เพิ่มช่วงเวลา</button>
        </form></Card>

      <Card title="วันหยุด / ปิดรับคิว" pad={false}><div className="tw"><table>
        <thead><tr><th>วันที่</th><th>ใช้กับ</th><th>เหตุผล</th><th /></tr></thead>
        <tbody>{closures.map((c) => <tr key={c.id}><td>{B.thaiDay(c.from, true)}{c.to !== c.from ? ` – ${B.thaiDay(c.to, true)}` : ""}</td><td>{rName(c.resourceId)}</td><td>{c.reason}</td>
          <td><form action={deleteClosureAction}><input type="hidden" name="id" value={c.id} /><button className="btn r sm">ลบ</button></form></td></tr>)}
          {!closures.length && <tr><td colSpan={4} className="mut">ไม่มีวันหยุดที่กำลังจะถึง</td></tr>}</tbody>
      </table></div>
        <form action={addClosureAction} className="cb f" style={{ borderTop: "1px solid #eef0f4" }}>
          <input type="date" name="from" required className="inp" style={{ width: 150 }} /> ถึง <input type="date" name="to" className="inp" style={{ width: 150 }} />
          <select name="resource" style={{ width: "auto" }}><option value="">ทั้งร้าน</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <input name="reason" className="inp" placeholder="เหตุผล เช่น วันหยุดราชการ" required style={{ width: 200 }} />
          <button className="btn sm">เพิ่มวันหยุด</button>
        </form>
        <div className="cb sm mut" style={{ borderTop: "1px solid #eef0f4" }}>คิวที่จองไว้แล้วในวันหยุดจะไม่ถูกยกเลิกอัตโนมัติ ตรวจในหน้ารันคิวแล้วแจ้งลูกค้าเอง</div></Card>
    </div>

    <div className="side list" style={{ gap: 24 }}>
      <Card title="กฎการจอง"><form action={saveSettingsAction} className="list" style={{ gap: 10 }}>
        <label className="f sm"><input type="checkbox" name="lineEnabled" defaultChecked={settings.lineEnabled} style={{ width: "auto" }} /> <b>เปิดให้จองผ่านแชท LINE</b></label>
        {num("stepMin", "ให้เลือกเวลาเริ่มทุก", settings.stepMin, "นาที")}
        {num("minNoticeMin", "จองล่วงหน้าอย่างน้อย", settings.minNoticeMin, "นาที")}
        {num("maxDaysAhead", "จองล่วงหน้าได้ไม่เกิน", settings.maxDaysAhead, "วัน")}
        {num("holdMin", "กันที่รอลูกค้ายืนยัน", settings.holdMin, "นาที")}
        {num("cancelCutoffMin", "ยกเลิก/เลื่อนเองได้ถึงก่อนเวลานัด", settings.cancelCutoffMin, "นาที")}
        {num("remindBeforeMin", "ส่ง LINE เตือนก่อนเวลานัด (0 = ไม่เตือน)", settings.remindBeforeMin, "นาที")}
        <div><button className="btn sm">บันทึก</button></div>
      </form></Card>

      <Card title="ผู้ให้บริการ (คน/ห้อง)"><div className="list" style={{ gap: 8 }}>
        {resources.map((r) => <form key={r.id} action={saveResourceAction} className="f"><input type="hidden" name="id" value={r.id} />
          <input type="color" name="color" defaultValue={r.color} style={{ width: 36, padding: 2 }} /><input name="name" defaultValue={r.name} className="inp" style={{ flex: 1 }} />
          <label className="f sm"><input type="checkbox" name="active" defaultChecked={r.active} style={{ width: "auto" }} />ใช้งาน</label><button className="btn o sm">บันทึก</button></form>)}
        <form action={saveResourceAction} className="f"><input type="color" name="color" defaultValue="#0b6cf0" style={{ width: 36, padding: 2 }} /><input name="name" placeholder="ชื่อใหม่" className="inp" style={{ flex: 1 }} required /><input type="hidden" name="active" value="on" /><button className="btn sm">เพิ่ม</button></form>
      </div></Card>

      <Card title="ลูกค้าพิมพ์ใน LINE ได้แบบนี้"><div className="list sm" style={{ gap: 4 }}>
        {["จองคิว / ขอคิวพรุ่งนี้ 10 โมง", "วันศุกร์ว่างไหม / 15 พ.ย. มีคิวไหม", "คิวของฉัน / เช็คคิว", "ยกเลิกคิว", "เลื่อนนัด"].map((t) => <div key={t}>💬 {t}</div>)}
        <div className="mut" style={{ marginTop: 6 }}>บอทจะตอบพร้อมปุ่มเลือกวัน/เวลา กันที่ไว้ให้ระหว่างรอยืนยัน · ข้อความอื่นยังเข้ากล่องข้อความให้ทีมตอบตามปกติ</div>
      </div></Card>
    </div>
  </div>);
}
