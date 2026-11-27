import QRCode from "qrcode";
import { TEMPLATES } from "@ode/blocks/blocks";
import { themeFor } from "@ode/blocks/themes";
import { specTheme, visibleBlocks } from "@ode/blocks/templates";
import { promptPayPayload } from "@ode/blocks/promptpay";
import type { SiteRow } from "@/lib/sites";
import { sabaiMenu } from "@/lib/sabai";

type Any = Record<string, unknown>;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const thb = (n: number | null) => (n == null ? "" : `฿${n.toLocaleString("th-TH")}`);

/** รูป: อนุญาตเฉพาะ https: หรือไฟล์ของลูกค้า (file:<id>) · อย่างอื่นไม่แสดง */
function src(v: unknown, fileQuery: string): string | null {
  const s = str(v);
  if (/^file:\d+$/.test(s)) return `/files/${s.slice(5)}${fileQuery}`;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}
const Img = ({ s, alt, q, className }: { s: unknown; alt: string; q: string; className?: string }) => { const u = src(s, q); return u ? <img src={u} alt={alt} loading="lazy" className={className} /> : null; };
const Section = ({ id, title, children, alt }: { id: string; title?: string; children: React.ReactNode; alt?: boolean }) => (
  <section id={id} className={"sx" + (alt ? " alt" : "")}><div className="wrap">{!!title && <h2>{title}</h2>}{children}</div></section>
);

async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

export default async function Site({ site, fileQuery = "", orderHref, sellHref }: { site: SiteRow; fileQuery?: string; orderHref?: string; sellHref?: string }) {
  const c = { ...(site.config as Record<string, Any>) };
  // เชื่อม Sabai: เมนูบนเว็บมาจาก POS (ราคาและของหมดตรงกับหน้าร้าน) · ใช้รูปจาก POS ถ้ามี ไม่มีก็ใช้รูปเดิมในเว็บที่ชื่อตรงกัน
  const live = await sabaiMenu(site);
  if (live && live.items.length) {
    const old = new Map(arr<Any>(c.menu?.items).map((m) => [str(m.name), m]));
    c.menu = { ...(c.menu ?? {}), items: live.items.map((i) => ({ ...(old.get(i.name) ?? {}), name: i.name, price: Number(i.price), img: i.imageUrl ?? old.get(i.name)?.img, soldOut: !i.available })) };
  }
  const canOrder = !!(live?.ordering && orderHref);
  // เทมเพลตที่ล็อกเวอร์ชันแล้ว: ลำดับ หน้าตา สี ฟอนต์ มาจากเทมเพลต · ลูกค้าปิดได้เฉพาะบล็อกที่ไม่บังคับ
  const spec = site.spec;
  const tpl = TEMPLATES.find((t) => t.id === site.template);
  const t = spec ? specTheme(spec) : themeFor(site.template, site.config);
  const order = spec ? visibleBlocks(spec, c).map((b) => b.type) : (tpl?.blocks ?? Object.keys(c)).filter((b) => c[b] && typeof c[b] === "object" && !["theme", "hidden", "brand"].includes(b));
  const variant = (b: string) => spec?.blocks.find((x) => x.type === b)?.variant ?? "";
  const logo = src(c.brand?.logo, fileQuery);
  const hero = c.hero ?? {}, line = c.line ?? {}, hours = c.hours ?? {};
  const lineUrl = /^@[\w.-]{2,}$/.test(str(line.id)) ? `https://line.me/R/ti/p/${encodeURIComponent(str(line.id))}` : null;
  const style = { "--p": t.primary, "--a": t.accent, "--bg": t.bg, "--sf": t.surface, "--tx": t.text, "--r": `${t.radius}px`, "--font": t.font, "--hfont": t.heading } as React.CSSProperties;
  const blocks: Record<string, () => Promise<React.ReactNode> | React.ReactNode> = {
    hero: () => (
      <header className={"hero" + (variant("hero") === "cover" && src(hero.image, fileQuery) ? " v-cover" : "")} style={variant("hero") === "cover" && src(hero.image, fileQuery) ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url("${src(hero.image, fileQuery)}")` } : undefined}><div className="wrap hero-in">
        <div>{!!hours.open && <div className="eyebrow">เปิด {str(hours.days)} {str(hours.open)}–{str(hours.close)}</div>}
          <h1>{str(hero.title) || site.clientName}</h1>{!!hero.subtitle && <p className="lead">{str(hero.subtitle)}</p>}
          {!!hero.cta && <a className="cta" href={lineUrl ?? "#contact"}>{str(hero.cta)}</a>}</div>
        {variant("hero") !== "cover" && <Img s={hero.image} alt={str(hero.title) || site.clientName} q={fileQuery} className="hero-img" />}
      </div></header>),
    menu: () => <Section id="menu" title="เมนู"><div className={variant("menu") === "list" ? "vlist" : "grid"}>{arr<Any>(c.menu.items).map((m, i) => (
      <div className="card item" key={i}><Img s={m.img} alt={str(m.name)} q={fileQuery} /><div className="row"><b>{str(m.name)}</b><span className="price">{thb(num(m.price))}</span></div>
        <div className="meta">{num(m.spicy) ? "🌶".repeat(Math.min(3, num(m.spicy)!)) : ""} {m.tag ? <span className="tag">{str(m.tag)}</span> : null}{m.soldOut ? <span className="tag">หมดชั่วคราว</span> : null}</div></div>))}</div>
      {canOrder && <p style={{ marginTop: 16 }}><a className="cta" href={orderHref}>สั่งออนไลน์ รับที่ร้าน</a></p>}</Section>,
    cars: () => <Section id="cars" title="รถในเต็นท์"><div className={variant("cars") === "list" ? "vlist" : "grid"}>{arr<Any>(c.cars.items).map((m, i) => (
      <div className="card item" key={i}><Img s={m.img} alt={`${str(m.brand)} ${str(m.model)}`} q={fileQuery} />
        <div className="row"><b>{str(m.brand)} {str(m.model)}</b><span className="price">{m.sold ? "ขายแล้ว" : thb(num(m.price))}</span></div>
        <div className="meta">ปี {num(m.year) ?? "-"} · {(num(m.mileage) ?? 0).toLocaleString("th-TH")} กม.{m.gear ? ` · ${str(m.gear)}` : ""}{m.fuel ? ` · ${str(m.fuel)}` : ""}</div>
        {m.sold ? <span className="tag">ขายแล้ว</span> : null}</div>))}</div></Section>,
    sellcar: () => <Section id="sellcar" title={str(c.sellcar.title) || "อยากขายรถ? ให้เราประเมินราคา"} alt>
      <p>{str(c.sellcar.note) || "ส่งข้อมูลและรูปรถมาให้เรา ทีมงานติดต่อกลับเพื่อเสนอราคา"}</p>
      {sellHref ? <a className="cta" href={sellHref}>ส่งข้อมูลรถ</a> : lineUrl ? <a className="cta" href={lineUrl}>ส่งข้อมูลทาง LINE</a> : null}</Section>,
    sets: () => <Section id="sets" title="ชุดคุ้มค่า" alt><div className="grid">{arr<Any>(c.sets.items).map((m, i) => (
      <div className="card item" key={i}><b>{str(m.name)}</b><div className="meta">สำหรับ {num(m.for) ?? "-"} คน</div><div className="row"><span className="price">{thb(num(m.price))}</span>{num(m.was) ? <s className="meta">{thb(num(m.was))}</s> : null}</div></div>))}</div></Section>,
    rooms: () => <Section id="rooms" title="ห้องพัก"><div className="grid">{arr<Any>(c.rooms.items).map((m, i) => (
      <div className="card item" key={i}><Img s={arr(m.img)[0]} alt={str(m.name)} q={fileQuery} /><b>{str(m.name)}</b><div className="row"><span className="meta">{num(m.guests) ?? "-"} ท่าน</span><span className="price">{thb(num(m.price))}/คืน</span></div></div>))}</div></Section>,
    services: () => <Section id="services" title="บริการ"><div className="grid">{arr<Any>(c.services.items).map((m, i) => (
      <div className="card item" key={i}><b>{str(m.name)}</b>{!!m.desc && <p className="meta">{str(m.desc)}</p>}<div className="row"><span className="meta">{str(m.duration)}</span><span className="price">{thb(num(m.price))}</span></div></div>))}</div></Section>,
    courses: () => <Section id="courses" title="คอร์สเรียน"><div className="grid">{arr<Any>(c.courses.items).map((m, i) => (
      <div className="card item" key={i}><b>{str(m.name)}</b><div className="meta">{str(m.age)} {str(m.schedule)}</div><span className="price">{thb(num(m.price))}</span></div>))}</div></Section>,
    products: () => <Section id="products" title="สินค้า"><div className="grid">{arr<Any>(c.products.items).map((m, i) => (
      <div className="card item" key={i}><Img s={m.img} alt={str(m.name)} q={fileQuery} /><div className="row"><b>{str(m.name)}</b><span className="price">{thb(num(m.price))}</span></div>{num(m.stock) === 0 && <span className="tag">สินค้าหมด</span>}</div>))}</div></Section>,
    pricing: () => <Section id="pricing" title="แพ็กเกจ" alt><div className="grid">{arr<Any>(c.pricing.plans).map((m, i) => (
      <div className="card item plan" key={i}><b>{str(m.name)}</b><div className="big">{thb(num(m.monthly))}<small>/เดือน</small></div>{num(m.yearly) ? <div className="meta">หรือ {thb(num(m.yearly))}/ปี</div> : null}
        <ul>{arr<string>(m.features).slice(0, 8).map((f, j) => <li key={j}>{str(f)}</li>)}</ul></div>))}</div></Section>,
    reviews: () => <Section id="reviews" title="รีวิวจากลูกค้า"><div className="stars" aria-label={`คะแนน ${num(c.reviews.rating) ?? "-"} จาก 5`}>{"★".repeat(Math.round(num(c.reviews.rating) ?? 0))} <span className="meta">{num(c.reviews.rating)?.toFixed(1)} · {num(c.reviews.count) ?? 0} รีวิว {c.reviews.source ? `จาก ${str(c.reviews.source)}` : ""}</span></div>
      <div className={variant("reviews") === "quote" ? "quotes" : "grid"}>{arr<Any>(c.reviews.items).slice(0, variant("reviews") === "quote" ? 1 : 6).map((m, i) => <blockquote className="card item" key={i}>“{str(m.text)}”<footer className="meta">— {str(m.name)}</footer></blockquote>)}</div></Section>,
    gallery: () => <Section id="gallery" title="บรรยากาศ"><div className={variant("gallery") === "strip" ? "gallery strip" : "gallery"}>{arr<Any>(c.gallery.images).slice(0, 12).map((m, i) => <Img key={i} s={m.src} alt={str(m.alt)} q={fileQuery} />)}</div></Section>,
    faq: () => <Section id="faq" title="คำถามที่พบบ่อย" alt>{arr<Any>(c.faq.items).slice(0, 10).map((m, i) => <details className="card faq" key={i}><summary>{str(m.q)}</summary><p>{str(m.a)}</p></details>)}</Section>,
    hours: () => null, line: () => null, map: () => null, promptpay: () => null, legal: () => null, // อยู่ในส่วนติดต่อ/ท้ายเว็บ
  };
  const body = await Promise.all(order.map(async (b) => <div key={b}>{await (blocks[b]?.() ?? null)}</div>));
  const lineQr = lineUrl ? await qrSvg(lineUrl) : null;
  let ppQr: string | null = null;
  try { if (c.promptpay?.id) ppQr = await qrSvg(promptPayPayload(str(c.promptpay.id))); } catch { ppQr = null; }
  const map = c.map ?? {}, lat = num(map.lat), lng = num(map.lng);
  const hasContact = lineUrl || hours.open || map.address || ppQr;
  return (
    <div className={"site" + (t.dark ? " dark" : "")} style={style}>
      <nav className="top"><div className="wrap row"><b className="brand">{logo && <img src={logo} alt="" className="logo" />}{site.clientName}</b>{canOrder ? <a className="cta sm" href={orderHref}>สั่งออนไลน์</a> : lineUrl && <a className="cta sm" href={lineUrl}>แอด LINE</a>}</div></nav>
      {body}
      {hasContact && <Section id="contact" title="ติดต่อ & เวลาเปิด" alt><div className="grid">
        {!!(hours.open || hours.days) && <div className="card item"><b>เวลาเปิด</b><p>{str(hours.days)} {str(hours.open)}–{str(hours.close)}</p>{!!hours.last_order && <p className="meta">สั่งรอบสุดท้าย {str(hours.last_order)}</p>}</div>}
        {!!map.address && <div className="card item"><b>ที่ตั้ง</b><p>{str(map.address)}</p>{lat != null && lng != null && <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener">เปิดแผนที่</a>}</div>}
        {lineQr && <div className="card item qr"><b>LINE {str(line.id)}</b><div dangerouslySetInnerHTML={{ __html: lineQr }} /><a className="cta" href={lineUrl!}>แชทกับร้าน</a></div>}
        {ppQr && <div className="card item qr"><b>ชำระผ่านพร้อมเพย์</b><div dangerouslySetInnerHTML={{ __html: ppQr }} /></div>}
      </div></Section>}
      <footer className="foot"><div className="wrap">{!!c.legal?.pdpa && <details><summary>นโยบายความเป็นส่วนตัว</summary><p>{str(c.legal.pdpa)}</p></details>}
        <p className="meta">© {new Date().getFullYear()} {site.clientName} · ทำเว็บโดย One Day Easy</p></div></footer>
    </div>
  );
}
