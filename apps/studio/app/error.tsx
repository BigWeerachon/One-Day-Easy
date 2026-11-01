"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bd" style={{ paddingTop: 48 }}>
      <div className="err" role="alert"><b>โหลดข้อมูลไม่สำเร็จ</b><div className="sm">{error.message || "ฐานข้อมูลไม่ตอบสนอง"}</div></div>
      <div className="note">ตรวจว่าตั้ง <span className="mono">DATABASE_URL</span> ใน <span className="mono">apps/studio/.env.local</span> แล้ว และรัน <span className="mono">npm run db:setup -w apps/studio</span></div>
      <div><button className="btn o" onClick={reset}>ลองใหม่</button></div>
    </div>
  );
}
