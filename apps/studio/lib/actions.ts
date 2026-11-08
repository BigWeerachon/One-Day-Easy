"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as S from "./store";
import { requireStaff } from "./auth";
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

export async function moveJobAction(f: FormData) { const me = await requireStaff("clients.edit");
  await run(str(f, "back") || "/", () => S.moveJob(str(f, "job"), str(f, "to") as Stage, str(f, "by") as Actor, str(f, "reason")));
}
export async function addClientAction(f: FormData) { const me = await requireStaff("clients.edit");
  const name = str(f, "name");
  if (!name) redirect(withErr("/clients", "ต้องใส่ชื่อร้าน"));
  let id = "", err: string | undefined;
  try { id = await S.addClient({ name, kind: str(f, "kind") || "อื่นๆ", contact: str(f, "contact") || "-", channel: str(f, "channel") || "LINE" }); }
  catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(err ? withErr("/clients", err) : `/clients/${id}`);
}
export async function addNoteAction(f: FormData) { const me = await requireStaff("clients.edit");
  const id = str(f, "client"), note = str(f, "note");
  await run(`/clients/${id}`, async () => { if (note) await S.addNote(id, note); });
}
export async function updateJobFlagsAction(f: FormData) { const me = await requireStaff("clients.edit");
  await run(str(f, "back") || "/", () => S.setJobFlags(str(f, "job"), f.get("checklist") === "on", f.get("pdpa") === "on"));
}
export async function issueDocAction(f: FormData) { const me = await requireStaff("finance.edit");
  await run("/finance", async () => {
    const total = satang(f, "total");
    if (!(total > 0)) throw new Error("ยอดต้องมากกว่า 0");
    await S.issueDoc(str(f, "type") as DocType, str(f, "client"), total, str(f, "job") || undefined);
  });
}
export async function addSlipAction(f: FormData) { const me = await requireStaff("finance.edit");
  await run("/finance", async () => {
    const amount = satang(f, "amount");
    if (!(amount > 0)) throw new Error("ยอดสลิปต้องมากกว่า 0");
    await S.addSlip(str(f, "doc"), amount);
  });
}
export async function verifySlipAction(f: FormData) { const me = await requireStaff("finance.edit");
  const slip = str(f, "slip"), accept = f.get("accept") === "1";
  await run("/finance", async () => {
    await S.verifySlip(slip, accept, me.name, str(f, "doc") || undefined);
    // แจ้งลูกค้าหลังคนตัดสิน · ส่ง LINE ไม่สำเร็จไม่ทำให้การยืนยันล้ม (งาน line.push ลองซ้ำเอง)
    await S.notifySlipResult(slip, accept ? "approved" : "rejected").catch(() => {});
  });
}
export async function voidDocAction(f: FormData) { const me = await requireStaff("finance.edit"); await run("/finance", () => S.voidDoc(str(f, "doc"))); }
export async function retryTaskAction(f: FormData) { const me = await requireStaff("system.retry"); await run("/workflow", () => S.retryTask(str(f, "task"))); }
export async function replyAction(f: FormData) { const me = await requireStaff("clients.edit");
  const id = str(f, "client");
  await run(`/inbox?c=${id}`, () => S.reply(id, str(f, "text")));
}
export async function saveBlockAction(f: FormData) { const me = await requireStaff("sites.edit");
  const site = str(f, "site"), type = str(f, "block");
  await run(`/builder?site=${site}&block=${type}`, async () => {
    let data: unknown;
    try { data = JSON.parse(String(f.get("json"))); } catch { throw new Error("JSON ไม่ถูกต้อง"); }
    const e = validateBlock(type, data); if (e) throw new Error(`${type}: ${e}`);
    const s = await S.getSite(site); if (!s) throw new Error("ไม่พบเว็บ");
    const config = { ...s.config, [type]: data };
    const tpl = TEMPLATES.find((t) => t.id === s.template)!;
    await S.saveSiteConfig(site, config, me.name, `แก้ ${type}`, runChecks(tpl, config).filter((c) => c.ok).length);
  });
}
export async function removeBlockAction(f: FormData) { const me = await requireStaff("sites.edit");
  const site = str(f, "site"), type = str(f, "block");
  await run(`/builder?site=${site}`, async () => {
    const s = await S.getSite(site); if (!s) throw new Error("ไม่พบเว็บ");
    const config = { ...s.config }; delete config[type];
    const tpl = TEMPLATES.find((t) => t.id === s.template)!;
    await S.saveSiteConfig(site, config, me.name, `ลบ ${type}`, runChecks(tpl, config).filter((c) => c.ok).length);
  });
}
export async function rollbackAction(f: FormData) { const me = await requireStaff("sites.edit"); const site = str(f, "site"); await run(`/builder?site=${site}`, () => S.rollbackSite(site, me.name)); }
export async function createSiteAction(f: FormData) { const me = await requireStaff("sites.edit");
  let id = "", err: string | undefined;
  try { id = await S.createSiteForJob(str(f, "job"), str(f, "template")); } catch (e) { err = (e as Error).message; }
  revalidatePath("/", "layout");
  redirect(err ? withErr(`/builder?job=${str(f, "job")}`, err) : `/builder?site=${id}`);
}

// ---------- Claude ----------
import { extractIntake, proposePatch, aiConfigured } from "./ai";
const needAi = () => { if (!aiConfigured()) throw new Error("ยังไม่ได้ตั้ง ANTHROPIC_API_KEY"); };

export async function extractIntakeAction(f: FormData) { const me = await requireStaff("clients.edit");
  const id = str(f, "client");
  await run(`/clients/${id}`, async () => {
    needAi();
    const chat = (await S.listMessages(id)).filter((m) => m.from !== "system").slice(-60);
    if (!chat.length) throw new Error("ยังไม่มีแชทให้สรุป");
    const { intake, usage } = await extractIntake(chat);
    await S.saveIntake(id, intake, usage);
  });
}

export async function proposePatchAction(f: FormData) { const me = await requireStaff("sites.edit");
  const site = str(f, "site"), instruction = str(f, "instruction");
  await run(`/builder?site=${site}`, async () => {
    needAi();
    if (instruction.length < 3) throw new Error("พิมพ์สิ่งที่อยากให้แก้ก่อน");
    if (instruction.length > 2000) throw new Error("คำสั่งยาวเกิน 2,000 ตัวอักษร");
    const s = await S.getSite(site); if (!s) throw new Error("ไม่พบเว็บ");
    const tpl = TEMPLATES.find((t) => t.id === s.template)!;
    const notes = await S.clientNotes(s.clientId);
    const r = await proposePatch({ template: tpl, config: s.config, instruction, notes });
    const ops = r.ops.map((o) => ({
      block: o.block, data: o.data,
      error: o.parseError ?? (!tpl.blocks.includes(o.block) ? `บล็อก ${o.block} ไม่อยู่ในเทมเพลต ${tpl.id}` : validateBlock(o.block, o.data)),
    }));
    await S.saveProposal(site, s.version, instruction, r.summary, ops, r.usage);
  });
}

const checksFor = (config: Record<string, unknown>, template: string) =>
  runChecks(TEMPLATES.find((t) => t.id === template)!, config).filter((c) => c.ok).length;
export async function applyProposalAction(f: FormData) { const me = await requireStaff("sites.edit");
  const site = str(f, "site");
  await run(`/builder?site=${site}`, () => S.applyProposal(str(f, "proposal"), checksFor, me.name));
}
export async function rejectProposalAction(f: FormData) { const me = await requireStaff("sites.edit");
  const site = str(f, "site");
  await run(`/builder?site=${site}`, () => S.rejectProposal(str(f, "proposal")));
}

// ---------- ตรวจสลิปอัตโนมัติ ----------
const SLIP_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export async function uploadSlipAction(f: FormData) { const me = await requireStaff("finance.edit");
  await run("/finance", async () => {
    const file = f.get("image");
    if (!(file instanceof File) || file.size === 0) throw new Error("เลือกรูปสลิปก่อน");
    if (file.size > 5 * 1024 * 1024) throw new Error("รูปใหญ่เกิน 5 MB");
    const mime = SLIP_MIME.find((m) => m === file.type);
    if (!mime) throw new Error("รองรับเฉพาะรูป JPG, PNG, WebP, GIF");
    const clientId = str(f, "client") || null;
    const id = await S.createSlipFromImage({ clientId, source: "upload", bytes: Buffer.from(await file.arrayBuffer()), mime });
    if (id) await S.processSlip(id);
  });
}
export async function reprocessSlipAction(f: FormData) { const me = await requireStaff("finance.edit");
  await run("/finance", async () => { await S.processSlip(str(f, "slip")); });
}

// ---------- Portal ----------
import { sendPortalLink } from "./portal";
export async function sendPortalLinkAction(f: FormData) {
  const me = await requireStaff("clients.edit");
  const id = str(f, "client");
  let to = `/clients/${id}`;
  try { const r = await sendPortalLink(id, me.name); to += `?portal=${r.token}&sent=${r.sent ? 1 : 0}`; }
  catch (e) { to += `?err=${encodeURIComponent((e as Error).message)}`; }
  revalidatePath("/", "layout");
  redirect(to);
}

// ---------- โดเมน ----------
import * as D from "./domains";
export async function attachDomainAction(f: FormData) {
  const me = await requireStaff("sites.edit"); const site = str(f, "site");
  await run(`/builder?site=${site}`, () => D.attachDomain(site, str(f, "domain"), me.name));
}
export async function checkDomainAction(f: FormData) {
  await requireStaff("sites.edit"); const site = str(f, "site");
  await run(`/builder?site=${site}`, () => D.checkDomain(str(f, "id")));
}
export async function removeDomainAction(f: FormData) {
  await requireStaff("sites.edit"); const site = str(f, "site");
  await run(`/builder?site=${site}`, () => D.removeDomain(str(f, "id")));
}
export async function quoteDomainAction(f: FormData) {
  await requireStaff("domains.buy"); const site = str(f, "site");
  let to = `/builder?site=${site}`;
  try { const qt = await D.quoteDomain(str(f, "domain")); to += `&quote=${encodeURIComponent(JSON.stringify(qt))}`; }
  catch (e) { to += `&err=${encodeURIComponent((e as Error).message)}`; }
  redirect(to);
}
export async function buyDomainAction(f: FormData) {
  const me = await requireStaff("domains.buy"); const site = str(f, "site");
  await run(`/builder?site=${site}`, () => D.purchaseDomain(site, str(f, "domain"), str(f, "confirm"), Number(str(f, "price")), me.name));
}
