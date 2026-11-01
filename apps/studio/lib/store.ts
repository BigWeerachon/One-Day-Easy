import { canTransition, type Stage, type Actor } from "./workflow";
import { formatDocNo, type DocType, EXPIRY_DAYS } from "./money";
import { ALL_EVENTS } from "./events";

// In-memory store สำหรับ dev · แทนที่ด้วย Supabase (ดู supabase/migrations) ใน production
export type ClientStatus = "lead" | "active" | "care";
export interface Client { id: string; name: string; kind: string; status: ClientStatus; pkg: string; channel: "LINE" | "Email" | "Web" | "FB"; contact: string; color: string; lastContactMin: number; notes: string[]; taxId?: string }
export interface Job { id: string; clientId: string; title: string; stage: Stage; template?: string; checksPassed: number; checklistDone: boolean; pdpa: boolean; approved: boolean; editRounds: number; slaHours: number; assignee: string; pausedFrom?: Stage }
export interface Site { id: string; clientId: string; domain: string; template: string; status: "draft" | "live" | "down"; version: number; config: Record<string, unknown> }
export interface SiteVersion { siteId: string; version: number; config: Record<string, unknown>; at: string; by: string; note: string }
export interface Doc { no: string; type: DocType; clientId: string; jobId?: string; total: number; paid: number; status: "draft" | "issued" | "paid" | "voided" | "expired"; issuedAt: string; revision: number }
export interface Slip { id: string; docNo: string; amount: number; status: "pending" | "verified" | "rejected"; at: string }
export interface Message { id: string; clientId: string; from: "client" | "team" | "system"; text: string; at: string; read: boolean }
export interface Task { id: string; name: string; jobId?: string; attempts: number; status: "queued" | "running" | "done" | "failed" | "dead"; error?: string; idemKey: string }
export interface Ev { id: number; name: string; jobId?: string; actor: string; source: "human" | "system"; before?: unknown; after?: unknown; at: string }
export interface CatalogItem { code: string; name: string; price: number; recurring: boolean }

const now = () => new Date().toISOString();

function seed() {
  const clients: Client[] = [
    { id: "c1", name: "ครัวป้าแดง", kind: "ร้านอาหาร", status: "active", pkg: "Start", channel: "LINE", contact: "คุณแดง", color: "#f59e0b", lastContactMin: 2, notes: ["ชอบโทนแดงอบอุ่น"] },
    { id: "c2", name: "บ้านสวนริมดอย", kind: "ที่พัก", status: "active", pkg: "Pro", channel: "LINE", contact: "คุณต้น", color: "#16a34a", lastContactMin: 60, notes: ["ไม่ตอบ 72 ชม. — ต้องโทร"] },
    { id: "c3", name: "Lumière Clinic", kind: "คลินิก", status: "active", pkg: "Business", channel: "Email", contact: "คุณแอน", color: "#7c3aed", lastContactMin: 15, notes: [] },
    { id: "c4", name: "แอร์ดีเซอร์วิส", kind: "บริการ", status: "care", pkg: "Basic", channel: "LINE", contact: "ช่างต้น", color: "#0b6cf0", lastContactMin: 2880, notes: [] },
    { id: "c5", name: "Moka House", kind: "คาเฟ่", status: "care", pkg: "Start", channel: "LINE", contact: "คุณมิ้น", color: "#7a4a2a", lastContactMin: 7200, notes: ["ชอบโทนเขียว"] },
    { id: "c6", name: "KidzLab", kind: "โรงเรียน", status: "active", pkg: "Basic", channel: "Web", contact: "คุณนุ่น", color: "#f47aa5", lastContactMin: 180, notes: [] },
    { id: "c7", name: "PULSE Gym", kind: "บริการ", status: "lead", pkg: "—", channel: "FB", contact: "คุณบีม", color: "#141a2b", lastContactMin: 1440, notes: [] },
    { id: "c8", name: "ร้านข้าวมันไก่เจ๊หมวย", kind: "ร้านอาหาร", status: "active", pkg: "Start", channel: "LINE", contact: "เจ๊หมวย", color: "#e11d48", lastContactMin: 12, notes: [] },
    { id: "c9", name: "ร้านนวดสบายดี", kind: "บริการ", status: "active", pkg: "Basic", channel: "LINE", contact: "คุณนก", color: "#0891b2", lastContactMin: 40, notes: [] },
  ];
  const J = (id: string, clientId: string, stage: Stage, extra: Partial<Job> = {}): Job => ({ id, clientId, title: clients.find((c) => c.id === clientId)!.name, stage, checksPassed: 0, checklistDone: false, pdpa: false, approved: false, editRounds: 0, slaHours: 8, assignee: "มิ้น", ...extra });
  const jobs: Job[] = [
    J("j1", "c8", "template", { template: "T3", checksPassed: 6, checklistDone: true, pdpa: true, slaHours: 2 }),
    J("j2", "c9", "template", { checklistDone: true, pdpa: true, slaHours: 5, assignee: "ต้น" }),
    J("j3", "c1", "client_review", { template: "T3", checksPassed: 6, checklistDone: true, pdpa: true, editRounds: 2, slaHours: 21 }),
    J("j4", "c6", "intake", { assignee: "ต้น" }),
    J("j5", "c2", "client_review", { template: "T4", checksPassed: 6, checklistDone: true, pdpa: true, slaHours: -48, title: "บ้านสวนริมดอย · เว็บที่ 3" }),
    J("j6", "c3", "payment", { template: "T2", checksPassed: 6, checklistDone: true, pdpa: true, approved: true, slaHours: -1 }),
    J("j7", "c5", "online", { template: "T1", checksPassed: 6, checklistDone: true, pdpa: true, approved: true }),
    J("j8", "c4", "online", { template: "T5", checksPassed: 6, checklistDone: true, pdpa: true, approved: true }),
    J("j9", "c7", "new_chat"),
  ];
  const sites: Site[] = [
    { id: "s1", clientId: "c1", domain: "krua-padaeng.onedayeasy.app", template: "T3", status: "draft", version: 3, config: { hero: { title: "ครัวป้าแดง อร่อยแบบบ้านๆ", subtitle: "อาหารตามสั่งสูตรเด็ด ส่งไวในย่านลาดพร้าว", cta: "สั่งเลย" }, menu: { items: [{ name: "กะเพราหมูกรอบ", price: 60 }, { name: "ต้มยำกุ้ง", price: 120 }] }, line: { id: "@kruapadaeng" }, hours: { days: "จ.–ส.", open: "08:00", close: "20:00" }, map: { lat: 13.81, lng: 100.6, address: "ลาดพร้าว 71 กรุงเทพฯ" } } },
    { id: "s2", clientId: "c5", domain: "mokahouse.com", template: "T1", status: "live", version: 7, config: { hero: { title: "Moka House", subtitle: "Specialty coffee & bakery", cta: "ดูเมนู" }, line: { id: "@mokahouse" } } },
    { id: "s3", clientId: "c4", domain: "airdservice.com", template: "T5", status: "live", version: 4, config: { hero: { title: "แอร์ดีเซอร์วิส", subtitle: "ล้างแอร์ ซ่อมแอร์ มาไวใน 2 ชม.", cta: "จองช่าง" } } },
    { id: "s4", clientId: "c8", domain: "yumyum.vercel.app", template: "T3", status: "down", version: 1, config: { hero: { title: "ข้าวมันไก่เจ๊หมวย", subtitle: "", cta: "สั่งเลย" } } },
  ];
  const docs: Doc[] = [
    { no: "INV-2611-008", type: "INV", clientId: "c3", jobId: "j6", total: 745000, paid: 0, status: "issued", issuedAt: "2026-10-29", revision: 1 },
    { no: "RN-2611-004", type: "RN", clientId: "c5", total: 299000, paid: 0, status: "issued", issuedAt: "2026-11-01", revision: 1 },
    { no: "QT-2611-011", type: "QT", clientId: "c1", jobId: "j3", total: 359000, paid: 0, status: "issued", issuedAt: "2026-10-31", revision: 2 },
    { no: "RC-2610-031", type: "RC", clientId: "c4", total: 459000, paid: 459000, status: "paid", issuedAt: "2026-10-20", revision: 1 },
  ];
  const slips: Slip[] = [{ id: "sl1", docNo: "INV-2611-008", amount: 700000, status: "pending", at: "2026-11-01T09:05:00Z" }];
  const messages: Message[] = [
    { id: "m1", clientId: "c1", from: "client", text: "ขอเปลี่ยนรูปหน้าแรกเป็นรูปร้านจริงได้ไหมคะ", at: "2026-11-01T09:58:00Z", read: false },
    { id: "m2", clientId: "c3", from: "client", text: "โอนแล้วนะคะ แนบสลิปค่ะ", at: "2026-11-01T09:05:00Z", read: false },
    { id: "m3", clientId: "c8", from: "client", text: "อยากได้เว็บร้านข้าวมันไก่ค่ะ ทำได้ในวันเดียวไหม", at: "2026-11-01T08:40:00Z", read: false },
    { id: "m4", clientId: "c7", from: "client", text: "สนใจแพ็กเว็บยิมครับ ราคาเท่าไร", at: "2026-10-31T10:00:00Z", read: true },
    { id: "m5", clientId: "c1", from: "team", text: "ได้เลยค่ะ ส่งรูปมาทาง LINE ได้เลย", at: "2026-11-01T10:00:00Z", read: true },
  ];
  const tasks: Task[] = [
    { id: "t1", name: "line.push · แจ้งลิงก์เว็บ", jobId: "j8", attempts: 3, status: "dead", error: "LINE API 429 rate limit", idemKey: "j8:notify:v4" },
    { id: "t2", name: "draft.generate · Sonnet", jobId: "j4", attempts: 1, status: "running", idemKey: "j4:draft:v1" },
    { id: "t3", name: "document.send · RN-2611-004", attempts: 1, status: "done", idemKey: "RN-2611-004:send" },
    { id: "t4", name: "site.healthcheck · daily", attempts: 1, status: "done", idemKey: "hc:2026-11-01" },
  ];
  const catalog: CatalogItem[] = [
    { code: "PKG-START", name: "แพ็ก Start · เว็บ 1 หน้า", price: 159000, recurring: false },
    { code: "PKG-BASIC", name: "แพ็ก Basic · หลายบล็อก + โดเมน", price: 299000, recurring: false },
    { code: "PKG-PRO", name: "แพ็ก Pro · จองห้อง/บริการ", price: 599000, recurring: false },
    { code: "PKG-BIZ", name: "แพ็ก Business", price: 899000, recurring: false },
    { code: "CARE-Y", name: "ดูแลรายปี + โฮสติ้ง", price: 299000, recurring: true },
    { code: "EDIT-X", name: "แก้เพิ่มเกินรอบ (ต่อครั้ง)", price: 45000, recurring: false },
  ];
  return { clients, jobs, sites, versions: [] as SiteVersion[], docs, slips, messages, tasks, events: [] as Ev[], catalog, seq: { INV: 8, QT: 11, RC: 31, RN: 4, CN: 0 } as Record<DocType, number> };
}

const g = globalThis as unknown as { __ode?: ReturnType<typeof seed> };
export const db = (g.__ode ??= seed());

let evId = 0;
export function emit(name: string, e: Omit<Ev, "id" | "name" | "at">) {
  if (!ALL_EVENTS.includes(name)) throw new Error(`event ไม่อยู่ใน catalog: ${name}`);
  db.events.unshift({ id: ++evId, name, at: now(), ...e });
}

export const clientOf = (id: string) => db.clients.find((c) => c.id === id);

export function moveJob(jobId: string, to: Stage, by: Actor, reason?: string) {
  const j = db.jobs.find((x) => x.id === jobId);
  if (!j) throw new Error("ไม่พบงาน");
  const due = db.docs.filter((d) => d.jobId === jobId && d.type === "INV");
  const paidInFull = due.length > 0 && due.every((d) => d.paid >= d.total);
  if (j.stage === "paused" && to === j.pausedFrom) {
    // ย้อนกลับจากพักงาน
  } else {
    const r = canTransition(j.stage, to, by, { ...j, paidInFull, reason });
    if (!r.ok) throw new Error(r.error);
  }
  const before = j.stage;
  if (to === "paused") j.pausedFrom = j.stage;
  if (before === "client_review" && to === "template") j.editRounds++;
  if (to === "invoice") j.approved = true;
  j.stage = to;
  emit(to === "template" && before === "client_review" ? "edit.requested" : to === "invoice" ? "site.approved" : to === "online" ? "site.published" : "template.selected", { jobId, actor: by, source: by === "human" ? "human" : "system", before, after: to });
}

export function issueDoc(type: DocType, clientId: string, total: number, jobId?: string) {
  const d = new Date();
  const no = formatDocNo(type, d.getFullYear(), d.getMonth() + 1, ++db.seq[type]);
  db.docs.unshift({ no, type, clientId, jobId, total, paid: 0, status: "issued", issuedAt: d.toISOString().slice(0, 10), revision: 1 });
  emit("document.issued", { jobId, actor: "human", source: "human", after: no });
  return no;
}

export function verifySlip(slipId: string, accept: boolean) {
  const s = db.slips.find((x) => x.id === slipId);
  if (!s || s.status !== "pending") throw new Error("สลิปนี้ตรวจไปแล้ว");
  const doc = db.docs.find((d) => d.no === s.docNo)!;
  s.status = accept ? "verified" : "rejected";
  emit(accept ? "slip.verified" : "slip.rejected", { jobId: doc.jobId, actor: "human", source: "human", after: s.amount });
  if (!accept) return;
  doc.paid += s.amount;
  emit("payment.recorded", { jobId: doc.jobId, actor: "human", source: "human", after: doc.paid });
  if (doc.paid >= doc.total) {
    doc.status = "paid";
    issueDoc("RC", doc.clientId, doc.total, doc.jobId);
    const j = doc.jobId && db.jobs.find((x) => x.id === doc.jobId);
    if (j && j.stage === "payment") moveJob(j.id, "online", "system");
  }
}

export function expireDocs(today = new Date()) {
  for (const d of db.docs) if (d.type === "QT" && d.status === "issued" && (today.getTime() - new Date(d.issuedAt).getTime()) / 864e5 > EXPIRY_DAYS) { d.status = "expired"; emit("document.expired", { actor: "system", source: "system", after: d.no }); }
}

export function retryTask(id: string) {
  const t = db.tasks.find((x) => x.id === id);
  if (!t) throw new Error("ไม่พบงาน");
  t.status = "queued"; t.attempts = 0; t.error = undefined;
}

export function saveSiteVersion(siteId: string, config: Record<string, unknown>, by: string, note: string) {
  const s = db.sites.find((x) => x.id === siteId)!;
  db.versions.unshift({ siteId, version: s.version, config: s.config, at: now(), by, note: "ก่อน: " + note });
  s.version++; s.config = config;
  emit("site.version.saved", { actor: by, source: "human", after: s.version });
}
export function rollbackSite(siteId: string) {
  const v = db.versions.find((x) => x.siteId === siteId);
  if (!v) throw new Error("ไม่มีเวอร์ชันก่อนหน้า");
  const s = db.sites.find((x) => x.id === siteId)!;
  db.versions.splice(db.versions.indexOf(v), 1);
  s.config = v.config; s.version++;
  emit("site.version.saved", { actor: "human", source: "human", after: s.version });
}
