"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "./auth";
import { q } from "./db";
import { GROUPS, groupsFor, retryEmail } from "./notify";
import { isEmail } from "./email";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
async function run(p: string, fn: () => Promise<unknown>, ok?: string) {
  let err: string | undefined;
  try { await fn(); } catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(`${p}${p.includes("?") ? "&" : "?"}${err ? `err=${encodeURIComponent(err)}` : ok ? `ok=${ok}` : ""}`);
}

/** เลือกรับอีเมลแจ้งเตือนของตัวเอง (เฉพาะกลุ่มที่บทบาทเห็น) */
export async function saveEmailPrefsAction(f: FormData) {
  const me = await requireStaff();
  await run("/account", async () => {
    const prefs = Object.fromEntries(groupsFor(me.role).map((g) => [g, f.get(g) === "on"]));
    await q(`update staff set email_prefs = $2 where id = $1`, [me.id, JSON.stringify(prefs)]);
  }, "prefs");
}
export async function retryEmailAction(f: FormData) {
  await requireStaff("team.manage");
  await run("/settings", () => retryEmail(str(f, "id")));
}
/** อีเมลลูกค้า (ใช้ส่งยืนยันคิว ใบแจ้งหนี้ ใบเสร็จ) · ว่าง = ลบ */
export async function setClientEmailAction(f: FormData) {
  await requireStaff("clients.edit");
  const id = str(f, "client"), email = str(f, "email").toLowerCase();
  await run(`/clients/${id}`, async () => {
    if (email && !isEmail(email)) throw new Error("อีเมลไม่ถูกต้อง");
    await q(`delete from contacts where client_id = $1 and channel = 'Email'`, [id]);
    if (email) await q(`insert into contacts (client_id, channel, value, name) values ($1, 'Email', $2, $2) on conflict (channel, value) do update set client_id = excluded.client_id`, [id, email]);
  });
}
