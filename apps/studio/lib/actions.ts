"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, moveJob, issueDoc, verifySlip, retryTask, saveSiteVersion, rollbackSite, emit } from "./store";
import { validateBlock } from "./blocks";
import type { Stage, Actor } from "./workflow";
import type { DocType } from "./money";

const back = (p: string, err?: string) => redirect(err ? `${p}${p.includes("?") ? "&" : "?"}err=${encodeURIComponent(err)}` : p);
const run = (p: string, fn: () => void) => { let err: string | undefined; try { fn(); } catch (e) { err = (e as Error).message; } revalidatePath("/", "layout"); back(p, err); };

export async function moveJobAction(f: FormData) {
  run(String(f.get("back") || "/"), () => moveJob(String(f.get("job")), f.get("to") as Stage, f.get("by") as Actor, String(f.get("reason") || "")));
}
export async function addClientAction(f: FormData) {
  const name = String(f.get("name") || "").trim();
  if (!name) return back("/clients", "ต้องใส่ชื่อร้าน");
  const id = "c" + (db.clients.length + 1) + Date.now().toString(36);
  db.clients.unshift({ id, name, kind: String(f.get("kind") || "อื่นๆ"), status: "lead", pkg: "—", channel: (f.get("channel") as "LINE") || "LINE", contact: String(f.get("contact") || "-"), color: "#4f46e5", lastContactMin: 0, notes: [] });
  db.jobs.unshift({ id: "j" + id, clientId: id, title: name, stage: "new_chat", checksPassed: 0, checklistDone: false, pdpa: false, approved: false, editRounds: 0, slaHours: 8, assignee: "มิ้น" });
  emit("client.created", { actor: "human", source: "human" });
  emit("job.created", { jobId: "j" + id, actor: "system", source: "system" });
  revalidatePath("/", "layout");
  redirect(`/clients/${id}`);
}
export async function addNoteAction(f: FormData) {
  const c = db.clients.find((x) => x.id === f.get("client"));
  const t = String(f.get("note") || "").trim();
  if (c && t) c.notes.unshift(t);
  revalidatePath("/", "layout");
}
export async function updateJobFlagsAction(f: FormData) {
  const j = db.jobs.find((x) => x.id === f.get("job"));
  if (j) { j.checklistDone = f.get("checklist") === "on"; j.pdpa = f.get("pdpa") === "on"; if (j.pdpa) emit("consent.given", { jobId: j.id, actor: "client", source: "system" }); }
  revalidatePath("/", "layout");
}
export async function issueDocAction(f: FormData) {
  run("/finance", () => {
    const total = Math.round(Number(f.get("total")) * 100);
    if (!(total > 0)) throw new Error("ยอดต้องมากกว่า 0");
    const jobId = String(f.get("job") || "") || undefined;
    issueDoc(f.get("type") as DocType, String(f.get("client")), total, jobId);
    const j = jobId && db.jobs.find((x) => x.id === jobId);
    if (j && j.stage === "invoice" && f.get("type") === "INV") moveJob(j.id, "payment", "system");
  });
}
export async function addSlipAction(f: FormData) {
  run("/finance", () => {
    const amount = Math.round(Number(f.get("amount")) * 100);
    const docNo = String(f.get("doc"));
    if (!db.docs.find((d) => d.no === docNo)) throw new Error("ไม่พบเลขที่เอกสาร");
    db.slips.unshift({ id: "sl" + Date.now(), docNo, amount, status: "pending", at: new Date().toISOString() });
    emit("slip.received", { actor: "client", source: "system", after: amount });
  });
}
export async function verifySlipAction(f: FormData) { run("/finance", () => verifySlip(String(f.get("slip")), f.get("accept") === "1")); }
export async function voidDocAction(f: FormData) {
  run("/finance", () => { const d = db.docs.find((x) => x.no === f.get("doc")); if (!d || d.status === "paid") throw new Error("ยกเลิกเอกสารที่ชำระแล้วไม่ได้ ให้ออกใบลดหนี้"); d.status = "voided"; emit("document.voided", { actor: "human", source: "human", after: d.no }); });
}
export async function retryTaskAction(f: FormData) { run("/workflow", () => retryTask(String(f.get("task")))); }
export async function replyAction(f: FormData) {
  const text = String(f.get("text") || "").trim(); const clientId = String(f.get("client"));
  if (text) { db.messages.push({ id: "m" + Date.now(), clientId, from: "team", text, at: new Date().toISOString(), read: true }); }
  db.messages.filter((m) => m.clientId === clientId).forEach((m) => (m.read = true));
  revalidatePath("/", "layout");
}
export async function saveBlockAction(f: FormData) {
  const site = String(f.get("site")); const type = String(f.get("block"));
  run(`/builder?site=${site}&block=${type}`, () => {
    let data: unknown;
    try { data = JSON.parse(String(f.get("json"))); } catch { throw new Error("JSON ไม่ถูกต้อง"); }
    const e = validateBlock(type, data); if (e) throw new Error(`${type}: ${e}`);
    const s = db.sites.find((x) => x.id === site)!;
    emit("patch.applied", { actor: "human", source: "human", after: type });
    saveSiteVersion(site, { ...s.config, [type]: data }, "Big", `แก้ ${type}`);
  });
}
export async function removeBlockAction(f: FormData) {
  const site = String(f.get("site")); const type = String(f.get("block"));
  run(`/builder?site=${site}`, () => { const s = db.sites.find((x) => x.id === site)!; const c = { ...s.config }; delete c[type]; saveSiteVersion(site, c, "Big", `ลบ ${type}`); });
}
export async function rollbackAction(f: FormData) { const site = String(f.get("site")); run(`/builder?site=${site}`, () => rollbackSite(site)); }
