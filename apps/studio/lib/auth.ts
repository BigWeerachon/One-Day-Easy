import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { q, one, tx } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { can, type Perm, type Role } from "./permissions";

export const SESSION_COOKIE = "ode_session";
const SESSION_DAYS = 14;
const MAX_FAILURES = 5, LOCK_MINUTES = 15;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export interface Staff { id: string; email: string; name: string; role: Role; mustChangePassword: boolean }

/** ผู้ใช้ของคำขอนี้ (ตรวจกับฐานข้อมูลทุกครั้ง · cache ภายในคำขอเดียว) */
export const currentStaff = cache(async (): Promise<Staff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  return (await one<Staff>(
    `select s.id, s.email, s.name, s.role, s.must_change_password "mustChangePassword"
     from staff_sessions x join staff s on s.id = x.staff_id
     where x.token_hash = $1 and x.expires_at > now() and s.active`, [sha(token)])) ?? null;
});

export class Forbidden extends Error { constructor(perm: Perm) { super(`ไม่มีสิทธิ์ (${perm})`); } }

/** ใช้ในทุกหน้า/action/API · ไม่ได้ล็อกอิน → /login · ไม่มีสิทธิ์ → Forbidden */
export async function requireStaff(perm?: Perm): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/login");
  if (perm && !can(s.role, perm)) throw new Forbidden(perm);
  return s;
}
/** สำหรับหน้า: ไม่มีสิทธิ์ → กลับหน้าแรกพร้อมข้อความ */
export async function requirePage(perm: Perm): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/login");
  if (s.mustChangePassword) redirect("/account?first=1");
  if (!can(s.role, perm)) redirect(`/forbidden`);
  return s;
}

// ป้องกันการเดาเวลา: อีเมลที่ไม่มีอยู่ก็ใช้เวลาเท่ากัน
let dummyHash: Promise<string> | undefined;

export async function login(emailRaw: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  const lock = await one<{ locked: boolean }>(`select locked_until > now() locked from login_attempts where email = $1`, [email]);
  if (lock?.locked) return { ok: false, error: `ลองผิดหลายครั้ง · รอ ${LOCK_MINUTES} นาทีแล้วลองใหม่` };
  const s = await one<{ id: string; password_hash: string; active: boolean }>(`select id, password_hash, active from staff where email = $1`, [email]);
  const ok = s ? await verifyPassword(password, s.password_hash) : await verifyPassword(password, await (dummyHash ??= hashPassword("dummy-password-0")));
  if (!s || !ok || !s.active) {
    await q(`insert into login_attempts (email, failures) values ($1, 1)
      on conflict (email) do update set failures = case when login_attempts.locked_until < now() then 1 else login_attempts.failures + 1 end,
        locked_until = case when (case when login_attempts.locked_until < now() then 1 else login_attempts.failures + 1 end) >= $2 then now() + interval '1 minute' * $3 else null end`,
      [email, MAX_FAILURES, LOCK_MINUTES]);
    return { ok: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }
  await q(`delete from login_attempts where email = $1`, [email]);
  await startSession(s.id);
  return { ok: true };
}

async function startSession(staffId: string) {
  const token = randomBytes(32).toString("base64url");
  await q(`delete from staff_sessions where expires_at < now()`);
  await q(`insert into staff_sessions (token_hash, staff_id, expires_at) values ($1,$2, now() + interval '1 day' * $3)`, [sha(token), staffId, SESSION_DAYS]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q(`delete from staff_sessions where token_hash = $1`, [sha(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function changePassword(staffId: string, current: string, next: string) {
  const s = await one<{ password_hash: string }>(`select password_hash from staff where id = $1`, [staffId]);
  if (!s || !(await verifyPassword(current, s.password_hash))) throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
  await q(`update staff set password_hash = $2, must_change_password = false where id = $1`, [staffId, await hashPassword(next)]);
  // ออกจากระบบอุปกรณ์อื่นทั้งหมด แล้วเริ่ม session ใหม่ให้เครื่องนี้
  await q(`delete from staff_sessions where staff_id = $1`, [staffId]);
  await startSession(staffId);
}

// ---------- จัดการทีม (owner) ----------
export const listStaff = () => q<Staff & { active: boolean; createdAt: string }>(
  `select id, email, name, role, active, must_change_password "mustChangePassword", created_at::text "createdAt" from staff order by active desc, created_at`);

export async function createStaff(input: { email: string; name: string; role: Role; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("อีเมลไม่ถูกต้อง");
  if (!input.name.trim()) throw new Error("ต้องใส่ชื่อ");
  const r = await q(`insert into staff (email, name, role, password_hash, must_change_password) values ($1,$2,$3,$4,true) on conflict (email) do nothing returning id`,
    [email, input.name.trim(), input.role, await hashPassword(input.password)]);
  if (!r.length) throw new Error("อีเมลนี้มีในทีมแล้ว");
}

/** เปลี่ยนบทบาท/ปิดบัญชี · ห้ามทำให้ไม่เหลือ owner ที่ใช้งานได้ */
export async function updateStaff(actorId: string, id: string, patch: { role?: Role; active?: boolean; resetPassword?: string }) {
  await tx(async (c) => {
    await c.query(`lock table staff in share row exclusive mode`);
    const { rows: [t] } = await c.query(`select role, active from staff where id = $1`, [id]);
    if (!t) throw new Error("ไม่พบสมาชิก");
    const role = patch.role ?? t.role, active = patch.active ?? t.active;
    if (id === actorId && (role !== "owner" || !active)) throw new Error("เปลี่ยนบทบาทหรือปิดบัญชีของตัวเองไม่ได้");
    const { rows: [{ owners }] } = await c.query(`select count(*)::int owners from staff where role = 'owner' and active and id <> $1`, [id]);
    if (!(role === "owner" && active) && owners === 0) throw new Error("ต้องมี Owner ที่ใช้งานได้อย่างน้อย 1 คน");
    await c.query(`update staff set role = $2, active = $3 where id = $1`, [id, role, active]);
    if (patch.resetPassword) await c.query(`update staff set password_hash = $2, must_change_password = true where id = $1`, [id, await hashPassword(patch.resetPassword)]);
    // สิทธิ์เปลี่ยน/ปิดบัญชี/รีเซ็ตรหัส → ตัด session เดิมทันที
    if (patch.role !== undefined || patch.active === false || patch.resetPassword) await c.query(`delete from staff_sessions where staff_id = $1`, [id]);
  });
}
