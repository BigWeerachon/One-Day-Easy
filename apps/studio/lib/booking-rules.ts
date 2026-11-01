// คำนวณช่วงเวลาว่าง (pure · ทดสอบได้) · ประเทศไทยไม่มี DST → ใช้ UTC+7 คงที่
export const TZ_OFFSET_MIN = 7 * 60;

export interface Hours { resourceId: string | null; weekday: number; open: string; close: string } // "09:00"
export interface Closure { resourceId: string | null; from: string; to: string } // "YYYY-MM-DD" รวมทั้งสองวัน
export interface Busy { resourceId: string; start: Date; end: Date } // end = busy_until (รวม buffer)
export interface Service { code: string; durationMin: number; bufferMin: number; maxPerDay: number | null; resourceIds: string[] }
export interface Rules { stepMin: number; minNoticeMin: number; maxDaysAhead: number }
export interface Slot { start: Date; end: Date; resourceId: string }

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** วันที่ตามเวลาไทย "YYYY-MM-DD" */
export function localDate(d: Date): string {
  const x = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
/** เวลาไทย "HH:MM" */
export function localTime(d: Date): string {
  const x = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}
/** วัน + นาทีนับจากเที่ยงคืน (เวลาไทย) → Date (UTC) */
export function atLocal(date: string, minutes: number): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - TZ_OFFSET_MIN * 60_000);
}
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, mo - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** ช่วงเปิดของ resource ในวันนั้น · ตั้งเวลาเฉพาะ resource ไว้ = ใช้แทนเวลากลาง */
export function openWindows(resourceId: string, date: string, hours: Hours[], closures: Closure[]): [number, number][] {
  if (closures.some((c) => (c.resourceId === null || c.resourceId === resourceId) && c.from <= date && date <= c.to)) return [];
  const wd = weekdayOf(date);
  const own = hours.filter((h) => h.resourceId === resourceId && h.weekday === wd);
  const use = own.length ? own : hours.filter((h) => h.resourceId === null && h.weekday === wd);
  return use.map((h) => [toMin(h.open), toMin(h.close)] as [number, number]).sort((a, b) => a[0] - b[0]);
}

export interface DayInput { date: string; service: Service; hours: Hours[]; closures: Closure[]; busy: Busy[]; bookedToday: number; rules: Rules; now: Date }

/** เวลาเริ่มที่จองได้ในวันนั้น · 1 เวลา = 1 slot (เลือก resource ที่งานน้อยที่สุดในวันนั้น) */
export function slotsForDay(i: DayInput): Slot[] {
  const { date, service: s, rules, now } = i;
  const today = localDate(now);
  if (date < today || date > addDays(today, rules.maxDaysAhead)) return [];
  if (s.maxPerDay != null && i.bookedToday >= s.maxPerDay) return [];
  const earliest = now.getTime() + rules.minNoticeMin * 60_000;
  const load = new Map<string, number>();
  for (const b of i.busy) load.set(b.resourceId, (load.get(b.resourceId) ?? 0) + (b.end.getTime() - b.start.getTime()));
  const resources = [...s.resourceIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a.localeCompare(b));
  const out = new Map<number, Slot>();
  for (const r of resources) {
    const busy = i.busy.filter((b) => b.resourceId === r);
    for (const [open, close] of openWindows(r, date, i.hours, i.closures)) {
      // เวลาเริ่มชิดกับ step นับจากเวลาเปิด · ต้องจบงาน (ไม่รวม buffer) ก่อนปิด
      for (let m = open; m + s.durationMin <= close; m += rules.stepMin) {
        const start = atLocal(date, m);
        if (start.getTime() < earliest || out.has(start.getTime())) continue;
        const end = new Date(start.getTime() + s.durationMin * 60_000);
        const busyEnd = new Date(end.getTime() + s.bufferMin * 60_000);
        if (busy.some((b) => b.start < busyEnd && start < b.end)) continue;
        out.set(start.getTime(), { start, end, resourceId: r });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** เลือกช่วงเวลาที่ใกล้เวลาที่ลูกค้าขอที่สุด (ขอ 10 โมง แต่ว่าง 10:30 → เสนอ 10:30) */
export function nearestSlots(slots: Slot[], wantMin: number, n = 3): Slot[] {
  return [...slots].sort((a, b) => Math.abs(minutesOf(a.start) - wantMin) - Math.abs(minutesOf(b.start) - wantMin)).slice(0, n)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
export const minutesOf = (d: Date) => toMin(localTime(d));

// ---------- สถานะคิว ----------
export const BOOKING_STATUS = ["held", "confirmed", "checked_in", "in_service", "done", "cancelled", "no_show", "expired"] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];
export const STATUS_LABEL: Record<BookingStatus, string> = {
  held: "รอยืนยัน", confirmed: "จองแล้ว", checked_in: "มาถึงแล้ว", in_service: "กำลังให้บริการ",
  done: "เสร็จแล้ว", cancelled: "ยกเลิก", no_show: "ไม่มา", expired: "หมดเวลายืนยัน",
};
// ต้องตรงกับ trigger enforce_booking_status ใน 0009_booking.sql
export const NEXT_STATUS: Record<BookingStatus, BookingStatus[]> = {
  held: ["confirmed", "cancelled", "expired"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_service", "confirmed", "cancelled", "no_show"],
  in_service: ["done", "checked_in"],
  no_show: ["checked_in"],
  done: [], cancelled: [], expired: [],
};
export const canMove = (from: BookingStatus, to: BookingStatus) => NEXT_STATUS[from].includes(to);
export const ACTIVE: BookingStatus[] = ["held", "confirmed", "checked_in", "in_service"];

/** ลูกค้ายกเลิกเองได้ไหม */
export function canSelfCancel(status: BookingStatus, start: Date, now: Date, cutoffMin: number) {
  return (status === "held" || status === "confirmed") && start.getTime() - now.getTime() >= cutoffMin * 60_000;
}
