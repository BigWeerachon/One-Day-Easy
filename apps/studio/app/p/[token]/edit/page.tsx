import * as P from "@/lib/portal";
import * as SE from "@/lib/self-edit";
import { editHeroAction, editItemsAction, editHoursAction, editFaqAction, undoEditAction, editBlockAction, editVisibilityAction, editLogoAction } from "@/lib/portal-actions";
import { EDIT_FIELDS, BLOCK_LABEL, specTheme, type Field } from "@ode/blocks/templates";
import { liveUrl } from "@/lib/preview";
import { themeFor, contrast } from "@ode/blocks/themes";
import ImageInput from "@/components/ImageInput";
import SubmitButton from "@/components/SubmitButton";
export const dynamic = "force-dynamic";

type Any = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const OK: Record<string, string> = { block: "บันทึกแล้ว", visibility: "บันทึกการเปิด/ปิดส่วนต่างๆ แล้ว", logo: "บันทึกโลโก้แล้ว", hero: "บันทึกหน้าแรกแล้ว", items: "บันทึกรายการแล้ว", hours: "บันทึกเวลาเปิด-ปิดแล้ว", faq: "บันทึกคำถามแล้ว", undo: "ย้อนกลับการแก้ล่าสุดแล้ว" };

export default async function EditSite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { token } = await params; const sp = await searchParams;
  const r = await P.resolvePortal(token);
  // สีหลักของร้าน (ธีมของเว็บ) · ตัวอักษรบนปุ่มและลิงก์เลือกสีที่อ่านออก (คอนทราสต์ ≥ 4.5)
  let shop: React.CSSProperties | undefined;
  if (r.status === "ok" && r.ctx.site) {
    const t = await SE.editable(r.ctx).then((e) => e && (e.spec ? specTheme(e.spec) : themeFor(e.template, e.config))).catch(() => null);
    if (t && /^#[0-9a-f]{6}$/i.test(t.primary)) {
      const onWhite = contrast(t.primary, "#ffffff") >= 4.5;
      shop = { "--pt-p": t.primary, "--pt-on": onWhite ? "#ffffff" : "#141a2b", "--pt-link": onWhite ? t.primary : "#141a2b" } as React.CSSProperties;
    }
  }
  const shell = (body: React.ReactNode) => (
    <div className={shop ? "pt-wrap pt-shop" : "pt-wrap"} style={shop}><header className="pt-top"><div className="pt-logo">One Day <span>Easy</span></div><span className="pt-chip">แก้เว็บของร้าน</span></header>
      <div className="pt-bd">{body}</div></div>);
  if (r.status !== "ok") return shell(<div className="pt-card"><h1 className="pt-h">ลิงก์นี้ใช้ไม่ได้แล้ว</h1><p className="pt-sm pt-mut" style={{ marginTop: 6 }}>พิมพ์ &quot;แก้เว็บ&quot; ในแชท LINE ของร้านเพื่อรับลิงก์ใหม่</p></div>);
  const { ctx } = r;
  const access = await SE.selfEditAccess(ctx);
  const e = await SE.editable(ctx);
  if (!access.ok || !e) return shell(<div className="pt-card">
    <h1 className="pt-h">{access.ok ? "ไม่พบเว็บ" : access.reason === "expired" ? "สิทธิ์แก้เว็บเองหมดแล้ว" : "ยังแก้เว็บเองไม่ได้"}</h1>
    <p className="pt-sm pt-mut" style={{ marginTop: 6 }}>{!access.ok && access.reason === "expired"
      ? "เว็บของคุณยังออนไลน์ตามปกติ ถ้าต้องการแก้เองต่อ ต่อค่าดูแลรายปีได้ทางแชท LINE หรือพิมพ์สิ่งที่อยากแก้ให้ทีมงานทำให้"
      : "แก้เองได้หลังเว็บออนไลน์แล้ว ระหว่างนี้ขอแก้ผ่านตัวอย่างเว็บที่ส่งให้ในแชทได้"}</p>
    <a className="pt-btn o" style={{ marginTop: 12 }} href={`/p/${token}`}>กลับ</a></div>);

  const c = e.config, site = ctx.site!;
  const slug = site.domain.split(".")[0];
  const thumb = (v: unknown) => { const m = /^file:(\d+)$/.exec(str(v)); return m && process.env.ENGINE_URL ? `${process.env.ENGINE_URL.replace(/\/$/, "")}/files/${m[1]}?slug=${slug}` : /^https:\/\//.test(str(v)) ? str(v) : null; };
  const H = ({ v }: { v: number }) => <><input type="hidden" name="t" value={token} /><input type="hidden" name="v" value={v} /></>;
  const hero = (c.hero ?? {}) as Any, hours = (c.hours ?? {}) as Any;
  const items = e.itemBlock ? ((c[e.itemBlock] as { items?: Any[] } | undefined)?.items ?? []) : [];
  const faq = ((c.faq as { items?: Any[] } | undefined)?.items ?? []);
  const rows = [...items, ...Array.from({ length: SE.MAX_NEW_ROWS }, () => ({}) as Any)];
  const faqRows = [...faq, ...Array.from({ length: 2 }, () => ({}) as Any)];
  const heroImg = thumb(hero.image);

  return shell(<>
    <div><h1 className="pt-h">แก้เว็บของร้าน</h1>
      <p className="pt-sm pt-mut">บันทึกแล้วเว็บจริงเปลี่ยนภายใน 1 นาที · แก้เองได้ถึง {new Date(access.until).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</p></div>
    {sp.err ? <div className="pt-err" role="alert">{sp.err}</div> : sp.ok && OK[sp.ok] ? <div className="pt-note">{OK[sp.ok]}</div> : null}
    <a className="pt-btn o" href={liveUrl(site.domain)} target="_blank" rel="noopener noreferrer">เปิดดูเว็บจริง ↗</a>

    <form action={editHeroAction} className="pt-card" id="hero"><H v={e.version} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>หน้าแรก</h2>
      {heroImg && <img src={heroImg} alt="รูปหน้าแรกตอนนี้" style={{ width: "100%", borderRadius: 10, marginTop: 10, aspectRatio: "16/9", objectFit: "cover" }} />}
      <label className="pt-lbl" htmlFor="h-title">หัวข้อ (ไม่เกิน 48 ตัวอักษร)</label>
      <input id="h-title" name="title" className="pt-inp" defaultValue={str(hero.title)} maxLength={48} required />
      <label className="pt-lbl" htmlFor="h-sub">คำโปรย (ไม่เกิน 120 ตัวอักษร)</label>
      <textarea id="h-sub" name="subtitle" className="pt-inp" rows={2} defaultValue={str(hero.subtitle)} maxLength={120} />
      <div className="pt-lbl">เปลี่ยนรูปหน้าแรก</div>
      <ImageInput name="image" label="เลือกรูปหน้าแรกใหม่" max={1600} limit={1} />
      {heroImg && <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 10 }}><input type="checkbox" name="noimage" value="1" /> ไม่ใช้รูปหน้าแรก</label>}
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">บันทึกหน้าแรก</SubmitButton></div>
    </form>

    {e.itemBlock && <form action={editItemsAction} className="pt-card" id="items"><H v={e.version} /><input type="hidden" name="n" value={rows.length} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>{SE.ITEM_LABEL[e.itemBlock]}</h2>
      <p className="pt-sm pt-mut">แก้ชื่อ ราคา {e.itemBlock === "services" ? "คำอธิบาย" : "รูป"} · เพิ่มรายการใหม่ในช่องว่างด้านล่าง · ติ๊ก &quot;ลบ&quot; เพื่อเอาออก</p>
      {rows.map((it, i) => {
        const img = thumb(it.img), isNew = i >= items.length;
        return <fieldset key={i} style={{ border: 0, borderTop: "1px solid #eef0f4", margin: "12px 0 0", padding: "12px 0 0" }}>
          <legend className="pt-sm pt-mut">{isNew ? `เพิ่มรายการใหม่` : `รายการที่ ${i + 1}`}</legend>
          <div style={{ display: "flex", gap: 8 }}>
            <input name={`name${i}`} aria-label={`ชื่อรายการที่ ${i + 1}`} className="pt-inp" placeholder="ชื่อ" defaultValue={str(it.name)} maxLength={e.itemBlock === "products" ? 48 : 32} style={{ flex: 2 }} />
            <input name={`price${i}`} aria-label={`ราคารายการที่ ${i + 1}`} className="pt-inp" placeholder="ราคา" inputMode="decimal" defaultValue={str(it.price)} style={{ flex: 1 }} />
          </div>
          {e.itemBlock === "services"
            ? <input name={`desc${i}`} aria-label={`คำอธิบายรายการที่ ${i + 1}`} className="pt-inp" placeholder="คำอธิบายสั้นๆ" defaultValue={str(it.desc)} maxLength={90} style={{ marginTop: 8 }} />
            : <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input type="hidden" name={`img${i}`} value={str(it.img)} />
                {img && <img src={img} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flex: "none" }} />}
                <div style={{ flex: 1 }}><ImageInput name={`image${i}`} label={img ? "เปลี่ยนรูป" : "ใส่รูป"} max={1000} limit={1} /></div>
              </div>}
          {!isNew && <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="checkbox" name={`del${i}`} value="1" /> ลบรายการนี้</label>}
        </fieldset>;
      })}
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">{`บันทึก${SE.ITEM_LABEL[e.itemBlock]}`}</SubmitButton></div>
    </form>}

    {e.hasHours && <form action={editHoursAction} className="pt-card" id="hours"><H v={e.version} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>วันและเวลาเปิด</h2>
      <label className="pt-lbl" htmlFor="hr-days">วันเปิด</label>
      <input id="hr-days" name="days" className="pt-inp" defaultValue={str(hours.days)} placeholder="เช่น ทุกวัน หรือ จันทร์–เสาร์" maxLength={40} required />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><label className="pt-lbl" htmlFor="hr-open">เปิด</label><input id="hr-open" name="open" type="time" className="pt-inp" defaultValue={str(hours.open)} required /></div>
        <div style={{ flex: 1 }}><label className="pt-lbl" htmlFor="hr-close">ปิด</label><input id="hr-close" name="close" type="time" className="pt-inp" defaultValue={str(hours.close)} required /></div>
      </div>
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">บันทึกเวลาเปิด-ปิด</SubmitButton></div>
    </form>}

    {e.hasFaq && <form action={editFaqAction} className="pt-card" id="faq"><H v={e.version} /><input type="hidden" name="n" value={faqRows.length} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>คำถามที่พบบ่อย</h2>
      {faqRows.map((it, i) => <fieldset key={i} style={{ border: 0, borderTop: "1px solid #eef0f4", margin: "12px 0 0", padding: "12px 0 0" }}>
        <legend className="pt-sm pt-mut">{i >= faq.length ? "เพิ่มคำถามใหม่" : `คำถามที่ ${i + 1}`}</legend>
        <input name={`q${i}`} aria-label={`คำถามที่ ${i + 1}`} className="pt-inp" placeholder="คำถาม" defaultValue={str(it.q)} maxLength={80} />
        <textarea name={`a${i}`} aria-label={`คำตอบที่ ${i + 1}`} className="pt-inp" placeholder="คำตอบ" rows={2} defaultValue={str(it.a)} maxLength={240} style={{ marginTop: 8 }} />
        {i < faq.length && <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="checkbox" name={`del${i}`} value="1" /> ลบคำถามนี้</label>}
      </fieldset>)}
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">บันทึกคำถาม</SubmitButton></div>
    </form>}

    {Object.keys(EDIT_FIELDS).filter((b) => e.blocks.includes(b)).map((b) => {
      const spec = EDIT_FIELDS[b], cur = (c[b] ?? {}) as Any;
      const list = spec.list ? ((cur[spec.list.key] as Any[] | undefined) ?? []) : [];
      const rows = spec.list ? [...list, ...Array.from({ length: Math.min(2, spec.list.max - list.length) }, () => ({}) as Any)] : [];
      const input = (fd: Field, name: string, v: unknown, aria: string) => fd.kind === "check"
        ? <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 6 }}><input type="checkbox" name={name} value="1" defaultChecked={v === true} aria-label={aria} /> {fd.label}</label>
        : fd.kind === "image"
        ? <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}><input type="hidden" name={name} value={str(v)} />
            {thumb(v) && <img src={thumb(v)!} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flex: "none" }} />}
            <div style={{ flex: 1 }}><ImageInput name={name.replace(fd.key, `${fd.key}_new`)} label={thumb(v) ? `เปลี่ยน${fd.label}` : `ใส่${fd.label}`} max={1600} limit={1} /></div></div>
        : fd.kind === "longtext"
        ? <textarea name={name} aria-label={aria} className="pt-inp" rows={3} defaultValue={str(v)} maxLength={fd.max} style={{ marginTop: 6 }} />
        : <input name={name} aria-label={aria} className="pt-inp" defaultValue={str(v)} maxLength={fd.max} inputMode={fd.kind === "number" ? "decimal" : undefined} placeholder={fd.label} style={{ marginTop: 6 }} />;
      return <form key={b} action={editBlockAction} className="pt-card" id={`b-${b}`}><H v={e.version} /><input type="hidden" name="block" value={b} /><input type="hidden" name="n" value={rows.length} />
        <h2 className="pt-h" style={{ fontSize: 17 }}>{BLOCK_LABEL[b]}{e.hidden.includes(b) && <span className="pt-sm pt-mut"> · ซ่อนอยู่</span>}</h2>
        {(spec.top ?? []).map((fd) => <div key={fd.key}><label className="pt-lbl">{fd.label}{input(fd, `top_${fd.key}`, cur[fd.key], `${BLOCK_LABEL[b]} ${fd.label}`)}</label></div>)}
        {!spec.list && spec.fields.map((fd) => <div key={fd.key}><label className="pt-lbl">{fd.label}{input(fd, fd.key, cur[fd.key], `${BLOCK_LABEL[b]} ${fd.label}`)}</label></div>)}
        {spec.list && rows.map((it, i) => <fieldset key={i} style={{ border: 0, borderTop: "1px solid #eef0f4", margin: "12px 0 0", padding: "12px 0 0" }}>
          <legend className="pt-sm pt-mut">{i >= list.length ? `เพิ่ม${spec.list!.label}ใหม่` : `${spec.list!.label}ที่ ${i + 1}`}</legend>
          {spec.fields.map((fd) => <div key={fd.key}>{input(fd, `${fd.key}${i}`, it[fd.key], `${spec.list!.label}ที่ ${i + 1} ${fd.label}`)}</div>)}
          {i < list.length && <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="checkbox" name={`del${i}`} value="1" /> ลบ{spec.list!.label}นี้</label>}
        </fieldset>)}
        <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">{`บันทึก${BLOCK_LABEL[b]}`}</SubmitButton></div>
      </form>;
    })}

    <form action={editLogoAction} className="pt-card" id="logo"><H v={e.version} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>โลโก้ร้าน</h2>
      {thumb((c.brand as Any | undefined)?.logo) && <img src={thumb((c.brand as Any).logo)!} alt="โลโก้ตอนนี้" style={{ height: 48, marginTop: 8 }} />}
      <ImageInput name="logo" label="เลือกโลโก้" max={600} limit={1} />
      {!!(c.brand as Any | undefined)?.logo && <label className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 10 }}><input type="checkbox" name="nologo" value="1" /> ไม่ใช้โลโก้</label>}
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">บันทึกโลโก้</SubmitButton></div>
    </form>

    {e.blocks.some((b) => !e.required.includes(b)) && <form action={editVisibilityAction} className="pt-card" id="visibility"><H v={e.version} />
      <h2 className="pt-h" style={{ fontSize: 17 }}>เปิด/ปิดส่วนต่างๆ ของเว็บ</h2>
      <p className="pt-sm pt-mut">ส่วนที่จำเป็น เช่น หน้าแรก เวลาเปิด LINE และแผนที่ ปิดไม่ได้</p>
      {e.blocks.map((b) => <label key={b} className="pt-sm" style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input type="checkbox" name="show" value={b} defaultChecked={!e.hidden.includes(b)} disabled={e.required.includes(b)} /> {BLOCK_LABEL[b] ?? b}{e.required.includes(b) && " (จำเป็น)"}</label>)}
      <div style={{ marginTop: 12 }}><SubmitButton className="pt-btn" pending="กำลังบันทึก…">บันทึกการเปิด/ปิด</SubmitButton></div>
    </form>}

    {e.canUndo && <form action={undoEditAction}><H v={e.version} /><SubmitButton className="pt-btn o" pending="กำลังย้อนกลับ…">ย้อนกลับการแก้ล่าสุด</SubmitButton></form>}
    <p className="pt-sm pt-mut" style={{ textAlign: "center" }}>อยากเปลี่ยนสี หน้าตา ลำดับ หรือเพิ่มส่วนใหม่ พิมพ์บอกทีมงานในแชท LINE ได้</p>
  </>);
}
