"use client";
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (<div className="pt-wrap"><div className="pt-bd"><div className="pt-err">เกิดข้อผิดพลาด กรุณาลองใหม่ หรือทักทีมงานทาง LINE</div><button className="pt-btn o" onClick={reset}>ลองใหม่</button></div></div>);
}
