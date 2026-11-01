"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth-actions";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const WORK = [
  ["/", "งานวันนี้", "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"],
  ["/inbox", "กล่องข้อความ", "M4 5h16v11H8l-4 4z"],
  ["/clients", "ลูกค้า", "M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"],
  ["/builder", "สร้างเว็บ", "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"],
  ["/finance", "การเงิน", "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"],
  ["/settings", "ตั้งค่า & ระบบ", "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6"],
];
const SYS = [
  ["/workflow", "Workflow อัตโนมัติ", "M7.5 6h9M6.5 8l4.5 8M17.5 8L13 16M5 3.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5"],
  ["/spec", "สเปก & Roadmap", "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"],
];
export default function Nav({ unread, allowed, me }: { unread: number; allowed: string[]; me: { name: string; role: Role } }) {
  const p = usePathname();
  const on = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  const item = ([h, l, d]: string[]) => (
    <Link key={h} href={h} className={"ni" + (on(h) ? " on" : "")} aria-current={on(h) ? "page" : undefined}>
      {I(d)}<span>{l}</span>{h === "/inbox" && unread > 0 && <span className="bdg">{unread}</span>}
    </Link>
  );
  return (
    <nav className="sb" aria-label="เมนูหลัก">
      <div className="logo">One Day <span>Easy</span> · Studio</div>
      <div className="srch"><span>ค้นหาลูกค้า, เว็บ, แชท...</span><span className="kbd">⌘K</span></div>
      <div className="grp">งาน</div>{WORK.filter(([h]) => allowed.includes(h)).map(item)}
      <div className="grp">ระบบ</div>{SYS.filter(([h]) => allowed.includes(h)).map(item)}
      <div className="me"><span className="av" style={{ background: "#4f46e5" }}>{me.name.slice(0, 1)}</span><div style={{ flex: 1, minWidth: 0 }}><Link href="/account" style={{ fontWeight: 600, textDecoration: "none" }}>{me.name}</Link><div className="sm mut">{ROLE_LABEL[me.role]}</div></div>
        <form action={logoutAction}><button className="btn o sm" title="ออกจากระบบ">ออก</button></form></div>
    </nav>
  );
}
