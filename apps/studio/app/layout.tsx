import "./globals.css";
import Nav from "@/components/Nav";
import { db } from "@/lib/store";
export const metadata = { title: "Studio — One Day Easy" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  const unread = db.messages.filter((m) => !m.read && m.from === "client").length;
  return (
    <html lang="th">
      <head><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" /></head>
      <body><div className="s"><Nav unread={unread} /><main className="mn">{children}</main></div></body>
    </html>
  );
}
