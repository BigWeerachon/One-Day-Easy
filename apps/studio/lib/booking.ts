import "server-only";
import type { PoolClient } from "pg";
import { q, one, tx } from "./db";
import {
  slotsForDay, localDate, localTime, addDays, isDate, canMove, ACTIVE, STATUS_LABEL,
  type Hours, type Closure, type Busy, type Service, type Rules, type Slot, type BookingStatus,
} from "./booking-rules";
import { sendSystemMessage } from "./store";

type Db = Pick<PoolClient, "query">;
const rows = async <T>(c: Db, sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export class BookingError extends Error {}

// ---------- ค่าตั้ง ----------
export interface Settings { stepMin: number; minNoticeMin: number; maxDaysAhead: number; holdMin: number; cancelCutoffMin: number; remindBeforeMin: number; lineEnabled: boolean }
export const getSettings = async () => (await one<Settings>(`select slot_step_min "stepMin", min_notice_min "minNoticeMin", max_days_ahead "maxDaysAhead", hold_min "holdMin",
  cancel_cutoff_min "cancelCutoffMin", remind_before_min "remindBeforeMin", line_enabled "lineEnabled" from booking_settings where id = 1`))!;
export async function updateSettings(s: Settings) {
  await q(`update booking_settings set slot_step_min=$1, min_notice_min=$2, max_days_ahead=$3, hold_min=$4, cancel_cutoff_min=$5, remind_before_min=$6, line_enabled=$7, updated_at=now() where id = 1`,
    [s.stepMin, s.minNoticeMin, s.maxDaysAhead, s.holdMin, s.cancelCutoffMin, s.remindBeforeMin, s.lineEnabled]);
}

export interface Resource { id: string; name: string; color: string; active: boolean }
export interface ServiceRow extends Service { name: string; price: number | null; lineBookable: boolean; active: boolean }
export const listResources = (all = false) => q<Resource>(`select id, name, color, active from booking_resources where $1 or active order by sort, name`, [all]);
export const listServices = (all = false) => q<ServiceRow>(`select s.code, s.name, s.duration_min "durationMin", s.buffer_min "bufferMin", s.max_per_day "maxPerDay", s.price_satang::int price,
  s.line_bookable "lineBookable", s.active, coalesce(array_agg(r.id::text order by r.sort) filter (where r.id is not null and r.active), '{}') "resourceIds"
  from booking_services s left join booking_service_resources sr on sr.service_code = s.code left join booking_resources r on r.id = sr.resource_id
  where $1 or s.active group by s.code order by s.sort, s.name`, [all]);
export const getService = async (code: string) => (await listServices(true)).find((s) => s.code === code);
export const listHours = () => q<Hours & { id: string }>(`select id::text, resource_id "resourceId", weekday, to_char(open_time,'HH24:MI') open, to_char(close_time,'HH24:MI') close from booking_hours order by weekday, open_time`);
export const listClosures = (fromDate = "1900-01-01") => q<Closure & { id: string; reason: string }>(`select id::text, resource_id "resourceId", from_date::text "from", to_date::text "to", reason from booking_closures where to_date >= $1 order by from_date`, [fromDate]);

export async function saveService(s: { code: string; name: string; durationMin: number; bufferMin: number; maxPerDay: number | null; price: number | null; lineBookable: boolean; active: boolean; resourceIds: string[] }) {
  if (!/^[A-Z0-9_-]{2,20}$/.test(s.code)) throw new BookingError("รหัสบริการใช้ A-Z 0-9 _ - ยาว 2–20 ตัว");
  if (!s.name) throw new BookingError("ต้องใส่ชื่อบริการ");
  if (!(s.durationMin >= 5 && s.durationMin <= 720)) throw new BookingError("ระยะเวลาต้องอยู่ระหว่าง 5–720 นาที");
  if (!s.resourceIds.length) throw new BookingError("ต้องเลือกผู้ให้บริการอย่างน้อย 1 คน/ห้อง");
  await tx(async (c) => {
    await c.query(`insert into booking_services (code, name, duration_min, buffer_min, max_per_day, price_satang, line_bookable, active) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (code) do update set name=$2, duration_min=$3, buffer_min=$4, max_per_day=$5, price_satang=$6, line_bookable=$7, active=$8`,
      [s.code, s.name, s.durationMin, s.bufferMin, s.maxPerDay, s.price, s.lineBookable, s.active]);
    await c.query(`delete from booking_service_resources where service_code = $1`, [s.code]);
    for (const r of s.resourceIds) await c.query(`insert into booking_service_resources values ($1,$2)`, [s.code, r]);
  });
}
export async function saveResource(r: { id?: string; name: string; color: string; active: boolean }) {
  if (!r.name) throw new BookingError("ต้องใส่ชื่อ");
  if (r.id) await q(`update booking_resources set name=$2, color=$3, active=$4 where id=$1`, [r.id, r.name, r.color, r.active]);
  else await q(`insert into booking_resources (name, color, active) values ($1,$2,$3)`, [r.name, r.color, r.active]);
}
export async function addHours(h: { resourceId: string | null; weekdays: number[]; open: string; close: string }) {
  if (!/^\d{2}:\d{2}$/.test(h.open) || !/^\d{2}:\d{2}$/.test(h.close) || h.close <= h.open) throw new BookingError("เวลาปิดต้องหลังเวลาเปิด");
  if (!h.weekdays.length) throw new BookingError("ต้องเลือกวันอย่างน้อย 1 วัน");
  for (const wd of h.weekdays) await q(`insert into booking_hours (resource_id, weekday, open_time, close_time) values ($1,$2,$3,$4)`, [h.resourceId, wd, h.open, h.close]);
}
export const deleteHours = (id: string) => q(`delete from booking_hours where id = $1`, [id]);
export async function addClosure(c: { resourceId: string | null; from: string; to: string; reason: string }) {
  if (!isDate(c.from) || !isDate(c.to) || c.to < c.from) throw new BookingError("ช่วงวันที่ไม่ถูกต้อง");
  if (!c.reason) throw new BookingError("ต้องใส่เหตุผล");
  await q(`insert into booking_closures (resource_id, from_date, to_date, reason) values ($1,$2,$3,$4)`, [c.resourceId, c.from, c.to, c.reason]);
}
export const deleteClosure = (id: string) => q(`delete from booking_closures where id = $1`, [id]);

// ---------- ช่วงว่าง ----------
const rulesOf = (s: Settings): Rules => ({ stepMin: s.stepMin, minNoticeMin: s.minNoticeMin, maxDaysAhead: s.maxDaysAhead });
const ACTIVE_SQL = `status in ('held','confirmed','checked_in','in_service') and not (status = 'held' and hold_expires_at < now())`;

async function busyBetween(db: Db | undefined, fromDate: string, toDate: string, resourceIds: string[], excludeId?: string) {
  if (!resourceIds.length) return [];
  const sql = `select resource_id::text "resourceId", starts_at start, busy_until "end", service_code service, day::text as day from bookings
     where ${ACTIVE_SQL} and resource_id = any($1::uuid[]) and day between $2 and $3 and ($4::uuid is null or id <> $4)`;
  const p = [resourceIds, addDays(fromDate, -1), addDays(toDate, 1), excludeId ?? null];
  return db ? rows<BusyRow>(db, sql, p) : q<BusyRow>(sql, p);
}
type BusyRow = { resourceId: string; start: Date; end: Date; service: string; day: string };
const countByDay = (busy: { service: string; day: string }[], code: string, day: string) => busy.filter((b) => b.service === code && b.day === day).length;

export interface Availability { service: ServiceRow; settings: Settings; days: { date: string; slots: Slot[] }[] }
/** ช่วงว่างของบริการ ตั้งแต่ fromDate ไป n วัน */
export async function availability(code: string, fromDate: string, n: number, opts: { now?: Date; db?: Db; ignoreNotice?: boolean; excludeId?: string } = {}): Promise<Availability> {
  const service = await getService(code);
  if (!service || !service.active) throw new BookingError("ไม่พบบริการนี้");
  const settings = await getSettings();
  const now = opts.now ?? new Date();
  const [hours, closures] = await Promise.all([listHours(), listClosures(fromDate)]);
  const toDate = addDays(fromDate, n - 1);
  const busy = await busyBetween(opts.db, fromDate, toDate, service.resourceIds, opts.excludeId);
  const rules = rulesOf(settings);
  if (opts.ignoreNotice) rules.minNoticeMin = 0;
  const days = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(fromDate, i);
    days.push({ date, slots: slotsForDay({ date, service, hours, closures, busy: busy as Busy[], bookedToday: countByDay(busy, code, date), rules, now }) });
  }
  return { service, settings, days };
}
/** วันที่ยังมีคิวว่าง (ไล่จากวันนี้ไปจนถึง maxDaysAhead) */
export async function openDays(code: string, fromDate: string, limit = 7, now = new Date()) {
  const s = await getSettings();
  const span = Math.max(1, Math.min(s.maxDaysAhead + 1, 62));
  const a = await availability(code, fromDate, span, { now });
  return a.days.filter((d) => d.slots.length).slice(0, limit);
}

// ---------- จอง ----------
export interface Booking {
  id: string; code: string; clientId: string | null; customerName: string; serviceCode: string; serviceName: string; resourceId: string; resourceName: string; color: string;
  start: Date; end: Date; day: string; status: BookingStatus; queueNo: number | null; source: string; note: string | null; holdExpiresAt: Date | null; createdBy: string;
}
const B_COLS = `b.id, b.code, b.client_id "clientId", b.customer_name "customerName", b.service_code "serviceCode", s.name "serviceName", b.resource_id "resourceId", r.name "resourceName", r.color,
  b.starts_at start, b.ends_at "end", b.day::text as day, b.status, b.queue_no "queueNo", b.source, b.note, b.hold_expires_at "holdExpiresAt", b.created_by "createdBy"`;
const B_FROM = `from bookings b join booking_services s on s.code = b.service_code join booking_resources r on r.id = b.resource_id`;

export const getBooking = (id: string) => isUuid(id) ? one<Booking>(`select ${B_COLS} ${B_FROM} where b.id = $1`, [id]) : Promise.resolve(undefined);
export const listDay = (day: string) => q<Booking>(`select ${B_COLS} ${B_FROM} where b.day = $1 and b.status <> 'expired' and not (b.status = 'held' and b.hold_expires_at < now()) order by b.starts_at, r.sort`, [day]);
export const listRange = (from: string, to: string) => q<Booking>(`select ${B_COLS} ${B_FROM} where b.day between $1 and $2 and b.status not in ('expired','cancelled') and not (b.status = 'held' and b.hold_expires_at < now()) order by b.starts_at`, [from, to]);
export const clientUpcoming = (clientId: string) => q<Booking>(`select ${B_COLS} ${B_FROM} where b.client_id = $1 and b.status in ('held','confirmed','checked_in') and b.ends_at > now() and not (b.status = 'held' and b.hold_expires_at < now()) order by b.starts_at limit 5`, [clientId]);
export const bookingHistory = (id: string) => q<{ from: string | null; to: string; actor: string; note: string | null; at: string }>(`select from_status "from", to_status "to", actor, note, created_at::text at from booking_events where booking_id = $1 order by id`, [id]);

async function nextQueueNo(c: Db, day: string) {
  const [r] = await rows<{ n: number }>(c, `select coalesce(max(queue_no), 0) + 1 n from bookings where day = $1`, [day]);
  return r.n;
}
const lockDay = (c: Db, day: string) => c.query(`select pg_advisory_xact_lock(hashtext('booking:' || $1))`, [day]);
const logEv = (c: Db, id: string, from: string | null, to: string, actor: string, note?: string | null) =>
  c.query(`insert into booking_events (booking_id, from_status, to_status, actor, note) values ($1,$2,$3,$4,$5)`, [id, from, to, actor, note ?? null]);

export interface NewBooking {
  serviceCode: string; start: Date; resourceId?: string | null; clientId?: string | null; customerName: string;
  source: "line" | "staff" | "walkin" | "portal"; status: "held" | "confirmed" | "checked_in"; by: string; note?: string; force?: boolean;
}
/** สร้างคิว · ตรวจกับช่วงว่างจริงภายใต้ lock ของวัน · DB กันจองซ้อนอีกชั้น (exclusion constraint) */
export async function createBooking(n: NewBooking): Promise<Booking> {
  const id = await tx(async (c) => {
    await expireHolds(c);
    const day = localDate(n.start);
    await lockDay(c, day);
    const service = await getService(n.serviceCode);
    if (!service?.active) throw new BookingError("ไม่พบบริการนี้");
    const settings = await getSettings();
    let resourceId = n.resourceId || null;
    if (!n.force) {
      const a = await availability(n.serviceCode, day, 1, { db: c, ignoreNotice: n.source !== "line" && n.source !== "portal" });
      const ok = a.days[0].slots.filter((s) => s.start.getTime() === n.start.getTime() && (!resourceId || s.resourceId === resourceId));
      if (!ok.length) {
        if (resourceId) {
          // ระบบเลือกคนให้ได้ แต่คนที่ขอไม่ว่าง → ตรวจว่าทั้ง slot ว่างไหม
          const any = a.days[0].slots.find((s) => s.start.getTime() === n.start.getTime());
          throw new BookingError(any ? "ผู้ให้บริการที่เลือกไม่ว่างเวลานี้ ลองเลือกคนอื่น" : "เวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาอื่น");
        }
        throw new BookingError("เวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาอื่น");
      }
      resourceId = ok[0].resourceId;
    }
    // แทรกคิว (force) โดยไม่เลือกคน → คนที่ทำบริการนี้ได้และไม่ได้กำลังให้บริการ
    if (!resourceId && n.force) resourceId = (await rows<{ id: string }>(c, `select r::text as id from unnest($1::uuid[]) r order by exists (select 1 from bookings b where b.resource_id = r and b.status = 'in_service') limit 1`, [service.resourceIds]))[0]?.id ?? null;
    if (!resourceId) throw new BookingError("ต้องเลือกผู้ให้บริการ");
    const end = new Date(n.start.getTime() + service.durationMin * 60_000);
    const busyUntil = new Date(end.getTime() + service.bufferMin * 60_000);
    const queueNo = n.status === "held" ? null : await nextQueueNo(c, day);
    let r: { id: string }[];
    try {
      r = await rows<{ id: string }>(c, `insert into bookings (client_id, customer_name, service_code, resource_id, starts_at, ends_at, busy_until, status, queue_no, source, hold_expires_at, note, created_by, confirmed_at, checked_in_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $8 = 'held' then now() + interval '1 minute' * $11 end, $12, $13, case when $8 <> 'held' then now() end, case when $8 = 'checked_in' then now() end) returning id`,
        [n.clientId ?? null, n.customerName, n.serviceCode, resourceId, n.start, end, busyUntil, n.status, queueNo, n.source, settings.holdMin, n.note || null, n.by]);
    } catch (e) {
      if ((e as { code?: string }).code === "23P01") throw new BookingError("เวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาอื่น");
      throw e;
    }
    await logEv(c, r[0].id, null, n.status, n.by, n.note);
    return r[0].id;
  });
  return (await getBooking(id))!;
}

const STAMP: Partial<Record<BookingStatus, string>> = { confirmed: "confirmed_at", checked_in: "checked_in_at", in_service: "started_at", done: "finished_at" };
/** เปลี่ยนสถานะตามลำดับที่อนุญาต · ยืนยัน/มาถึง = ออกเลขคิวของวัน */
export async function setStatus(id: string, to: BookingStatus, by: string, note?: string, db?: Db): Promise<Booking> {
  const run = async (c: Db) => {
    const [b] = await rows<{ status: BookingStatus; day: string; queue_no: number | null; hold_expires_at: Date | null }>(c, `select status, day::text, queue_no, hold_expires_at from bookings where id = $1 for update`, [id]);
    if (!b) throw new BookingError("ไม่พบคิวนี้");
    if (b.status === to) return;
    if (b.status === "held" && to === "confirmed" && b.hold_expires_at && b.hold_expires_at < new Date()) {
      await c.query(`update bookings set status = 'expired' where id = $1`, [id]);
      await logEv(c, id, "held", "expired", "system");
      throw new BookingError("หมดเวลายืนยันแล้ว กรุณาเลือกเวลาใหม่");
    }
    if (!canMove(b.status, to)) throw new BookingError(`เปลี่ยนจาก "${STATUS_LABEL[b.status]}" เป็น "${STATUS_LABEL[to]}" ไม่ได้`);
    if (to === "cancelled" && !note) note = "ไม่ระบุเหตุผล";
    let queueNo = b.queue_no;
    if (queueNo == null && (to === "confirmed" || to === "checked_in")) { await lockDay(c, b.day); queueNo = await nextQueueNo(c, b.day); }
    const stamp = STAMP[to];
    await c.query(`update bookings set status = $2, queue_no = $3, hold_expires_at = null${stamp ? `, ${stamp} = now()` : ""}${to === "cancelled" ? ", cancel_reason = $4" : ""} where id = $1`,
      to === "cancelled" ? [id, to, queueNo, note] : [id, to, queueNo]);
    await logEv(c, id, b.status, to, by, note);
  };
  if (db) { await run(db); return undefined as unknown as Booking; } // อยู่ใน tx ของผู้เรียก · ยังไม่ commit
  await tx(run);
  return (await getBooking(id))!;
}

/** เลื่อนเวลา (ทีมงาน) · ตรวจช่วงว่างใหม่โดยไม่นับคิวตัวเอง */
export async function reschedule(id: string, start: Date, resourceId: string | null, by: string) {
  await tx(async (c) => {
    const [b] = await rows<{ status: BookingStatus; service_code: string; starts_at: Date }>(c, `select status, service_code, starts_at from bookings where id = $1 for update`, [id]);
    if (!b) throw new BookingError("ไม่พบคิวนี้");
    if (!["held", "confirmed"].includes(b.status)) throw new BookingError("เลื่อนได้เฉพาะคิวที่ยังไม่มาถึง");
    const day = localDate(start);
    await lockDay(c, day);
    const a = await availability(b.service_code, day, 1, { db: c, ignoreNotice: true, excludeId: id });
    const slot = a.days[0].slots.find((s) => s.start.getTime() === start.getTime() && (!resourceId || s.resourceId === resourceId));
    if (!slot) throw new BookingError("เวลาใหม่ไม่ว่าง");
    const svc = a.service;
    const end = new Date(start.getTime() + svc.durationMin * 60_000);
    const changedDay = localDate(b.starts_at) !== day;
    try {
      await c.query(`update bookings set starts_at = $2, ends_at = $3, busy_until = $4, resource_id = $5, reminded_at = null${changedDay ? ", queue_no = null" : ""} where id = $1`,
        [id, start, end, new Date(end.getTime() + svc.bufferMin * 60_000), slot.resourceId]);
      if (changedDay && b.status === "confirmed") await c.query(`update bookings set queue_no = $2 where id = $1`, [id, await nextQueueNo(c, day)]);
    } catch (e) {
      if ((e as { code?: string }).code === "23P01") throw new BookingError("เวลาใหม่เพิ่งถูกจองไป");
      throw e;
    }
    await logEv(c, id, b.status, b.status, by, `เลื่อนจาก ${localDate(b.starts_at)} ${localTime(b.starts_at)} เป็น ${day} ${localTime(start)}`);
  });
  return (await getBooking(id))!;
}

// ---------- รันคิวหน้างาน ----------
/** เรียกคิวถัดไป: คิวที่มาถึงแล้ว (เรียงตามเวลานัด แล้วเลขคิว) → กำลังให้บริการ · แจ้งลูกค้าทาง LINE */
export async function callNext(day: string, resourceId: string | null, by: string) {
  const next = await tx(async (c) => {
    await lockDay(c, day);
    const busyRes = await rows<{ resource_id: string }>(c, `select distinct resource_id::text from bookings where day = $1 and status = 'in_service'`, [day]);
    const [b] = await rows<{ id: string }>(c, `select id from bookings where day = $1 and status = 'checked_in' and ($2::uuid is null or resource_id = $2)
      and not (resource_id::text = any($3::text[])) order by starts_at, queue_no limit 1 for update skip locked`, [day, resourceId, busyRes.map((r) => r.resource_id)]);
    if (!b) return null;
    await setStatus(b.id, "in_service", by, "เรียกคิว", c);
    return b.id;
  });
  if (!next) throw new BookingError("ไม่มีคิวที่มาถึงแล้วรออยู่ (หรือผู้ให้บริการยังติดคิวก่อนหน้า)");
  const b = (await getBooking(next))!;
  if (b.clientId) await sendSystemMessage(b.clientId, `ถึงคิวของคุณแล้วค่ะ 🔔 คิวที่ ${b.queueNo} · ${b.serviceName} กับ ${b.resourceName}`).catch(() => {});
  return b;
}

export interface DayStats { total: number; waiting: number; inService: number; done: number; noShow: number; cancelled: number }
export function statsOf(list: Booking[]): DayStats {
  const n = (s: BookingStatus[]) => list.filter((b) => s.includes(b.status)).length;
  return { total: n(["held", "confirmed", "checked_in", "in_service", "done", "no_show"]), waiting: n(["checked_in"]), inService: n(["in_service"]), done: n(["done"]), noShow: n(["no_show"]), cancelled: n(["cancelled"]) };
}

// ---------- งานตามเวลา ----------
export async function expireHolds(db?: Db) {
  const run = async (c: Db) => {
    const r = await rows<{ id: string }>(c, `update bookings set status = 'expired' where status = 'held' and hold_expires_at < now() returning id`);
    for (const x of r) await logEv(c, x.id, "held", "expired", "system");
    return r.length;
  };
  return db ? run(db) : tx(run);
}
/** ส่ง LINE เตือนก่อนถึงคิว (ครั้งเดียวต่อคิว) */
export async function sendReminders(limit = 50) {
  const s = await getSettings();
  if (!s.remindBeforeMin) return 0;
  const due = await q<{ id: string }>(`update bookings set reminded_at = now() where id in (
      select id from bookings where status = 'confirmed' and reminded_at is null and client_id is not null
      and starts_at > now() and starts_at <= now() + interval '1 minute' * $1
      and created_at < starts_at - interval '1 minute' * least($1, 120) order by starts_at limit $2 for update skip locked) returning id`, [s.remindBeforeMin, limit]);
  for (const { id } of due) {
    const b = await getBooking(id);
    if (b?.clientId) await sendSystemMessage(b.clientId, `แจ้งเตือนคิว ⏰\n${b.serviceName}\n${thaiDay(b.day)} เวลา ${localTime(b.start)} น.\nรหัสคิว ${b.code}\n\nถ้าไม่สะดวก พิมพ์ "ยกเลิกคิว" ได้เลยค่ะ`).catch(() => {});
  }
  return due.length;
}

// ---------- แสดงผล ----------
const TH_WD = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_WD_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiDay(date: string, short = false) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return short ? `${TH_WD_SHORT[wd]} ${d} ${TH_MO[m - 1]}` : `วัน${TH_WD[wd]}ที่ ${d} ${TH_MO[m - 1]} ${y + 543}`;
}
export { ACTIVE, STATUS_LABEL };
