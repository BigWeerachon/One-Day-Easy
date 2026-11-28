import { themeFor } from "@ode/blocks/themes";
import type { SiteRow } from "@/lib/sites";
import { sabaiMenu } from "@/lib/sabai";
import OrderForm from "./OrderForm";

/** หน้าสั่งออนไลน์ของเว็บร้าน (เชื่อม Sabai) · ชำระที่ร้านตอนรับของ */
export default async function OrderPage({ site, target, back }: { site: SiteRow; target: { host?: string; slug?: string }; back: string }) {
  const menu = await sabaiMenu(site);
  const t = themeFor(site.template, site.config);
  const style = { "--p": t.primary, "--a": t.accent, "--bg": t.bg, "--sf": t.surface, "--tx": t.text, "--r": `${t.radius}px`, "--font": t.font, "--hfont": t.heading } as React.CSSProperties;
  return (
    <div className={"site" + (t.dark ? " dark" : "")} style={style}>
      <nav className="top"><div className="wrap row"><a className="brand" href={back}>← {site.clientName}</a></div></nav>
      <section className="sx"><div className="wrap">
        <h1>สั่งออนไลน์</h1>
        {!menu?.ordering ? <p>ตอนนี้ร้านยังไม่เปิดรับออเดอร์ออนไลน์ ติดต่อร้านได้ที่หน้าแรก</p>
          : <OrderForm target={target} items={menu.items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), available: i.available, category: i.category }))} />}
      </div></section>
    </div>
  );
}
