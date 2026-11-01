import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/auth";
import { loginAction } from "@/lib/auth-actions";
import SubmitButton from "@/components/SubmitButton";
export const metadata = { title: "เข้าสู่ระบบ — Studio" };
export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  const { err, next = "/" } = await searchParams;
  if (await currentStaff()) redirect("/");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={loginAction} className="card" style={{ width: "100%", maxWidth: 380, padding: 28 }}>
        <div className="logo" style={{ padding: 0, marginBottom: 6 }}>One Day <span>Easy</span> · Studio</div>
        <h1 className="ttl" style={{ fontSize: 20, marginBottom: 18 }}>เข้าสู่ระบบ</h1>
        {err && <div className="err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
        <input type="hidden" name="next" value={next} />
        <div className="list">
          <label className="sm">อีเมล<input className="inp" name="email" type="email" autoComplete="username" required autoFocus /></label>
          <label className="sm">รหัสผ่าน<input className="inp" name="password" type="password" autoComplete="current-password" required /></label>
          <SubmitButton pending="กำลังเข้าสู่ระบบ…">เข้าสู่ระบบ</SubmitButton>
        </div>
        <p className="sm mut" style={{ marginTop: 16 }}>ลืมรหัสผ่าน? ติดต่อ Owner ของทีมให้รีเซ็ต</p>
      </form>
    </main>
  );
}
