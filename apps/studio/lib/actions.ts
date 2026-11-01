"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as S from "./store";
import { validateBlock, runChecks, TEMPLATES } from "./blocks";
import type { Stage, Actor } from "./workflow";
import type { DocType } from "./money";

const withErr = (p: string, err?: string) => (err ? `${p}${p.includes("?") ? "&" : "?"}err=${encodeURIComponent(err)}` : p);
// แปลง error จาก DB (เช่น trigger) ให้อ่านได้ · redirect อยู่นอก try เพราะ Next ใช้ throw
async function run(p: string, fn: () => Promise<unknown>) {
  let err: string | undefined;
  try { await fn(); } catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(withErr(p, err));
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const satang = (f: FormData, k: string) => Math.round(Number(f.get(k)) * 100);

export async function moveJobAction(f: FormData) {
  await run(str(f, "back") || "/", () => S.moveJob(str(f, "job"), str(f, "to") as Stage, str(f, "by") as Actor, str(f, "reason")));
}
export async function addClientAction(f: FormData) {
  const name = str(f, "name");
  if (!name) redirect(withErr("/clients", "ต้องใส่ชื่อร้าน"));
  let id = "", err: string | undefined;
  try { id = await S.addClient({ name, kind: str(f, "kind") || "อื่นๆ", contact: str(f, "contact") || "-", channel: str(f, "channel") || "LINE" }); }
  catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(err ? withErr("/clients", err) : `/clients/${id}`);
}
export async function addNoteAction(f: FormData) {
  const id = str(f, "client"), note = str(f, "note");
  await run(`/clients/${id}`, async () => { if (note) await S.addNote(id, note); });
}
export async function updateJobFlagsAction(f: FormData) {
  await run(str(f, "back") || "/", () => S.setJobFlags(str(f, "job"), f.get("checklist") === "on", f.get("pdpa") === "on"));
}
export async function issueDocAction(f: FormData) {
  await run("/finance", async () => {
    const total = satang(f, "total");
    if (!(total > 0)) throw new Error("ยอดต้องมากกว่า 0");
    await S.issueDoc(str(f, "type") as DocType, str(f, "client"), total, str(f, "job") || undefined);
  });
}
export async function addSlipAction(f: FormData) {
  await run("/finance", async () => {
    const amount = satang(f, "amount");
    if (!(amount > 0)) throw new Error("ยอดสลิปต้องมากกว่า 0");
    await S.addSlip(str(f, "doc"), amount);
  });
}
export async function verifySlipAction(f: FormData) { await run("/finance", () => S.verifySlip(str(f, "slip"), f.get("accept") === "1")); }
export async function voidDocAction(f: FormData) { await run("/finance", () => S.voidDoc(str(f, "doc"))); }
export async function retryTaskAction(f: FormData) { await run("/workflow", () => S.retryTask(str(f, "task"))); }
export async function replyAction(f: FormData) {
  const id = str(f, "client");
  await run(`/inbox?c=${id}`, () => S.reply(id, str(f, "text")));
}
export async function saveBlockAction(f: FormData) {
  const site = str(f, "site"), type = str(f, "block");
  await run(`/builder?site=${site}&block=${type}`, async () => {
    let data: unknown;
    try { data = JSON.parse(String(f.get("json"))); } catch { throw new Error("JSON ไม่ถูกต้อง"); }
    const e = validateBlock(type, data); if (e) throw new Error(`${type}: ${e}`);
    const s = await S.getSite(site); if (!s) throw new Error("ไม่พบเว็บ");
    const config = { ...s.config, [type]: data };
    const tpl = TEMPLATES.find((t) => t.id === s.template)!;
    await S.saveSiteConfig(site, config, "Big", `แก้ ${type}`, runChecks(tpl, config).filter((c) => c.ok).length);
  });
}
export async function removeBlockAction(f: FormData) {
  const site = str(f, "site"), type = str(f, "block");
  await run(`/builder?site=${site}`, async () => {
    const s = await S.getSite(site); if (!s) throw new Error("ไม่พบเว็บ");
    const config = { ...s.config }; delete config[type];
    const tpl = TEMPLATES.find((t) => t.id === s.template)!;
    await S.saveSiteConfig(site, config, "Big", `ลบ ${type}`, runChecks(tpl, config).filter((c) => c.ok).length);
  });
}
export async function rollbackAction(f: FormData) { const site = str(f, "site"); await run(`/builder?site=${site}`, () => S.rollbackSite(site)); }
export async function createSiteAction(f: FormData) {
  let id = "", err: string | undefined;
  try { id = await S.createSiteForJob(str(f, "job"), str(f, "template")); } catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(err ? withErr(`/builder?job=${str(f, "job")}`, err) : `/builder?site=${id}`);
}
