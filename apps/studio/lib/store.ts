import "server-only";
import type { PoolClient } from "pg";
import { q, one, tx } from "./db";
import { canTransition, type Stage, type Actor } from "./workflow";
import { type DocType, EXPIRY_DAYS } from "./money";
import { ALL_EVENTS } from "./events";
import { randomUUID } from "node:crypto";
import { pushText, type LineError } from "./line";

export type ClientStatus = "lead" | "active" | "care";
export interface Client { id: string; name: string; kind: string; status: ClientStatus; pkg: string; channel: "LINE" | "Email" | "Web" | "FB"; contact: string; color: string; lastContactMin: number; taxId: string | null }
export interface Job { id: string; clientId: string; siteId: string | null; title: string; stage: Stage; pausedFrom: Stage | null; template: string | null; checksPassed: number; checklistDone: boolean; pdpa: boolean; approved: boolean; editRounds: number; slaHours: number | null; assignee: string }
export interface Site { id: string; clientId: string; domain: string; template: string; status: "draft" | "live" | "down"; version: number; config: Record<string, unknown> }
export interface SiteVersion { siteId: string; version: number; at: string; by: string; note: string }
export interface Doc { no: string; type: DocType; clientId: string; clientName: string; jobId: string | null; total: number; paid: number; status: "draft" | "issued" | "paid" | "voided" | "expired"; issuedAt: string; revision: number }
export interface Slip { id: string; docNo: string; amount: number; status: "pending" | "verified" | "rejected"; at: string }
export interface Message { id: string; clientId: string; from: "client" | "team" | "system"; text: string; at: string; read: boolean; delivery: "none" | "pending" | "sent" | "failed"; deliveryError: string | null }
export interface Task { id: string; name: string; jobId: string | null; attempts: number; status: "queued" | "running" | "done" | "failed" | "dead"; error: string | null; idemKey: string }
export interface Ev { id: string; name: string; jobId: string | null; actor: string; source: "human" | "system"; before: unknown; after: unknown; at: string }
export interface CatalogItem { code: string; name: string; price: number; recurring: boolean }

type Db = Pick<PoolClient, "query">;
const rows = async <T>(c: Db, sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];

// ---------- reads ----------
const CLIENT_COLS = `id, name, coalesce(kind,'อื่นๆ') kind, status, coalesce(package,'—') pkg, channel, coalesce(contact_name,'-') contact, color,
  floor(extract(epoch from now() - coalesce(last_contact_at, created_at)) / 60)::int "lastContactMin", tax_id "taxId"`;
export const listClients = (status = "", search = "") => q<Client>(
  `select ${CLIENT_COLS} from clients where ($1 = '' or status = $1)
   and ($2 = '' or (name || ' ' || coalesce(contact_name,'') || ' ' || coalesce(kind,'')) ilike '%' || $2 || '%')
   order by last_contact_at desc nulls last`, [status, search]);
export const countClients = async () => Object.fromEntries((await q<{ status: string; n: number }>(`select status, count(*)::int n from clients group by status`)).map((r) => [r.status, r.n])) as Record<string, number>;
export const countMissingTax = async () => (await one<{ n: number }>(`select count(*)::int n from clients where tax_id is null and status <> 'lead'`))!.n;
export const getClient = (id: string) => isUuid(id) ? one<Client>(`select ${CLIENT_COLS} from clients where id = $1`, [id]) : Promise.resolve(undefined);
export const clientNotes = async (id: string) => (await q<{ note: string }>(`select note from client_notes where client_id = $1 order by created_at desc`, [id])).map((r) => r.note);

const JOB_COLS = `id, client_id "clientId", site_id "siteId", title, stage, paused_from "pausedFrom", template, checks_passed "checksPassed",
  checklist_done "checklistDone", pdpa_consent pdpa, approved, edit_rounds "editRounds", coalesce(assignee,'-') assignee,
  case when sla_due_at is null then null else round(extract(epoch from sla_due_at - now()) / 3600)::int end "slaHours"`;
export const listJobs = (clientId?: string) => q<Job>(`select ${JOB_COLS} from jobs where ($1::uuid is null or client_id = $1) order by sla_due_at nulls last`, [clientId ?? null]);
export const getJob = (id: string) => isUuid(id) ? one<Job>(`select ${JOB_COLS} from jobs where id = $1`, [id]) : Promise.resolve(undefined);

const SITE_COLS = `id, client_id "clientId", domain, template, status, version, config`;
export const listSites = (clientId?: string) => q<Site>(`select ${SITE_COLS} from sites where ($1::uuid is null or client_id = $1) order by domain`, [clientId ?? null]);
export const getSite = (id: string) => isUuid(id) ? one<Site>(`select ${SITE_COLS} from sites where id = $1`, [id]) : Promise.resolve(undefined);
export const siteVersions = (siteId: string) => q<SiteVersion>(`select site_id "siteId", version, created_at::text at, coalesce(actor,'-') by, coalesce(note,'') note from site_versions where site_id = $1 order by version desc limit 20`, [siteId]);

const DOC_COLS = `d.no, d.type, d.client_id "clientId", c.name "clientName", d.job_id "jobId", d.total_satang::int total, d.paid_satang::int paid, d.status, d.issued_at::text "issuedAt", d.revision`;
export const listDocs = (clientId?: string) => q<Doc>(`select ${DOC_COLS} from documents d join clients c on c.id = d.client_id where ($1::uuid is null or d.client_id = $1) order by d.issued_at desc, d.no desc`, [clientId ?? null]);
export interface SlipRow extends Slip { due: number | null; clientName: string | null; clientId: string | null; source: string; ref: string | null; bank: string | null; paidAt: string | null; checks: { rule: string; ok: boolean; detail: string }[] | null; read: Record<string, unknown> | null; hasImage: boolean; decidedBy: string | null }
export const listSlips = (status = "pending") => q<SlipRow>(
  `select s.id::text, s.doc_no "docNo", s.amount_satang::int amount, s.status, s.created_at::text at,
     (d.total_satang - d.paid_satang)::int due, c.name "clientName", c.id "clientId", s.source, s.ref, s.bank, s.paid_at::text "paidAt",
     s.checks, s.read, exists (select 1 from slip_images i where i.slip_id = s.id) "hasImage", s.decided_by "decidedBy"
   from slips s left join documents d on d.no = s.doc_no left join clients c on c.id = coalesce(s.client_id, d.client_id)
   where s.status = $1 order by s.created_at desc limit 50`, [status]);
export const listCatalog = () => q<CatalogItem>(`select code, name, price_satang::int price, recurring from catalog_items where active order by price_satang`);

export const listThreads = () => q<{ clientId: string; name: string; color: string; channel: string; last: string; unread: number }>(
  `select c.id "clientId", c.name, c.color, cv.channel, m.body last, (select count(*)::int from messages x where x.conversation_id = cv.id and x.sender = 'client' and x.read_at is null) unread
   from conversations cv join clients c on c.id = cv.client_id
   join lateral (select body, created_at from messages where conversation_id = cv.id order by created_at desc limit 1) m on true
   order by m.created_at desc`);
export const listMessages = (clientId: string) => q<Message>(
  `select m.id::text, cv.client_id "clientId", m.sender "from", m.body text, m.created_at::text at, m.read_at is not null read, m.delivery, m.delivery_error "deliveryError"
   from messages m join conversations cv on cv.id = m.conversation_id where cv.client_id = $1 order by m.created_at`, [clientId]);
export const unreadCount = async () => (await one<{ n: number }>(`select count(*)::int n from messages where sender = 'client' and read_at is null`))!.n;

export const listTasks = () => q<Task>(`select id::text, name, job_id "jobId", attempts, status, last_error error, idempotency_key "idemKey" from tasks order by case status when 'dead' then 0 when 'failed' then 1 when 'running' then 2 when 'queued' then 3 else 4 end, id desc limit 50`);
export const listEvents = (jobIds?: string[], limit = 50) => q<Ev>(
  `select id::text, name, job_id "jobId", actor, source, before, after, created_at::text at from events where ($1::uuid[] is null or job_id = any($1)) order by id desc limit $2`, [jobIds ?? null, limit]);
export const avgEditRounds = async () => Number((await one<{ v: string }>(`select coalesce(avg(edit_rounds),0) v from jobs`))!.v);

// ---------- writes ----------
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function emit(c: Db, name: string, e: { jobId?: string | null; actor: string; source: "human" | "system"; before?: unknown; after?: unknown }) {
  if (!ALL_EVENTS.includes(name)) throw new Error(`event ไม่อยู่ใน catalog: ${name}`);
  await c.query(`insert into events (name, job_id, actor, source, before, after) values ($1,$2,$3,$4,$5,$6)`,
    [name, e.jobId ?? null, e.actor, e.source, JSON.stringify(e.before ?? null), JSON.stringify(e.after ?? null)]);
}

export async function addClient(input: { name: string; kind: string; contact: string; channel: string }) {
  return tx(async (c) => {
    const [cl] = await rows<{ id: string }>(c, `insert into clients (name, kind, contact_name, channel) values ($1,$2,$3,$4) returning id`, [input.name, input.kind, input.contact, input.channel]);
    await c.query(`insert into contacts (client_id, channel, value, name) values ($1,$2,$3,$3)`, [cl.id, input.channel, input.contact]);
    await c.query(`insert into conversations (client_id, channel) values ($1,$2)`, [cl.id, input.channel]);
    const [j] = await rows<{ id: string }>(c, `insert into jobs (client_id, title, assignee, sla_due_at) values ($1,$2,'มิ้น', now() + interval '8 hour') returning id`, [cl.id, input.name]);
    await emit(c, "client.created", { actor: "human", source: "human" });
    await emit(c, "job.created", { jobId: j.id, actor: "system", source: "system" });
    return cl.id;
  });
}
export const addNote = (clientId: string, note: string) => q(`insert into client_notes (client_id, note) values ($1,$2)`, [clientId, note]);

export async function setJobFlags(jobId: string, checklist: boolean, pdpa: boolean) {
  await tx(async (c) => {
    const [old] = await rows<{ pdpa_consent: boolean }>(c, `select pdpa_consent from jobs where id = $1 for update`, [jobId]);
    await c.query(`update jobs set checklist_done = $2, pdpa_consent = $3 where id = $1`, [jobId, checklist, pdpa]);
    if (pdpa && !old.pdpa_consent) await emit(c, "consent.given", { jobId, actor: "client", source: "system" });
  });
}

async function moveJobTx(c: Db, jobId: string, to: Stage, by: Actor, reason?: string) {
  const [j] = await rows<{ stage: Stage; paused_from: Stage | null; checklist_done: boolean; pdpa_consent: boolean; checks_passed: number; approved: boolean }>(c, `select * from jobs where id = $1 for update`, [jobId]);
  if (!j) throw new Error("ไม่พบงาน");
  const [{ unpaid, n }] = await rows<{ unpaid: number; n: number }>(c, `select count(*) filter (where paid_satang < total_satang)::int unpaid, count(*)::int n from documents where job_id = $1 and type = 'INV' and status <> 'voided'`, [jobId]);
  const resuming = j.stage === "paused" && to === j.paused_from;
  if (!resuming) {
    const r = canTransition(j.stage, to, by, { checklistDone: j.checklist_done, pdpa: j.pdpa_consent, checksPassed: j.checks_passed, approved: j.approved, paidInFull: n > 0 && unpaid === 0, reason });
    if (!r.ok) throw new Error(r.error);
  }
  // trigger ในฐานข้อมูลตรวจซ้ำอีกชั้น (enforce_job_transition)
  await c.query(`update jobs set stage = $2::job_stage, approved = approved or $2::job_stage = 'invoice' where id = $1`, [jobId, to]);
  const name = to === "paused" ? "job.paused" : resuming ? "job.resumed"
    : j.stage === "client_review" && to === "template" ? "edit.requested"
    : to === "client_review" ? "preview.sent" : to === "invoice" ? "site.approved" : to === "online" ? "site.published"
    : to === "template" ? "info.extracted" : "job.created";
  await emit(c, name, { jobId, actor: by, source: by === "human" ? "human" : "system", before: j.stage, after: reason ? { stage: to, reason } : to });
}
export const moveJob = (jobId: string, to: Stage, by: Actor, reason?: string) => tx((c) => moveJobTx(c, jobId, to, by, reason));

async function issueDocTx(c: Db, type: DocType, clientId: string, total: number, jobId?: string | null) {
  const [{ no }] = await rows<{ no: string }>(c, `select next_doc_no($1::doc_type) no`, [type]);
  // ใบเสร็จ (RC) ออกหลังรับเงินครบเท่านั้น → บันทึกเป็นชำระแล้ว
  const receipt = type === "RC";
  await c.query(`insert into documents (no, type, client_id, job_id, total_satang, paid_satang, status, expires_at) values ($1,$2::doc_type,$3,$4,$5,$6,$7, case when $2::doc_type = 'QT' then current_date + $8::int end)`,
    [no, type, clientId, jobId ?? null, total, receipt ? total : 0, receipt ? "paid" : "issued", EXPIRY_DAYS]);
  await c.query(`insert into document_revisions (doc_no, revision, snapshot, reason) values ($1, 1, $2, 'ออกครั้งแรก')`, [no, JSON.stringify({ type, clientId, total })]);
  await c.query(`insert into document_events (doc_no, kind) values ($1, 'issued')`, [no]);
  await emit(c, "document.issued", { jobId, actor: "human", source: "human", after: no });
  return no;
}
export async function issueDoc(type: DocType, clientId: string, total: number, jobId?: string) {
  return tx(async (c) => {
    const no = await issueDocTx(c, type, clientId, total, jobId);
    if (jobId && type === "INV") {
      const [j] = await rows<{ stage: Stage }>(c, `select stage from jobs where id = $1`, [jobId]);
      if (j?.stage === "invoice") await moveJobTx(c, jobId, "payment", "system");
    }
    return no;
  });
}

export async function addSlip(docNo: string, amount: number) {
  await tx(async (c) => {
    const [d] = await rows<{ job_id: string | null; status: string }>(c, `select job_id, status from documents where no = $1`, [docNo]);
    if (!d) throw new Error("ไม่พบเลขที่เอกสาร");
    if (d.status !== "issued") throw new Error(`เอกสาร ${docNo} สถานะ ${d.status} รับสลิปไม่ได้`);
    await c.query(`insert into slips (doc_no, amount_satang) values ($1,$2)`, [docNo, amount]);
    await emit(c, "slip.received", { jobId: d.job_id, actor: "client", source: "system", after: amount });
  });
}

export async function verifySlip(slipId: string, accept: boolean, by = "Big", assignDoc?: string) {
  await tx(async (c) => verifySlipTx(c, slipId, accept, by, assignDoc));
}
async function verifySlipTx(c: Db, slipId: string, accept: boolean, by: string, assignDoc?: string) {
  {
    const [s] = await rows<{ doc_no: string; amount_satang: string | null; status: string; read: { amount?: number | null } | null }>(c, `select * from slips where id = $1 for update`, [slipId]);
    if (!s || s.status !== "pending") throw new Error("สลิปนี้ตรวจไปแล้ว");
    if (accept && !s.doc_no) {
      if (!assignDoc) throw new Error("สลิปนี้ยังไม่ได้จับคู่ใบแจ้งหนี้ · เลือกใบก่อนยืนยัน");
      const amt = s.amount_satang ?? (s.read?.amount != null ? Math.round(s.read.amount * 100) : null);
      if (!amt) throw new Error("ไม่มียอดเงินของสลิปนี้");
      const [okDoc] = await rows(c, `select 1 from documents d join slips s on s.id = $2 where d.no = $1 and d.status = 'issued' and (s.client_id is null or s.client_id = d.client_id)`, [assignDoc, slipId]);
      if (!okDoc) throw new Error(`ใบ ${assignDoc} ไม่ใช่ใบค้างชำระของลูกค้ารายนี้`);
      await c.query(`update slips set doc_no = $2, amount_satang = $3 where id = $1`, [slipId, assignDoc, amt]);
      s.doc_no = assignDoc; s.amount_satang = String(amt);
    }
    if (!accept) {
      await c.query(`update slips set status = 'rejected', verified_by = $2, decided_by = $2 where id = $1`, [slipId, by]);
      const [d0] = s.doc_no ? await rows<{ job_id: string | null }>(c, `select job_id from documents where no = $1`, [s.doc_no]) : [];
      await emit(c, "slip.rejected", { jobId: d0?.job_id, actor: by, source: by === "auto" ? "system" : "human" });
      return;
    }
    const [d] = await rows<{ no: string; client_id: string; job_id: string | null; total_satang: string; paid_satang: string; status: string }>(c, `select * from documents where no = $1 for update`, [s.doc_no]);
    const amount = Number(s.amount_satang);
    if (d.status !== "issued") throw new Error(`ใบ ${d.no} ไม่ได้อยู่ในสถานะค้างชำระ`);
    if (amount > Number(d.total_satang) - Number(d.paid_satang)) throw new Error(`ยอดสลิป ${(amount / 100).toLocaleString()}฿ เกินยอดค้าง ${((Number(d.total_satang) - Number(d.paid_satang)) / 100).toLocaleString()}฿ ของ ${d.no} · ตรวจว่าเป็นสลิปซ้ำหรือไม่`);
    await c.query(`update slips set status = 'verified', verified_by = $2, decided_by = $2 where id = $1`, [slipId, by]);
    await emit(c, "slip.verified", { jobId: d.job_id, actor: by, source: by === "auto" ? "system" : "human", after: amount });
    const paid = Number(d.paid_satang) + amount, total = Number(d.total_satang);
    await c.query(`insert into payments (doc_no, amount_satang, method) values ($1,$2,'promptpay')`, [d.no, amount]);
    await c.query(`update documents set paid_satang = $2, status = case when $2 >= total_satang then 'paid' else status end where no = $1`, [d.no, paid]);
    await emit(c, "payment.recorded", { jobId: d.job_id, actor: by, source: by === "auto" ? "system" : "human", after: paid });
    if (paid < total) return;
    await c.query(`insert into document_events (doc_no, kind) values ($1, 'paid')`, [d.no]);
    await issueDocTx(c, "RC", d.client_id, total, d.job_id);
    if (d.job_id) {
      // ขึ้นออนไลน์เมื่อไม่เหลือใบแจ้งหนี้ค้างของงานนี้แล้วเท่านั้น (งานหนึ่งอาจมีหลายใบ เช่น ค่าแก้เพิ่ม)
      const [j] = await rows<{ stage: Stage; open: number }>(c, `select stage, (select count(*)::int from documents where job_id = $1 and type = 'INV' and status = 'issued') open from jobs where id = $1`, [d.job_id]);
      if (j?.stage === "payment" && j.open === 0) await moveJobTx(c, d.job_id, "online", "system");
    }
  }
}

export async function voidDoc(no: string) {
  await tx(async (c) => {
    const [d] = await rows<{ status: string; job_id: string | null }>(c, `select status, job_id from documents where no = $1 for update`, [no]);
    if (!d || d.status !== "issued") throw new Error("ยกเลิกได้เฉพาะเอกสารที่ออกแล้วและยังไม่ชำระ · ชำระแล้วให้ออกใบลดหนี้");
    await c.query(`update documents set status = 'voided' where no = $1`, [no]);
    await c.query(`insert into document_events (doc_no, kind) values ($1, 'voided')`, [no]);
    await emit(c, "document.voided", { jobId: d.job_id, actor: "human", source: "human", after: no });
  });
}

export async function expireDocs() {
  await tx(async (c) => {
    const exp = await rows<{ no: string }>(c, `update documents set status = 'expired' where type = 'QT' and status = 'issued' and expires_at < current_date returning no`);
    for (const d of exp) await emit(c, "document.expired", { actor: "system", source: "system", after: d.no });
  });
}

export async function retryTask(id: string) {
  const r = await q<{ name: string; payload: unknown }>(`update tasks set status = 'queued', attempts = 0, last_error = null, run_after = now() where id = $1 and status in ('dead','failed') returning name, payload`, [id]);
  if (!r.length) throw new Error("ไม่พบงานที่ลองใหม่ได้");
  if (r[0].name.startsWith("line.push") && r[0].payload) await runLinePush(id);
}

export async function lineUserIdOf(clientId: string) {
  return (await one<{ value: string }>(`select value from contacts where client_id = $1 and channel = 'LINE' and value like 'U%' order by id limit 1`, [clientId]))?.value ?? null;
}

/** บันทึกข้อความตอบ · ถ้าลูกค้ามี LINE userId จะสร้างงาน line.push แล้วส่งทันที */
export async function reply(clientId: string, text: string) {
  const to = text ? await lineUserIdOf(clientId) : null;
  const taskId = await tx(async (c) => {
    const [cv] = await rows<{ id: string; channel: string }>(c, `select id, channel from conversations where client_id = $1`, [clientId]);
    if (!cv) throw new Error("ไม่พบห้องแชท");
    await c.query(`update messages set read_at = now() where conversation_id = $1 and read_at is null`, [cv.id]);
    if (!text) return null;
    if (cv.channel === "LINE" && !to) throw new Error("ลูกค้านี้ยังไม่มี LINE userId · ต้องให้ลูกค้าทักมาที่ LINE OA ก่อนจึงจะส่งได้");
    const [m] = await rows<{ id: string }>(c, `insert into messages (conversation_id, sender, body, read_at, delivery) values ($1,'team',$2,now(),$3) returning id::text`, [cv.id, text, to ? "pending" : "none"]);
    await c.query(`update clients set last_contact_at = now() where id = $1`, [clientId]);
    if (!to) return null;
    const [t] = await rows<{ id: string }>(c, `insert into tasks (name, idempotency_key, payload) values ('line.push · ตอบแชท', $1, $2) returning id::text`,
      [`msg:${m.id}:line.push`, JSON.stringify({ message_id: m.id, to, retry_key: randomUUID() })]);
    return t.id;
  });
  if (taskId) await runLinePush(taskId);
}

const MAX_ATTEMPTS = 3;
/** ทำงาน line.push 1 ครั้ง · ล้มเหลวครบ 3 ครั้ง → dead-letter (ให้คนกดลองใหม่) */
export async function runLinePush(taskId: string) {
  const t = await one<{ status: string; attempts: number; payload: { message_id: string; to: string; retry_key: string } }>(`select status, attempts, payload from tasks where id = $1`, [taskId]);
  if (!t || !["queued", "failed"].includes(t.status)) return;
  const m = await one<{ body: string }>(`select body from messages where id = $1`, [t.payload.message_id]);
  if (!m) return;
  await q(`update tasks set status = 'running', attempts = attempts + 1 where id = $1`, [taskId]);
  try {
    await pushText(t.payload.to, m.body, t.payload.retry_key);
    await q(`update tasks set status = 'done', last_error = null where id = $1`, [taskId]);
    await q(`update messages set delivery = 'sent', delivery_error = null where id = $1`, [t.payload.message_id]);
  } catch (e) {
    const err = e as LineError; const attempts = t.attempts + 1;
    const dead = !err.retryable || attempts >= MAX_ATTEMPTS;
    await tx(async (c) => {
      await c.query(`update tasks set status = $2, last_error = $3, run_after = now() + interval '1 minute' * $4 where id = $1`, [taskId, dead ? "dead" : "failed", err.message, 2 ** attempts]);
      await c.query(`update messages set delivery = 'failed', delivery_error = $2 where id = $1`, [t.payload.message_id, err.message]);
      await emit(c, dead ? "task.deadlettered" : "task.failed", { actor: "system", source: "system", after: { task: taskId, error: err.message } });
    });
  }
}

/** งาน line.push ที่ถึงเวลาลองใหม่ (เรียกจาก cron) */
export async function runDueLineTasks(limit = 20) {
  const due = await q<{ id: string }>(`select id::text from tasks where name like 'line.push%' and status in ('queued','failed') and payload is not null and run_after <= now() order by id limit $1`, [limit]);
  for (const t of due) await runLinePush(t.id);
  return due.length;
}

export interface IncomingLine { userId: string; messageId: string; text: string; displayName: string | null }
/** ข้อความเข้าจาก LINE webhook · ลูกค้าใหม่ → สร้าง client + งาน · ส่งซ้ำ (redelivery) ไม่บันทึกซ้ำ */
export async function receiveLineMessage(m: IncomingLine): Promise<{ status: "new" | "duplicate"; clientId: string }> {
  return tx(async (c) => {
    let [ct] = await rows<{ client_id: string }>(c, `select client_id from contacts where channel = 'LINE' and value = $1`, [m.userId]);
    if (!ct) {
      const name = m.displayName || `ลูกค้า LINE ${m.userId.slice(-4)}`;
      const [cl] = await rows<{ id: string }>(c, `insert into clients (name, contact_name, channel) values ($1,$1,'LINE') returning id`, [name]);
      await c.query(`insert into contacts (client_id, channel, value, name) values ($1,'LINE',$2,$3) on conflict do nothing`, [cl.id, m.userId, name]);
      const [j] = await rows<{ id: string }>(c, `insert into jobs (client_id, title, assignee, sla_due_at) values ($1,$2,'มิ้น', now() + interval '8 hour') returning id`, [cl.id, name]);
      await emit(c, "client.created", { actor: "system", source: "system" });
      await emit(c, "job.created", { jobId: j.id, actor: "system", source: "system" });
      ct = { client_id: cl.id };
    }
    let [cv] = await rows<{ id: string }>(c, `select id from conversations where client_id = $1`, [ct.client_id]);
    if (!cv) [cv] = await rows<{ id: string }>(c, `insert into conversations (client_id, channel) values ($1,'LINE') returning id`, [ct.client_id]);
    const ins = await rows(c, `insert into messages (conversation_id, sender, body, external_id) values ($1,'client',$2,$3) on conflict (external_id) do nothing returning id`, [cv.id, m.text, `line:${m.messageId}`]);
    if (!ins.length) return { status: "duplicate" as const, clientId: ct.client_id };
    await c.query(`update clients set last_contact_at = now() where id = $1`, [ct.client_id]);
    const [job] = await rows<{ id: string }>(c, `select id from jobs where client_id = $1 order by created_at desc limit 1`, [ct.client_id]);
    await emit(c, "message.received", { jobId: job?.id, actor: "client", source: "system", after: "line" });
    return { status: "new" as const, clientId: ct.client_id };
  });
}

export async function saveSiteConfig(siteId: string, config: Record<string, unknown>, by: string, note: string, checksPassed?: number) {
  await tx(async (c) => {
    const [s] = await rows<{ version: number; config: unknown }>(c, `select version, config from sites where id = $1 for update`, [siteId]);
    if (!s) throw new Error("ไม่พบเว็บ");
    await c.query(`insert into site_versions (site_id, version, config, actor, note) values ($1,$2,$3,$4,$5) on conflict do nothing`, [siteId, s.version, JSON.stringify(s.config), by, "ก่อน: " + note]);
    await c.query(`update sites set version = version + 1, config = $2 where id = $1`, [siteId, JSON.stringify(config)]);
    if (checksPassed !== undefined) await c.query(`update jobs set checks_passed = $2 where site_id = $1 and stage = 'template'`, [siteId, checksPassed]);
    await emit(c, "site.version.saved", { actor: by, source: "human", before: s.version, after: s.version + 1 });
  });
}
export async function rollbackSite(siteId: string, by = "Big") {
  await tx(async (c) => {
    const [s] = await rows<{ version: number; config: unknown }>(c, `select version, config from sites where id = $1 for update`, [siteId]);
    const [v] = await rows<{ version: number; config: unknown }>(c, `select version, config from site_versions where site_id = $1 and version < $2 order by version desc limit 1`, [siteId, s.version]);
    if (!v) throw new Error("ไม่มีเวอร์ชันก่อนหน้า");
    await c.query(`insert into site_versions (site_id, version, config, actor, note) values ($1,$2,$3,$4,$5) on conflict do nothing`, [siteId, s.version, JSON.stringify(s.config), by, `ก่อนย้อนกลับไป v${v.version}`]);
    await c.query(`update sites set version = version + 1, config = $2 where id = $1`, [siteId, JSON.stringify(v.config)]);
    await emit(c, "site.version.saved", { actor: by, source: "human", before: s.version, after: `rollback→v${v.version}` });
  });
}

export async function createSiteForJob(jobId: string, template: string) {
  return tx(async (c) => {
    const [j] = await rows<{ client_id: string; site_id: string | null; title: string }>(c, `select client_id, site_id, title from jobs where id = $1 for update`, [jobId]);
    if (!j) throw new Error("ไม่พบงาน");
    if (j.site_id) return j.site_id;
    const slug = j.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
    const [s] = await rows<{ id: string }>(c, `insert into sites (client_id, domain, template) values ($1, $2 || '-' || substr(md5(random()::text), 1, 6) || '.onedayeasy.app', $3) returning id`, [j.client_id, slug, template]);
    await c.query(`update jobs set site_id = $2, template = $3, checks_passed = 0 where id = $1`, [jobId, s.id, template]);
    await emit(c, "template.selected", { jobId, actor: "human", source: "human", after: template });
    return s.id;
  });
}

// ---------- AI (Claude) ----------
import type { Intake, AiUsage } from "./ai";
export interface ProposalOp { block: string; data: unknown; error: string | null }
export interface Proposal { id: string; siteId: string; baseVersion: number; instruction: string; summary: string | null; ops: ProposalOp[]; status: string; model: string | null; tokens: number; cacheRead: number; at: string }

export async function getIntake(clientId: string) {
  return one<{ intake: Intake | null; at: string | null }>(`select intake, intake_at::text at from clients where id = $1`, [clientId]);
}

/** บันทึกผลสรุปจากแชท · เติมเฉพาะช่องที่ยังว่าง · event ไม่เก็บข้อมูลส่วนบุคคล (T2) */
export async function saveIntake(clientId: string, intake: Intake, usage: AiUsage) {
  await tx(async (c) => {
    await c.query(`update clients set intake = $2, intake_at = now(),
      kind = coalesce(nullif(kind,'อื่นๆ'), $3, kind),
      contact_name = case when contact_name is null or contact_name in ('-','') then coalesce($4, contact_name) else contact_name end
      where id = $1`, [clientId, JSON.stringify(intake), intake.business_type, intake.contact_name]);
    for (const n of intake.style_notes) {
      await c.query(`insert into client_notes (client_id, note) select $1, $2 where not exists (select 1 from client_notes where client_id = $1 and note = $2)`, [clientId, n]);
    }
    const [job] = await rows<{ id: string }>(c, `select id from jobs where client_id = $1 order by created_at desc limit 1`, [clientId]);
    await emit(c, intake.missing.length ? "info.missing.asked" : "info.extracted", {
      jobId: job?.id, actor: "claude", source: "system",
      after: { model: usage.model, tokens: usage.input + usage.output, missing: intake.missing.length },
    });
  });
}

const PROP_COLS = `id::text, site_id "siteId", base_version "baseVersion", instruction, summary, ops, status, model,
  coalesce(input_tokens,0) + coalesce(output_tokens,0) tokens, coalesce(cache_read_tokens,0) "cacheRead", created_at::text at`;
export const listProposals = (siteId: string) => q<Proposal>(`select ${PROP_COLS} from patch_proposals where site_id = $1 order by id desc limit 10`, [siteId]);

export async function saveProposal(siteId: string, baseVersion: number, instruction: string, summary: string, ops: ProposalOp[], usage: AiUsage) {
  return tx(async (c) => {
    const [p] = await rows<{ id: string }>(c, `insert into patch_proposals (site_id, base_version, instruction, summary, ops, errors, model, input_tokens, output_tokens, cache_read_tokens)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id::text`,
      [siteId, baseVersion, instruction, summary, JSON.stringify(ops), JSON.stringify(ops.filter((o) => o.error)), usage.model, usage.input, usage.output, usage.cacheRead]);
    const [job] = await rows<{ id: string }>(c, `select id from jobs where site_id = $1 order by created_at desc limit 1`, [siteId]);
    await emit(c, "patch.proposed", { jobId: job?.id, actor: "claude", source: "system", after: { proposal: p.id, model: usage.model, tokens: usage.input + usage.output, ops: ops.length } });
    return p.id;
  });
}

/** คนกดใช้ข้อเสนอ · ปฏิเสธถ้าเว็บถูกแก้หลังจาก AI เสนอ หรือมี op ไม่ผ่าน schema */
export async function applyProposal(id: string, checksFor: (config: Record<string, unknown>, template: string) => number, by = "Big") {
  await tx(async (c) => {
    const [p] = await rows<{ site_id: string; base_version: number; ops: ProposalOp[]; status: string }>(c, `select * from patch_proposals where id = $1 for update`, [id]);
    if (!p || p.status !== "proposed") throw new Error("ข้อเสนอนี้ถูกใช้หรือยกเลิกไปแล้ว");
    const [s] = await rows<{ version: number; config: Record<string, unknown>; template: string }>(c, `select version, config, template from sites where id = $1 for update`, [p.site_id]);
    if (s.version !== p.base_version) {
      await c.query(`update patch_proposals set status = 'stale' where id = $1`, [id]);
      throw new Error(`เว็บถูกแก้ไปแล้ว (v${p.base_version} → v${s.version}) · ขอให้ Claude เสนอใหม่`);
    }
    const bad = p.ops.filter((o) => o.error);
    if (bad.length) throw new Error(`มี ${bad.length} บล็อกไม่ผ่าน schema: ${bad.map((o) => o.block).join(", ")}`);
    const config = { ...s.config, ...Object.fromEntries(p.ops.map((o) => [o.block, o.data])) };
    await c.query(`insert into site_versions (site_id, version, config, actor, note) values ($1,$2,$3,$4,$5) on conflict do nothing`, [p.site_id, s.version, JSON.stringify(s.config), by, `ก่อน: ใช้ข้อเสนอ AI #${id}`]);
    await c.query(`update sites set version = version + 1, config = $2 where id = $1`, [p.site_id, JSON.stringify(config)]);
    await c.query(`update jobs set checks_passed = $2 where site_id = $1 and stage = 'template'`, [p.site_id, checksFor(config, s.template)]);
    await c.query(`update patch_proposals set status = 'applied' where id = $1`, [id]);
    await emit(c, "patch.applied", { actor: by, source: "human", after: { proposal: id, blocks: p.ops.map((o) => o.block) } });
    await emit(c, "site.version.saved", { actor: by, source: "human", before: s.version, after: s.version + 1 });
  });
}
export async function rejectProposal(id: string) {
  const r = await q(`update patch_proposals set status = 'rejected' where id = $1 and status = 'proposed' returning id`, [id]);
  if (!r.length) throw new Error("ข้อเสนอนี้ถูกใช้หรือยกเลิกไปแล้ว");
}
/** KPI: token เฉลี่ยต่อเว็บ (จากข้อเสนอที่ AI สร้าง) */
export const avgTokensPerSite = async () => Number((await one<{ v: string | null }>(`select avg(t) v from (select sum(coalesce(input_tokens,0) + coalesce(output_tokens,0)) t from patch_proposals group by site_id) x`))?.v ?? 0);

// ---------- ตรวจสลิปอัตโนมัติ ----------
import { evaluateSlip, type SlipRead } from "./slip-rules";
import { readSlip, aiConfigured, type SlipImageMime } from "./ai";

export const slipAutoApprove = () => (process.env.SLIP_AUTO_APPROVE ?? "on") !== "off";
const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** เก็บรูปสลิปเป็นรายการรอตรวจ · คืน null ถ้าข้อความ LINE นี้เคยรับแล้ว */
export async function createSlipFromImage(input: { clientId: string | null; source: "line" | "upload" | "portal"; lineMessageId?: string; bytes: Buffer; mime: SlipImageMime }) {
  return tx(async (c) => {
    const [s] = await rows<{ id: string }>(c, `insert into slips (client_id, source, line_message_id) values ($1,$2,$3) on conflict (line_message_id) do nothing returning id::text`,
      [input.clientId, input.source, input.lineMessageId ?? null]);
    if (!s) return null;
    await c.query(`insert into slip_images (slip_id, mime, bytes) values ($1,$2,$3)`, [s.id, input.mime, input.bytes]);
    await emit(c, "slip.received", { actor: input.source === "upload" ? "human" : "client", source: "system", after: { slip: s.id, via: input.source } });
    return s.id;
  });
}

export const slipImage = (id: string) => one<{ mime: string; bytes: Buffer }>(`select mime, bytes from slip_images where slip_id = $1`, [id]);

/** อ่านสลิปด้วย Claude → ตรวจกฎ → อนุมัติเองถ้าผ่านทุกข้อ (และเปิด SLIP_AUTO_APPROVE) · ไม่ผ่านข้อใด = รอคนตรวจ */
export async function processSlip(slipId: string): Promise<{ outcome: "approved" | "review"; reason?: string }> {
  const s = await one<{ client_id: string | null; status: string }>(`select client_id, status from slips where id = $1`, [slipId]);
  const img = await slipImage(slipId);
  if (!s || !img || s.status !== "pending") return { outcome: "review", reason: "ไม่พบสลิปหรือตรวจไปแล้ว" };
  if (!aiConfigured()) {
    await q(`update slips set checks = $2 where id = $1`, [slipId, JSON.stringify([{ rule: "อ่านสลิปอัตโนมัติ", ok: false, detail: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY" }])]);
    return { outcome: "review", reason: "no-ai" };
  }
  let read: SlipRead;
  try { read = (await readSlip(img.bytes, img.mime as SlipImageMime)).data; }
  catch (e) {
    await q(`update slips set checks = $2 where id = $1`, [slipId, JSON.stringify([{ rule: "อ่านสลิปอัตโนมัติ", ok: false, detail: (e as Error).message }])]);
    return { outcome: "review", reason: "read-failed" };
  }
  return tx(async (c) => {
    const docs = s.client_id ? await rows<{ no: string; due: number; issuedAt: string }>(c,
      `select no, (total_satang - paid_satang)::int due, issued_at::text "issuedAt" from documents where client_id = $1 and status = 'issued' and type in ('INV','RN') for update`, [s.client_id]) : [];
    const [{ used }] = await rows<{ used: boolean }>(c, `select exists (select 1 from slips where ref = $1 and status <> 'rejected' and id <> $2) used`, [read.ref ?? "", slipId]);
    const r = evaluateSlip(read, docs, {
      receiver: { names: list(process.env.SHOP_RECEIVER_NAMES), accountDigits: list(process.env.SHOP_RECEIVER_ACCOUNTS) },
      refUsed: used, now: new Date(), maxAgeDays: Number(process.env.SLIP_MAX_AGE_DAYS ?? 3),
    });
    await c.query(`update slips set read = $2, checks = $3, ref = $4, bank = $5, paid_at = $6, amount_satang = $7, doc_no = $8 where id = $1`,
      [slipId, JSON.stringify(read), JSON.stringify(r.checks), used ? null : read.ref, read.bank, read.paid_at && !isNaN(Date.parse(read.paid_at)) ? read.paid_at : null, r.amount, r.doc?.no ?? null]);
    if (r.allPass && slipAutoApprove()) {
      await verifySlipTx(c, slipId, true, "auto");
      return { outcome: "approved" as const };
    }
    const failed = r.checks.filter((x) => !x.ok).map((x) => x.rule).join(", ");
    await emit(c, "slip.needs_review", { actor: "system", source: "system", after: { slip: slipId, review: failed || "auto-approve off" } });
    return { outcome: "review" as const, reason: failed || "ปิดการอนุมัติอัตโนมัติ" };
  });
}

/** ข้อความจากระบบถึงลูกค้า (เช่น แจ้งผลสลิป) · ไม่เปลี่ยนสถานะอ่านแล้วของแชท */
export async function sendSystemMessage(clientId: string, text: string) {
  const to = await lineUserIdOf(clientId);
  const taskId = await tx(async (c) => {
    const [cv] = await rows<{ id: string }>(c, `select id from conversations where client_id = $1`, [clientId]);
    if (!cv) return null;
    const [m] = await rows<{ id: string }>(c, `insert into messages (conversation_id, sender, body, read_at, delivery) values ($1,'system',$2,now(),$3) returning id::text`, [cv.id, text, to ? "pending" : "none"]);
    if (!to) return null;
    const [t] = await rows<{ id: string }>(c, `insert into tasks (name, idempotency_key, payload) values ('line.push · แจ้งลูกค้า', $1, $2) returning id::text`,
      [`msg:${m.id}:line.push`, JSON.stringify({ message_id: m.id, to, retry_key: randomUUID() })]);
    return t.id;
  });
  if (taskId) await runLinePush(taskId);
}

export const hasOpenInvoice = async (clientId: string) =>
  Boolean(await one(`select 1 from documents where client_id = $1 and status = 'issued' and type in ('INV','RN') limit 1`, [clientId]));

/** หลังอ่านสลิป: แจ้งลูกค้าทาง LINE */
export async function notifySlipResult(slipId: string, outcome: "approved" | "review") {
  const s = await one<{ client_id: string | null; doc_no: string | null; amount: number | null }>(`select coalesce(s.client_id, d.client_id) client_id, s.doc_no, s.amount_satang::int amount from slips s left join documents d on d.no = s.doc_no where s.id = $1`, [slipId]);
  if (!s?.client_id) return;
  const rc = outcome === "approved" ? await one<{ no: string }>(`select no from documents where type = 'RC' and client_id = $1 order by no desc limit 1`, [s.client_id]) : undefined;
  await sendSystemMessage(s.client_id, outcome === "approved"
    ? `ได้รับชำระ ${((s.amount ?? 0) / 100).toLocaleString("th-TH")} บาท สำหรับ ${s.doc_no} เรียบร้อยแล้ว ขอบคุณค่ะ 🙏${rc ? ` (ใบเสร็จ ${rc.no})` : ""}`
    : "ได้รับสลิปแล้วค่ะ ทีมงานกำลังตรวจสอบและจะแจ้งกลับโดยเร็ว");
}
