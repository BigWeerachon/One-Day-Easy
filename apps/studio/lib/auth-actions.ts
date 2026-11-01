"use server";
import { redirect } from "next/navigation";
import { login, logout, changePassword, requireStaff, createStaff, updateStaff } from "./auth";
import { validatePassword, ROLES, type Role } from "./permissions";
import { revalidatePath } from "next/cache";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");
const back = (p: string, err?: string) => redirect(err ? `${p}${p.includes("?") ? "&" : "?"}err=${encodeURIComponent(err)}` : p);
// เฉพาะ path ภายในแอป · กัน open redirect
const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");

export async function loginAction(f: FormData) {
  const next = safeNext(s(f, "next"));
  const r = await login(s(f, "email"), s(f, "password"));
  if (!r.ok) back(`/login?next=${encodeURIComponent(next)}`, r.error);
  redirect(next);
}
export async function logoutAction() {
  await logout();
  redirect("/login");
}
export async function changePasswordAction(f: FormData) {
  const me = await requireStaff();
  const next = s(f, "next"), err = validatePassword(next);
  if (err) back("/account", err);
  if (next !== s(f, "confirm")) back("/account", "รหัสผ่านใหม่สองช่องไม่ตรงกัน");
  let msg: string | undefined;
  try { await changePassword(me.id, s(f, "current"), next); } catch (e) { msg = (e as Error).message; }
  if (msg) back("/account", msg);
  redirect("/account?ok=1");
}

const asRole = (v: string): Role => { if (!(ROLES as readonly string[]).includes(v)) throw new Error("บทบาทไม่ถูกต้อง"); return v as Role; };
async function teamAct(fn: (actorId: string) => Promise<void>) {
  const me = await requireStaff("team.manage");
  let msg: string | undefined;
  try { await fn(me.id); } catch (e) { msg = (e as Error).message; }
  revalidatePath("/settings");
  back("/settings", msg);
}
export async function addStaffAction(f: FormData) {
  await teamAct(async () => {
    const pw = s(f, "password"); const e = validatePassword(pw); if (e) throw new Error(e);
    await createStaff({ email: s(f, "email"), name: s(f, "name"), role: asRole(s(f, "role")), password: pw });
  });
}
export async function updateStaffAction(f: FormData) {
  await teamAct(async (actor) => {
    const pw = s(f, "reset");
    if (pw) { const e = validatePassword(pw); if (e) throw new Error(e); }
    await updateStaff(actor, s(f, "id"), {
      role: f.has("role") ? asRole(s(f, "role")) : undefined,
      active: f.has("active") ? s(f, "active") === "1" : undefined,
      resetPassword: pw || undefined,
    });
  });
}
