"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "./auth";
import * as T from "./templates";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
async function run(to: (r: unknown) => string, fn: () => Promise<unknown>, ok?: string) {
  let err: string | undefined, r: unknown;
  try { r = await fn(); } catch (e) { err = (e as Error).message; }
  revalidatePath("/templates");
  const p = to(r);
  redirect(`${p}${p.includes("?") ? "&" : "?"}${err ? `err=${encodeURIComponent(err)}` : ok ? `ok=${ok}` : ""}`);
}
const at = (id: string) => `/templates?id=${id}`;

export async function createTemplateAction(f: FormData) {
  const me = await requireStaff("sites.edit");
  const from = str(f, "fromKey") || undefined;
  await run((id) => (id ? at(String(id)) : "/templates?new=1"), () => T.createDraft(me.name, T.specFromForm(f), from), "created");
}
export async function saveDraftAction(f: FormData) {
  await requireStaff("sites.edit");
  const id = str(f, "id");
  await run(() => at(id), () => T.updateDraft(id, T.specFromForm(f)), "saved");
}
export async function checkTemplateAction(f: FormData) {
  await requireStaff("sites.edit");
  const id = str(f, "id");
  await run(() => at(id), () => T.runTemplateChecks(id), "checked");
}
export async function approveTemplateAction(f: FormData) {
  const me = await requireStaff("templates.approve");
  const id = str(f, "id");
  await run(() => at(id), () => T.approveTemplate(id, me.name), "approved");
}
export async function retireTemplateAction(f: FormData) {
  await requireStaff("templates.approve");
  const id = str(f, "id");
  await run(() => at(id), () => T.retireTemplate(id), "retired");
}
export async function deleteDraftAction(f: FormData) {
  await requireStaff("sites.edit");
  await run(() => "/templates", () => T.deleteDraft(str(f, "id")), "deleted");
}
/** ใช้เทมเพลตกับเว็บ หรืออัปเกรดเว็บไปเวอร์ชันใหม่ (ทีละร้าน) */
export async function applyTemplateAction(f: FormData) {
  const me = await requireStaff("sites.edit");
  const id = str(f, "id");
  await run(() => at(id), () => T.applyTemplate(str(f, "site"), id, me.name), "applied");
}
