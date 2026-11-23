"use client";
import { useMemo, useState } from "react";

type Item = { id: string; name: string; price: number; available: boolean; category: string };
const thb = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export default function OrderForm({ items, target }: { items: Item[]; target: { host?: string; slug?: string } }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [ref] = useState(() => `web-${crypto.randomUUID()}`); // กดซ้ำ/ส่งซ้ำ = ออเดอร์เดิม
  const [state, setState] = useState<{ busy?: boolean; done?: { orderNo: string; total: string }; error?: string }>({});
  const total = useMemo(() => items.reduce((a, i) => a + (qty[i.id] ?? 0) * i.price, 0), [items, qty]);
  const cats = [...new Set(items.map((i) => i.category))];
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  if (state.done) return (
    <div className="card item" role="status">
      <b>ร้านได้รับออเดอร์แล้ว</b>
      <p>เลขออเดอร์ <b style={{ fontSize: 28 }}>{state.done.orderNo}</b></p>
      <p className="meta">ยอด ฿{state.done.total} · ชำระที่ร้านตอนรับของ แจ้งเลขออเดอร์กับพนักงาน</p>
    </div>
  );

  async function submit(f: FormData) {
    const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([menuItemId, n]) => ({ menuItemId, qty: n }));
    if (!lines.length) return setState({ error: "เลือกเมนูอย่างน้อย 1 อย่าง" });
    setState({ busy: true });
    const r = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      ...target, externalRef: ref, items: lines,
      customerName: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? ""), pickupAt: String(f.get("pickup") ?? ""), note: String(f.get("note") ?? ""),
    }) }).then((x) => x.json()).catch(() => ({ error: "เชื่อมต่อไม่ได้ ลองอีกครั้ง" }));
    setState(r.orderNo ? { done: r } : { error: r.error ?? "สั่งไม่สำเร็จ" });
  }

  return (
    <form action={submit}>
      {cats.map((c) => (
        <div key={c}><h2>{c}</h2><div className="grid">
          {items.filter((i) => i.category === c).map((i) => (
            <div className="card item" key={i.id}>
              <div className="row"><b>{i.name}</b><span className="price">{thb(i.price)}</span></div>
              {i.available ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="cta sm" onClick={() => set(i.id, -1)} aria-label={`ลด ${i.name}`}>−</button>
                  <span aria-live="polite" aria-label={`${i.name} จำนวน`}>{qty[i.id] ?? 0}</span>
                  <button type="button" className="cta sm" onClick={() => set(i.id, 1)} aria-label={`เพิ่ม ${i.name}`}>+</button>
                </div>
              ) : <span className="tag">หมดชั่วคราว</span>}
            </div>
          ))}
        </div></div>
      ))}
      <div className="card item" style={{ marginTop: 24 }}>
        <label>ชื่อ<input name="name" required maxLength={60} autoComplete="name" /></label>
        <label>เบอร์โทร<input name="phone" required inputMode="tel" autoComplete="tel" pattern="[0-9+ -]{9,20}" /></label>
        <label>มารับกี่โมง (ไม่บังคับ)<input name="pickup" maxLength={40} placeholder="เช่น 12:30" /></label>
        <label>หมายเหตุ (ไม่บังคับ)<input name="note" maxLength={200} /></label>
        <p><b>รวม {thb(total)}</b> · ชำระที่ร้าน</p>
        {state.error && <p role="alert" className="tag">{state.error}</p>}
        <button className="cta" disabled={state.busy}>{state.busy ? "กำลังส่ง…" : "ส่งออเดอร์"}</button>
      </div>
    </form>
  );
}
