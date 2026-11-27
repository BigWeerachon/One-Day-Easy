"use client";
import { useState } from "react";
import { SELL_CAR_PHOTOS, GEARS, parseSellCar } from "@ode/blocks/leads";

const field: React.CSSProperties = { display: "block", width: "100%", minHeight: 44, padding: "8px 10px", marginTop: 4, borderRadius: 8, border: "1px solid #8888", font: "inherit" };
const F = ({ label, name, ...p }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) =>
  <label style={{ display: "block", marginTop: 12 }}>{label}<input name={name} style={field} {...p} /></label>;

/** ย่อรูปในเครื่องก่อนส่ง (ด้านยาว 1280px, JPEG) · Vercel รับ body ได้ไม่เกิน 4.5 MB ต่อคำขอ */
async function shrink(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.75));
    return b && b.size < f.size ? b : f;
  } catch { return f; }
}

/** ฟอร์ม "ขายรถให้เรา" · ตรวจก่อนส่ง (กติกาเดียวกับฝั่ง Studio) */
export default function SellForm({ target }: { target: { slug?: string } }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: boolean }>({});
  if (state.done) return <div className="card item" role="status"><b>ส่งข้อมูลรถแล้ว ✓</b><p className="meta">ร้านได้รับข้อมูลแล้ว จะติดต่อกลับทางเบอร์ที่ให้ไว้</p></div>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = (fd.getAll("photos") as File[]).filter((f) => f.size > 0);
    const raw = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "photos")) as Record<string, unknown>;
    const r = parseSellCar(raw, files.length);
    if (!r.ok) return setState({ error: r.error });
    setState({ busy: true });
    const body = new FormData();
    for (const [k, v] of Object.entries(raw)) body.set(k, String(v));
    if (target.slug) body.set("slug", target.slug);
    for (const f of files) { const b = await shrink(f); body.append("photos", b, b === f ? f.name : "photo.jpg"); }
    const res = await fetch("/api/lead", { method: "POST", body }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setState(res?.ok ? { done: true } : { error: j.error ?? "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" });
  }
  return (
    <form onSubmit={submit} noValidate className="card item" style={{ maxWidth: 560 }}>
      <F label="ชื่อ" name="name" autoComplete="name" required />
      <F label="เบอร์โทร" name="phone" type="tel" autoComplete="tel" required />
      <F label="จังหวัดที่รถอยู่" name="province" required />
      <F label="ยี่ห้อ" name="brand" placeholder="เช่น Toyota" required />
      <F label="รุ่น" name="model" placeholder="เช่น Yaris 1.2 G" required />
      <F label="ปีรถ (ค.ศ.)" name="year" inputMode="numeric" placeholder="2019" required />
      <F label="เลขไมล์ (กม.)" name="mileage" inputMode="numeric" required />
      <fieldset style={{ marginTop: 12, border: 0, padding: 0 }}><legend>เกียร์</legend>
        {GEARS.map((g) => <label key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, marginRight: 16 }}><input type="radio" name="gear" value={g} />{g}</label>)}
      </fieldset>
      <F label="สี (ไม่บังคับ)" name="color" />
      <F label="ราคาที่ต้องการ (บาท, ไม่บังคับ)" name="asking" inputMode="numeric" />
      <label style={{ display: "block", marginTop: 12 }}>รายละเอียดเพิ่มเติม (ไม่บังคับ)<textarea name="note" maxLength={300} style={{ ...field, minHeight: 88 }} /></label>
      <label style={{ display: "block", marginTop: 12 }}>รูปรถ {SELL_CAR_PHOTOS.min}–{SELL_CAR_PHOTOS.max} รูป (หน้า หลัง ข้าง ภายใน เลขไมล์)
        <input name="photos" type="file" accept={SELL_CAR_PHOTOS.mimes.join(",")} multiple style={field} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, minHeight: 44 }}>
        <input type="checkbox" name="consent" value="1" style={{ width: 22, height: 22 }} />
        <span>ยินยอมให้ร้านเก็บชื่อ เบอร์ และรูปรถ เพื่อติดต่อเสนอราคาเท่านั้น</span></label>
      {state.error && <p role="alert" style={{ marginTop: 12 }}>⚠ {state.error}</p>}
      <button className="cta" style={{ marginTop: 16, minHeight: 44 }} disabled={state.busy}>{state.busy ? "กำลังส่ง…" : "ส่งข้อมูลรถ"}</button>
    </form>
  );
}
