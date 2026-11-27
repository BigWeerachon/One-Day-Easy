import { themeFor } from "@ode/blocks/themes";
import type { SiteRow } from "@/lib/sites";
import SellForm from "./SellForm";

const hasSell = (site: SiteRow) => "sellcar" in site.config || JSON.stringify(site.spec ?? {}).includes('"sellcar"');
export default function SellPage({ site, target, back }: { site: SiteRow; target: { slug?: string }; back: string }) {
  const t = themeFor(site.template, site.config);
  const style = { "--p": t.primary, "--a": t.accent, "--bg": t.bg, "--sf": t.surface, "--tx": t.text, "--r": `${t.radius}px`, "--font": t.font, "--hfont": t.heading } as React.CSSProperties;
  const sc = (site.config.sellcar ?? {}) as { title?: string; note?: string };
  return (
    <div className={"site" + (t.dark ? " dark" : "")} style={style}>
      <nav className="top"><div className="wrap row"><a className="brand" href={back}>← {site.clientName}</a></div></nav>
      <section className="sx"><div className="wrap">
        <h1>{sc.title || "ขายรถให้เรา"}</h1>
        {sc.note && <p>{sc.note}</p>}
        {hasSell(site) ? <SellForm target={target} /> : <p>ร้านนี้ยังไม่เปิดรับข้อมูลขายรถ</p>}
      </div></section>
    </div>
  );
}
