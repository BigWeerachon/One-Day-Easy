import { NextResponse, type NextRequest } from "next/server";
// ตรวจแบบเร็ว (มีคุกกี้หรือไม่) · การตรวจจริงอยู่ใน requireStaff ทุกหน้า/action/API
const PUBLIC = ["/login", "/api/line/webhook", "/api/cron/"];
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("ode_session")?.value) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
