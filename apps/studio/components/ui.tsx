import type { ReactNode } from "react";
export const Header = ({ crumb, title, children }: { crumb: string; title: string; children?: ReactNode }) => (
  <header className="hd"><div><div className="crumb">{crumb}</div><h1 className="ttl">{title}</h1></div><div className="f">{children}</div></header>
);
export const Card = ({ title, right, children, className = "", pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) => (
  <section className={"card " + className}>{title && <div className="ch"><h2>{title}</h2>{right}</div>}{pad ? <div className="cb">{children}</div> : children}</section>
);
export const Err = ({ msg }: { msg?: string }) => (msg ? <div className="err" role="alert">{msg}</div> : null);
export const Kpi = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: string }) => (
  <div className="card kpi"><div className="mut sm">{label}</div><div className="v" style={{ marginTop: 6 }}>{value}</div>{sub && <div className="sm" style={{ color: tone || "#5d6577" }}>{sub}</div>}</div>
);
export const ago = (min: number) => (min < 60 ? `${min} นาที` : min < 1440 ? `${Math.round(min / 60)} ชม.` : `${Math.round(min / 1440)} วัน`);
export const Av = ({ c, n }: { c: string; n: string }) => <span className="av" style={{ background: c }}>{n.slice(0, 1)}</span>;
