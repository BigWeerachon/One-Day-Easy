"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "./auth";
import * as B from "./booking";
import { sendSystemMessage, getClient } from "./store";
import { localTime, BOOKING_STATUS, type BookingStatus } from "./booking-rules";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, d = 0) => { const v = str(f, k); return v === "" ? d : Math.round(Number(v)); };
const back = (f: FormData) => { const b = str(f, "back"); return b.startsWith("/queue") ? b : "/queue"; };
async function run(p: string, fn: () => Promise<unknown>) {
  let err: string | undefined;
  try { await fn(); } catch (e) { err = (e as Error).message; }
  revalidatePath("/queue");
  const u = new URL(p, "http://x");
  u.searchParams.delete("err"); u.searchParams.delete("ok");
  if (err) u.searchParams.set("err", err);
  redirect(u.pathname + u.search);
}
const notify = (b: B.Booking, text: string) => (b.clientId ? sendSystemMessage(b.clientId, text).catch(() => {}) : Promise.resolve());

export async function createBookingAction(f: FormData) {
  const me = await requireStaff("queue.edit");
  await run(back(f), async () => {
    const walkin = str(f, "walkin") === "1";
    const clientId = str(f, "client") || null;
    const name = str(f, "name");
    const customerName = name || (clientId ? (await getClient(clientId))?.name ?? "" : "");
    if (!customerName) throw new Error("ต้องใส่ชื่อลูกค้าหรือเลือกลูกค้า");
    const startMs = Number(str(f, "slot"));
    if (!walkin && !startMs) throw new Error("ต้องเลือกเวลา");
    const start = walkin ? roundUp(new Date(), 5) : new Date(startMs);
    const b = await B.createBooking({
      serviceCode: str(f, "svc"), start, resourceId: str(f, "resource") || null, clientId, customerName,
      source: walkin ? "walkin" : "staff", status: walkin ? "checked_in" : "confirmed", by: me.name, note: str(f, "note"), force: walkin && str(f, "force") === "1",
    });
    if (!walkin && str(f, "notify") === "on") await notify(b, `ทีมงานจองคิวให้แล้วค่ะ ✅\n${b.serviceName}\n${B.thaiDay(b.day)} เวลา ${localTime(b.start)} น.\nคิวที่ ${b.queueNo} · รหัส ${b.code}`);
  });
}
const roundUp = (d: Date, min: number) => new Date(Math.ceil(d.getTime() / (min * 60_000)) * min * 60_000);

export async function setBookingStatusAction(f: FormData) {
  const me = await requireStaff("queue.edit");
  await run(back(f), async () => {
    const to = str(f, "to") as BookingStatus;
    if (!BOOKING_STATUS.includes(to)) throw new Error("สถานะไม่ถูกต้อง");
    const b = await B.setStatus(str(f, "id"), to, me.name, str(f, "reason") || undefined);
    if (to === "cancelled" && str(f, "notify") !== "off") await notify(b, `คิว ${b.code} (${B.thaiDay(b.day, true)} ${localTime(b.start)} น.) ถูกยกเลิกค่ะ\nเหตุผล: ${str(f, "reason") || "-"}\nพิมพ์ "จองคิว" เพื่อจองใหม่ได้เลยค่ะ`);
    if (to === "in_service") await notify(b, `ถึงคิวของคุณแล้วค่ะ 🔔 คิวที่ ${b.queueNo} · ${b.serviceName}`);
  });
}
export async function callNextAction(f: FormData) {
  const me = await requireStaff("queue.edit");
  await run(back(f), () => B.callNext(str(f, "day"), str(f, "resource") || null, me.name));
}
export async function rescheduleAction(f: FormData) {
  const me = await requireStaff("queue.edit");
  await run(back(f), async () => {
    const ms = Number(str(f, "slot"));
    if (!ms) throw new Error("ต้องเลือกเวลาใหม่");
    const b = await B.reschedule(str(f, "id"), new Date(ms), str(f, "resource") || null, me.name);
    if (str(f, "notify") === "on") await notify(b, `ทีมงานเลื่อนคิวให้แล้วค่ะ\n${b.serviceName}\n${B.thaiDay(b.day)} เวลา ${localTime(b.start)} น.\nรหัส ${b.code}`);
  });
}

// ---------- ตั้งค่า ----------
export async function saveSettingsAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.updateSettings({
    stepMin: int(f, "stepMin", 30), minNoticeMin: int(f, "minNoticeMin", 0), maxDaysAhead: int(f, "maxDaysAhead", 30), holdMin: int(f, "holdMin", 10),
    cancelCutoffMin: int(f, "cancelCutoffMin", 0), remindBeforeMin: int(f, "remindBeforeMin", 0), lineEnabled: f.get("lineEnabled") === "on",
  }));
}
export async function saveServiceAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.saveService({
    code: str(f, "code").toUpperCase(), name: str(f, "name"), durationMin: int(f, "durationMin"), bufferMin: int(f, "bufferMin"),
    maxPerDay: str(f, "maxPerDay") ? int(f, "maxPerDay") : null, price: str(f, "price") ? Math.round(Number(str(f, "price")) * 100) : null,
    lineBookable: f.get("lineBookable") === "on", active: f.get("active") === "on", resourceIds: f.getAll("resources").map(String),
  }));
}
export async function saveResourceAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.saveResource({ id: str(f, "id") || undefined, name: str(f, "name"), color: str(f, "color") || "#4f46e5", active: f.get("active") === "on" }));
}
export async function addHoursAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.addHours({ resourceId: str(f, "resource") || null, weekdays: f.getAll("wd").map(Number), open: str(f, "open"), close: str(f, "close") }));
}
export async function deleteHoursAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.deleteHours(str(f, "id")));
}
export async function addClosureAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.addClosure({ resourceId: str(f, "resource") || null, from: str(f, "from"), to: str(f, "to") || str(f, "from"), reason: str(f, "reason") }));
}
export async function deleteClosureAction(f: FormData) {
  await requireStaff("queue.setup");
  await run("/queue?view=setup", () => B.deleteClosure(str(f, "id")));
}
