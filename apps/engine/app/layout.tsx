import "./site.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=Kanit:wght@500;700&family=Prompt:wght@500;700&family=Sarabun:wght@400;600&family=Mitr:wght@400;600&family=Chonburi&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
