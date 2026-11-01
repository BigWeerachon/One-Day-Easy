import "./globals.css";
import Nav from "@/components/Nav";
import { unreadCount } from "@/lib/store";
export const metadata = { title: "Studio — One Day Easy" };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const unread = await unreadCount().catch(() => 0);
  return (
    <html lang="th">
      <head><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" /></head>
      <body><div className="s"><Nav unread={unread} /><main className="mn">{children}</main></div></body>
    </html>
  );
}
