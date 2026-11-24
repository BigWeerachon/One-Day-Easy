import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Header, Card, Err } from "@/components/ui";
import * as T from "@/lib/templates";
import { createTemplateAction, saveDraftAction, checkTemplateAction, approveTemplateAction, retireTemplateAction, deleteDraftAction, applyTemplateAction } from "@/lib/template-actions";
import { BUSINESSES, BLOCK_LABEL, VARIANTS, VARIANT_LABEL, PALETTES, FONT_PAIRS, CORE_REQUIRED, BUSINESS_REQUIRED, checksPass, type Business } from "@ode/blocks/templates";

export const dynamic = "force-dynamic";
const STATUS: Record<string, [string, string]> = { draft: ["ร่าง", "c-y"], approved: ["อนุมัติแล้ว · ล็อก", "c-g"], retired: ["เลิกใช้", ""] };
const OK: Record<string, string> = { created: "สร้างร่างแล้ว", saved: "บันทึกร่างแล้ว", checked: "ตรวจแล้ว", approved: "อนุมัติแล้ว เทมเพลตเวอร์ชันนี้ถูกล็อก", retired: "เลิกใช้เวอร์ชันนี้แล้ว (เว็บเดิมยังใช้ต่อได้)", deleted: "ลบร่างแล้ว", applied: "เปลี่ยนเทมเพลตของเว็บแล้ว" };

/** ฟอร์มประกอบเทมเพลต: ติ๊กบล็อก ใส่ลำดับ เลือกหน้าตา ติ๊กบังคับ · ชุดสี คู่ฟอนต์ ความโค้งมุม */
function SpecForm({ t, readOnly }: { t?: T.TemplateRow; readOnly?: boolean }) {
  const business = (t?.business ?? "restaurant") as Business;
  const blocks = t?.spec.blocks ?? ["hero", "menu", "reviews", "gallery", "hours", "line", "map"].map((type) => ({ type, variant: VARIANTS[type][0] }));
  const required = t?.spec.required ?? [...CORE_REQUIRED, ...BUSINESS_REQUIRED[business]];
  const idx = (type: string) => blocks.findIndex((b) => b.type === type);
  const always: string[] = [...CORE_REQUIRED, ...BUSINESS_REQUIRED.restaurant, ...BUSINESS_REQUIRED.cafe];
  return (<fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
    <div className="f" style={{ marginBottom: 12 }}>
      <label className="sm">ชื่อเทมเพลต <input className="inp" name="name" defaultValue={t?.name ?? ""} required maxLength={60} style={{ maxWidth: 240 }} /></label>
      <label className="sm">ประเภทธุรกิจ <select name="business" defaultValue={business} style={{ maxWidth: 160 }}>{Object.entries(BUSINESSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <div className="tw"><table>
      <thead><tr><th>ใช้</th><th>บล็อก</th><th>ลำดับ</th><th>หน้าตา</th><th>บังคับ (ลูกค้าปิดไม่ได้)</th></tr></thead>
      <tbody>{Object.keys(VARIANTS).map((type) => {
        const i = idx(type), on = i >= 0;
        return (<tr key={type}>
          <td><input type="checkbox" name={`use_${type}`} defaultChecked={on} aria-label={`ใช้บล็อก${BLOCK_LABEL[type]}`} /></td>
          <td>{BLOCK_LABEL[type]}</td>
          <td><input className="inp" name={`order_${type}`} type="number" min={1} max={20} defaultValue={on ? i + 1 : ""} style={{ width: 70 }} aria-label={`ลำดับของ${BLOCK_LABEL[type]}`} /></td>
          <td><select name={`variant_${type}`} defaultValue={on ? blocks[i].variant : VARIANTS[type][0]} aria-label={`หน้าตาของ${BLOCK_LABEL[type]}`} style={{ maxWidth: 150 }}>
            {VARIANTS[type].map((v) => <option key={v} value={v}>{VARIANT_LABEL[v] ?? v}</option>)}</select></td>
          <td>{always.includes(type) ? <span className="sm mut">บังคับเสมอ</span> : <input type="checkbox" name={`req_${type}`} defaultChecked={required.includes(type)} aria-label={`${BLOCK_LABEL[type]}เป็นบล็อกบังคับ`} />}</td>
        </tr>);
      })}</tbody></table></div>
    <div className="f" style={{ marginTop: 12 }}>
      <label className="sm">ชุดสี <select name="palette" defaultValue={t?.spec.palette ?? "chili"} style={{ maxWidth: 180 }}>{PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="sm">คู่ฟอนต์ <select name="fonts" defaultValue={t?.spec.fonts ?? "classic"} style={{ maxWidth: 260 }}>{FONT_PAIRS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="sm">ความโค้งมุม (0–28) <input className="inp" name="radius" type="number" min={0} max={28} defaultValue={t?.spec.radius ?? 16} style={{ width: 80 }} /></label>
    </div>
    <div style={{ display: "flex", gap: 6, marginTop: 8 }} aria-hidden="true">{PALETTES.map((p) => <span key={p.id} title={p.name} style={{ width: 22, height: 22, borderRadius: 6, background: p.primary, border: `3px solid ${p.accent}` }} />)}</div>
  </fieldset>);
}

export default async function Templates({ searchParams }: { searchParams: Promise<{ id?: string; new?: string; from?: string; err?: string; ok?: string }> }) {
  const me = await requirePage("sites.edit");
  const sp = await searchParams;
  const all = await T.listTemplates();
  const sel = sp.id ? all.find((t) => t.id === sp.id) : undefined;
  const from = sp.from ? all.find((t) => t.id === sp.from) : undefined;
  const latest = (key: string) => all.find((t) => t.key === key && t.status === "approved");
  const canApprove = can(me.role, "templates.approve");

  return (<>
    <Header crumb="เทมเพลต" title="ระบบเทมเพลตสำเร็จรูป"><Link className="btn" href="/templates?new=1">+ เทมเพลตใหม่</Link></Header>
    <div className="bd"><div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Err msg={sp.err} />
      {sp.ok && OK[sp.ok] && <div className="note" role="status">{OK[sp.ok]}</div>}
      <p className="sm mut">ประกอบเทมเพลตจากบล็อกที่มีอยู่ → ดูตัวอย่าง 3 แบบ → ตรวจอัตโนมัติ → Owner อนุมัติ แล้วเวอร์ชันนั้นถูกล็อก · แก้ต่อ = สร้างเวอร์ชันใหม่ · เว็บที่ใช้อยู่ไม่เปลี่ยนจนกว่าจะกดอัปเกรดทีละร้าน</p>

      <Card title="เทมเพลตทั้งหมด" pad={false}><div className="tw"><table>
        <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ธุรกิจ</th><th>สถานะ</th><th>เว็บที่ใช้</th><th /></tr></thead>
        <tbody>{all.map((t) => (<tr key={t.id}>
          <td className="mono">{t.key} v{t.version}</td><td>{t.name}</td><td>{BUSINESSES[t.business]}</td>
          <td><span className={"chip " + STATUS[t.status][1]}>{STATUS[t.status][0]}</span></td><td>{t.sites}</td>
          <td><Link className="btn o sm" href={`/templates?id=${t.id}`}>เปิด</Link></td>
        </tr>))}
        {!all.length && <tr><td className="mut">ยังไม่มีเทมเพลต</td></tr>}</tbody></table></div></Card>

      {(sp.new || from) && <Card title={from ? `เวอร์ชันใหม่ของ ${from.key} (ต่อจาก v${from.version})` : "เทมเพลตใหม่"}>
        <form action={createTemplateAction}>{from && <input type="hidden" name="fromKey" value={from.key} />}
          <SpecForm t={from} />
          <button className="btn" style={{ marginTop: 12 }}>บันทึกร่าง</button>
        </form>
      </Card>}

      {sel && <SelectedTemplate t={sel} canApprove={canApprove} newer={latest(sel.key)} />}
    </div></div>
  </>);
}

async function SelectedTemplate({ t, canApprove, newer }: { t: T.TemplateRow; canApprove: boolean; newer?: T.TemplateRow }) {
  const draft = t.status === "draft";
  const passed = !!t.checks && checksPass(t.checks);
  const [onKey, free] = await Promise.all([T.sitesForKey(t.key), t.status === "approved" ? T.sitesWithoutTemplate() : Promise.resolve([])]);
  const older = t.status === "approved" ? onKey.filter((s) => s.version! < t.version) : [];
  const impacts = await Promise.all(older.map((s) => T.upgradeImpact(s.id, t.id)));
  const pv = (d: "sample" | "long" | "empty") => T.templatePreviewUrl(t.id, d);
  return (<>
    <Card title={`${t.key} v${t.version} · ${t.name}`} right={<span className={"chip " + STATUS[t.status][1]}>{STATUS[t.status][0]}</span>}>
      <div className="f" style={{ marginBottom: 12 }}>
        <b className="sm">ดูตัวอย่าง:</b>
        {pv("sample") ? (["sample", "long", "empty"] as const).map((d) => <a key={d} className="btn o sm" href={pv(d)!} target="_blank" rel="noopener">{d === "sample" ? "ข้อมูลตัวอย่าง" : d === "long" ? "ข้อมูลยาวสุด" : "ข้อมูลน้อยสุด"}</a>)
          : <span className="sm mut">ตั้ง ENGINE_URL และ PREVIEW_SECRET ก่อนจึงดูตัวอย่างได้</span>}
        <span className="sm mut">· เปิดบนมือถือด้วยเพื่อดูว่าไม่ล้นจอ</span>
      </div>
      {draft ? <form action={saveDraftAction}><input type="hidden" name="id" value={t.id} /><SpecForm t={t} /><button className="btn o" style={{ marginTop: 12 }}>บันทึกร่าง</button></form>
        : <><SpecForm t={t} readOnly /><p className="sm mut" style={{ marginTop: 8 }}>อนุมัติโดย {t.approvedBy} · {t.approvedAt && new Date(t.approvedAt).toLocaleString("th-TH")} · แก้ไม่ได้</p></>}
    </Card>

    <Card title="ผลตรวจอัตโนมัติ" right={draft && <form action={checkTemplateAction}><input type="hidden" name="id" value={t.id} /><button className="btn o sm">ตรวจ</button></form>}>
      {t.checks ? <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{t.checks.map((c) => <li key={c.name} style={{ padding: "4px 0" }}>
        <span className={"chip " + (c.ok ? "c-g" : "c-r")}>{c.ok ? "✓ ผ่าน" : "✗ ไม่ผ่าน"}</span> {c.name}{c.detail && <span className="sm mut"> · {c.detail}</span>}</li>)}</ul>
        : <p className="sm mut">{draft ? "ยังไม่ได้ตรวจ · กด \"ตรวจ\" หลังบันทึกร่าง" : "ผ่านการตรวจตอนอนุมัติแล้ว"}</p>}
      <div className="f" style={{ marginTop: 12 }}>
        {draft && canApprove && <form action={approveTemplateAction}><input type="hidden" name="id" value={t.id} /><button className="btn" disabled={!passed}>อนุมัติและล็อกเวอร์ชันนี้</button></form>}
        {draft && !canApprove && <span className="sm mut">ส่งให้ Owner อนุมัติ</span>}
        {draft && <form action={deleteDraftAction}><input type="hidden" name="id" value={t.id} /><button className="btn o">ลบร่าง</button></form>}
        {t.status === "approved" && <Link className="btn o" href={`/templates?from=${t.id}`}>สร้างเวอร์ชันใหม่จากอันนี้</Link>}
        {t.status === "approved" && canApprove && newer?.id === t.id && <form action={retireTemplateAction}><input type="hidden" name="id" value={t.id} /><button className="btn o">เลิกใช้ (เว็บเดิมยังใช้ต่อได้)</button></form>}
      </div>
    </Card>

    {t.status === "approved" && <Card title="ใช้กับเว็บ / อัปเกรด" pad={false}><div className="tw"><table>
      <thead><tr><th>ร้าน</th><th>ตอนนี้ใช้</th><th>ผลกระทบ</th><th /></tr></thead>
      <tbody>
        {older.map((s, i) => (<tr key={s.id}>
          <td>{s.client}<div className="sm mut mono">{s.domain}</div></td><td className="mono">{s.key} v{s.version}</td>
          <td className="sm">{impacts[i].dropped.length ? <span className="chip c-y">บล็อกที่จะหาย: {impacts[i].dropped.join(", ")}</span> : null}
            {impacts[i].missing.length ? <span className="chip c-r">ขาดข้อมูล: {impacts[i].missing.join(", ")}</span> : null}
            {!impacts[i].dropped.length && !impacts[i].missing.length && <span className="mut">ไม่มี</span>}</td>
          <td className="f">{T.templatePreviewUrl(t.id, "sample", s.id) && <a className="btn o sm" href={T.templatePreviewUrl(t.id, "sample", s.id)!} target="_blank" rel="noopener">ดูร้านนี้บน v{t.version}</a>}
            <form action={applyTemplateAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="site" value={s.id} /><button className="btn sm" disabled={impacts[i].missing.length > 0}>อัปเกรด</button></form></td>
        </tr>))}
        {onKey.filter((s) => s.version === t.version).map((s) => <tr key={s.id}><td>{s.client}<div className="sm mut mono">{s.domain}</div></td><td className="mono">{s.key} v{s.version}</td><td className="mut sm">ใช้เวอร์ชันนี้อยู่</td><td /></tr>)}
        {!onKey.length && !older.length && <tr><td className="mut" colSpan={4}>ยังไม่มีเว็บที่ใช้เทมเพลตนี้</td></tr>}
      </tbody></table></div>
      {free.length > 0 && <form action={applyTemplateAction} className="f" style={{ padding: 16 }}><input type="hidden" name="id" value={t.id} />
        <select name="site" aria-label="เลือกเว็บที่จะใช้เทมเพลตนี้" style={{ maxWidth: 320 }}>{free.map((s) => <option key={s.id} value={s.id}>{s.client} · {s.domain}</option>)}</select>
        <button className="btn sm">ใช้เทมเพลตนี้กับเว็บ</button>
        <span className="sm mut">เว็บที่ยังใช้เทมเพลตรุ่นเดิมในโค้ด</span></form>}
    </Card>}
  </>);
}
