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

/** เชื่อมเว็บกับระบบร้าน Sabai: ที่อยู่ API + คีย์เว็บไซต์ของสาขา (จาก Sabai → ตั้งค่า → สาขา → เชื่อมเว็บไซต์ร้าน) · ว่างทั้งคู่ = เลิกเชื่อม */
export async function setSabaiLinkAction(f: FormData) {
  await requireStaff("clients.edit");
  const client = str(f, "client"), site = str(f, "site");
  const api = str(f, "api").replace(/\/+$/, ""), key = str(f, "key");
  await run(`/clients/${client}`, async () => {
    if (!api && !key) {
      await q(`update sites set sabai_api = null, sabai_key = null where id = $1 and client_id = $2`, [site, client]);
      return;
    }
    if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(api)) throw new Error("ที่อยู่ API ต้องขึ้นต้นด้วย https://");
    // เว้นคีย์ว่าง = ใช้คีย์เดิม (คีย์ไม่แสดงซ้ำบนหน้าจอ)
    if (key && !/^sbw_[0-9a-f]{48}$/.test(key)) throw new Error("คีย์ไม่ถูกต้อง (ขึ้นต้นด้วย sbw_)");
    const r = await q(`update sites set sabai_api = $3, sabai_key = coalesce(nullif($4, ''), sabai_key) where id = $1 and client_id = $2 and (nullif($4, '') is not null or sabai_key is not null) returning id`, [site, client, api, key]);
    if (!r.length) throw new Error("ใส่คีย์เว็บไซต์จาก Sabai ด้วย");
  }, "sabai");
}
