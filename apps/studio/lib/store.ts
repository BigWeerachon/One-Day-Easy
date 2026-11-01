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
export const listSlips = (status = "pending") => q<Slip & { due: number; clientName: string }>(
  `select s.id::text, s.doc_no "docNo", s.amount_satang::int amount, s.status, s.created_at::text at, (d.total_satang - d.paid_satang)::int due, c.name "clientName"
   from slips s join documents d on d.no = s.doc_no join clients c on c.id = d.client_id where s.status = $1 order by s.created_at`, [status]);
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

export async function verifySlip(slipId: string, accept: boolean, by = "Big") {
  await tx(async (c) => {
    const [s] = await rows<{ doc_no: string; amount_satang: string; status: string }>(c, `select * from slips where id = $1 for update`, [slipId]);
    if (!s || s.status !== "pending") throw new Error("สลิปนี้ตรวจไปแล้ว");
    const [d] = await rows<{ no: string; client_id: string; job_id: string | null; total_satang: string; paid_satang: string }>(c, `select * from documents where no = $1 for update`, [s.doc_no]);
    const amount = Number(s.amount_satang);
    await c.query(`update slips set status = $2, verified_by = $3 where id = $1`, [slipId, accept ? "verified" : "rejected", by]);
    await emit(c, accept ? "slip.verified" : "slip.rejected", { jobId: d.job_id, actor: by, source: "human", after: amount });
    if (!accept) return;
    const paid = Number(d.paid_satang) + amount, total = Number(d.total_satang);
    await c.query(`insert into payments (doc_no, amount_satang, method) values ($1,$2,'promptpay')`, [d.no, amount]);
    await c.query(`update documents set paid_satang = $2, status = case when $2 >= total_satang then 'paid' else status end where no = $1`, [d.no, paid]);
    await emit(c, "payment.recorded", { jobId: d.job_id, actor: by, source: "human", after: paid });
    if (paid < total) return;
    await c.query(`insert into document_events (doc_no, kind) values ($1, 'paid')`, [d.no]);
    await issueDocTx(c, "RC", d.client_id, total, d.job_id);
    if (d.job_id) {
      const [j] = await rows<{ stage: Stage }>(c, `select stage from jobs where id = $1`, [d.job_id]);
      if (j?.stage === "payment") await moveJobTx(c, d.job_id, "online", "system");
    }
  });
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
export async function receiveLineMessage(m: IncomingLine): Promise<"new" | "duplicate"> {
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
    if (!ins.length) return "duplicate";
    await c.query(`update clients set last_contact_at = now() where id = $1`, [ct.client_id]);
    const [job] = await rows<{ id: string }>(c, `select id from jobs where client_id = $1 order by created_at desc limit 1`, [ct.client_id]);
    await emit(c, "message.received", { jobId: job?.id, actor: "client", source: "system", after: "line" });
    return "new";
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
