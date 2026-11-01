import "./portal.css";
// ลิงก์ส่วนตัว: ไม่ให้ค้นหาเจอ · ไม่ส่ง URL (มี token) ไปเว็บอื่นผ่าน Referer
export const metadata = { title: "One Day Easy", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const viewport = { width: "device-width", initialScale: 1 };
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="pt">{children}</div>;
}
