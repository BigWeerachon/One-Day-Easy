import "./globals.css";
export const metadata = { title: "Studio — One Day Easy" };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" /></head>
      <body>{children}</body>
    </html>
  );
}
