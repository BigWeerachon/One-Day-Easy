import "server-only";
import { q, one } from "./db";
import type { QuickItem } from "./line";
import { sendSystemMessage } from "./store";
import { addDays, localDate, localTime, minutesOf, nearestSlots, canSelfCancel, type Slot } from "./booking-rules";
import { parseThaiDate, parseThaiTime, detectIntent, normalize } from "./thai-date";
import {
  getSettings, listServices, listClosures, availability, openDays, createBooking, setStatus, reschedule, clientUpcoming, getBooking, thaiDay, BookingError, type ServiceRow, type Booking,
} from "./booking";

// บอทจองคิวใน LINE · ทำงานเฉพาะข้อความที่เกี่ยวกับคิว · นอกนั้นปล่อยให้ทีมตอบในกล่องข้อความตามปกติ
// ปุ่ม (postback data): bk:svc:CODE · bk:day:CODE:DATE · bk:slot:CODE:EPOCH · bk:ok:ID · bk:x:ID · bk:xq:ID · bk:my · bk:mv:ID · bk:mvok:ID:EPOCH
const BOT = "ลูกค้า (LINE)";
const SESSION_MIN = 30;

interface Session { code?: string; date?: string; moveId?: string }
const getSession = async (userId: string) =>
  (await one<{ state: Session }>(`select state from line_booking_sessions where line_user_id = $1 and updated_at > now() - interval '1 minute' * $2`, [userId, SESSION_MIN]))?.state ?? {};
const setSession = (userId: string, s: Session) =>
  q(`insert into line_booking_sessions (line_user_id, state, updated_at) values ($1,$2,now()) on conflict (line_user_id) do update set state = $2, updated_at = now()`, [userId, JSON.stringify(s)]);

const say = (clientId: string, text: string, quick?: QuickItem[]) => sendSystemMessage(clientId, text, quick);
const hhmm = (d: Date) => localTime(d);
const bookable = async () => (await listServices()).filter((s) => s.lineBookable && s.resourceIds.length);
const dayBtn = (code: string, date: string): QuickItem => ({ label: thaiDayShort(date), data: `bk:day:${code}:${date}`, display: thaiDay(date) });
const slotBtn = (code: string, s: Slot, prefix = "bk:slot"): QuickItem => ({ label: hhmm(s.start), data: `${prefix}:${code}:${s.start.getTime()}`, display: `${hhmm(s.start)} น.` });
function thaiDayShort(date: string) {
  const today = localDate(new Date());
  const t = thaiDay(date, true);
  return date === today ? `วันนี้ ${t.split(" ").slice(1).join(" ")}` : t;
}
const summary = (b: Booking) => `${b.serviceName}\n${thaiDay(b.day)}\nเวลา ${hhmm(b.start)}–${hhmm(b.end)} น. · ${b.resourceName}`;

function matchService(text: string, list: ServiceRow[]) {
  const t = normalize(text).toLowerCase();
  // ภาษาไทยไม่เว้นวรรค → เทียบชื่อเต็ม รหัส หรือ 6 ตัวอักษรแรกของชื่อ/แต่ละคำ (เช่น "ปรึกษา", "ถ่ายรู")
  const keys = (s: ServiceRow) => [s.name, s.code, ...s.name.split(/\s+/)].map((w) => w.toLowerCase()).flatMap((w) => [w, w.slice(0, 6)]).filter((w) => w.length >= 4 && !/^(วัน|เวลา|บริการ)/.test(w));
  return list.find((s) => keys(s).some((k) => t.includes(k)));
}

/** ข้อความจากลูกค้า · คืน true ถ้าบอทตอบเอง */
export async function handleBookingText(clientId: string, userId: string, text: string, customerName: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.lineEnabled) return false;
  const services = await bookable();
  if (!services.length) return false;
  const sess = await getSession(userId);
  const today = localDate(new Date());
  const date = parseThaiDate(text, today);
  const time = parseThaiTime(text);
  let intent = detectIntent(text);
  // กำลังคุยเรื่องคิวอยู่ แล้วตอบมาแค่วัน/เวลา เช่น "พรุ่งนี้บ่าย 2"
  if (!intent && (sess.code || sess.moveId) && (date || time != null) && normalize(text).length <= 40) intent = "book";
  if (!intent) return false;

  try {
    if (intent === "my") return await showMine(clientId), true;
    if (intent === "cancel") return await askCancel(clientId), true;
    if (intent === "reschedule") return await askMove(clientId, userId), true;

    const svc = matchService(text, services) ?? services.find((s) => s.code === sess.code) ?? (services.length === 1 ? services[0] : undefined);
    if (!svc) {
      await setSession(userId, { date: date ?? undefined });
      await say(clientId, "ต้องการจองบริการไหนคะ 😊", services.map((s) => ({ label: s.name, data: `bk:svc:${s.code}` })));
      return true;
    }
    const d = date ?? sess.date;
    await setSession(userId, { code: svc.code, date: d, moveId: sess.moveId });
    if (d) await offerDay(clientId, svc, d, time, intent === "book" && !sess.moveId, customerName, sess.moveId);
    else await offerDays(clientId, svc, today, sess.moveId);
    return true;
  } catch (e) {
    if (e instanceof BookingError) { await say(clientId, e.message); return true; }
    throw e;
  }
}

/** กดปุ่มใน LINE */
export async function handleBookingPostback(clientId: string, userId: string, data: string, customerName: string): Promise<boolean> {
  if (!data.startsWith("bk:")) return false;
  const [, op, a, b] = data.split(":");
  const today = localDate(new Date());
  try {
    const services = await bookable();
    const svc = (code: string) => { const s = services.find((x) => x.code === code); if (!s) throw new BookingError("บริการนี้ปิดรับจองผ่าน LINE แล้ว"); return s; };
    const sess = await getSession(userId);
    switch (op) {
      case "svc": await setSession(userId, { ...sess, code: a }); return sess.date ? await offerDay(clientId, svc(a), sess.date, null, false, customerName, sess.moveId) : await offerDays(clientId, svc(a), today, sess.moveId), true;
      case "day": await setSession(userId, { ...sess, code: a, date: b }); return await offerDay(clientId, svc(a), b, null, false, customerName, sess.moveId), true;
      case "more": return await offerDays(clientId, svc(a), b, sess.moveId), true;
      case "slot": return await hold(clientId, svc(a), new Date(Number(b)), customerName), true;
      case "ok": {
        const bk = await mine(clientId, a);
        const done = await setStatus(bk.id, "confirmed", BOT);
        await setSession(userId, {});
        await say(clientId, `จองคิวสำเร็จ ✅\n${summary(done)}\nคิวที่ ${done.queueNo} · รหัส ${done.code}\n\nพิมพ์ "คิวของฉัน" เพื่อดู หรือ "ยกเลิกคิว" ได้ตลอดค่ะ`);
        return true;
      }
      case "x": {
        const bk = await mine(clientId, a);
        if (bk.status === "held") { await setStatus(bk.id, "cancelled", BOT, "ลูกค้าไม่ยืนยัน"); await say(clientId, "ยกเลิกการกันที่แล้วค่ะ อยากจองเวลาอื่นพิมพ์ \"จองคิว\" ได้เลย"); return true; }
        return await askCancelOne(clientId, bk), true;
      }
      case "xq": {
        const bk = await mine(clientId, a);
        const s = await getSettings();
        if (!canSelfCancel(bk.status, bk.start, new Date(), s.cancelCutoffMin)) { await say(clientId, `ยกเลิกเองได้ถึง ${Math.round(s.cancelCutoffMin / 60)} ชั่วโมงก่อนเวลานัดค่ะ ทีมงานจะติดต่อกลับเพื่อช่วยดำเนินการ`); return true; }
        await setStatus(bk.id, "cancelled", BOT, "ลูกค้ายกเลิกผ่าน LINE");
        await say(clientId, `ยกเลิกคิว ${bk.code} แล้วค่ะ\n${summary(bk)}`);
        return true;
      }
      case "my": return await showMine(clientId), true;
      case "mv": {
        const bk = await mine(clientId, a);
        await setSession(userId, { code: bk.serviceCode, moveId: bk.id });
        return await offerDays(clientId, svc(bk.serviceCode), today, bk.id), true;
      }
      case "mvok": {
        const bk = await mine(clientId, a);
        const s = await getSettings();
        if (!canSelfCancel(bk.status, bk.start, new Date(), s.cancelCutoffMin)) { await say(clientId, "ใกล้เวลานัดแล้ว เลื่อนเองไม่ได้ค่ะ ทีมงานจะติดต่อกลับ"); return true; }
        const start = new Date(Number(b));
        if (start.getTime() < Date.now() + s.minNoticeMin * 60_000) throw new BookingError("เวลานี้กระชั้นเกินไป กรุณาเลือกเวลาอื่น");
        const moved = await reschedule(bk.id, start, null, BOT);
        await setSession(userId, {});
        await say(clientId, `เลื่อนคิวแล้วค่ะ ✅\n${summary(moved)}\nคิวที่ ${moved.queueNo ?? "-"} · รหัส ${moved.code}`);
        return true;
      }
    }
    return false;
  } catch (e) {
    if (e instanceof BookingError) { await say(clientId, e.message, op === "slot" ? [{ label: "ดูเวลาว่าง", data: `bk:svc:${a}`, display: "ดูเวลาว่าง" }] : undefined); return true; }
    throw e;
  }
}

async function mine(clientId: string, id: string) {
  const b = await getBooking(id);
  if (!b || b.clientId !== clientId) throw new BookingError("ไม่พบคิวนี้");
  return b;
}

async function offerDays(clientId: string, svc: ServiceRow, from: string, moveId?: string) {
  const days = await openDays(svc.code, from, 10);
  if (!days.length) { await say(clientId, `ขออภัยค่ะ ${svc.name} คิวเต็มทุกวันในช่วงที่เปิดจอง ทีมงานจะติดต่อกลับเพื่อหาเวลาให้นะคะ`); return; }
  const lines = days.map((d) => `• ${thaiDay(d.date, true)} — ว่าง ${d.slots.length} เวลา`);
  const quick = days.map((d) => dayBtn(svc.code, d.date));
  const last = days[days.length - 1].date;
  if (quick.length < 13) quick.push({ label: "วันถัดไป ›", data: `bk:more:${svc.code}:${nextDay(last)}`, display: "ดูวันถัดไป" });
  await say(clientId, `${moveId ? "เลือกวันใหม่ที่ต้องการเลื่อนไป" : `วันที่ว่างสำหรับ ${svc.name}`} (${svc.durationMin} นาที)\n${lines.join("\n")}\n\nเลือกวันได้เลย หรือพิมพ์วันที่ เช่น "15 พ.ย." ค่ะ`, quick);
}
const nextDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return localDate(new Date(Date.UTC(y, m - 1, dd + 1, 5))); };

async function offerDay(clientId: string, svc: ServiceRow, date: string, wantMin: number | null, autoHold: boolean, customerName: string, moveId?: string) {
  const today = localDate(new Date());
  const a = await availability(svc.code, date, 1);
  const slots = a.days[0].slots;
  if (!slots.length) {
    const max = addDays(today, a.settings.maxDaysAhead);
    const why = date < today ? "เป็นวันที่ผ่านมาแล้ว" : date > max ? `เปิดให้จองล่วงหน้าไม่เกิน ${a.settings.maxDaysAhead} วัน (ถึง${thaiDay(max)})`
      : (await closureOf(date)) ?? "ไม่มีคิวว่าง";
    const from = date < today || date > max ? today : addDays(date, -3) < today ? today : addDays(date, -3);
    const alt = (await openDays(svc.code, from, 8)).filter((d) => d.date !== date).slice(0, 6);
    await say(clientId, `${thaiDay(date)} ${why}ค่ะ${alt.length ? "\nวันที่ใกล้เคียงที่ว่าง:" : ""}`, alt.map((d) => dayBtn(svc.code, d.date)));
    return;
  }
  const prefix = moveId ? `bk:mvok:${moveId}` : "bk:slot";
  const btn = (s: Slot): QuickItem => moveId ? { label: hhmm(s.start), data: `bk:mvok:${moveId}:${s.start.getTime()}`, display: `เลื่อนไป ${hhmm(s.start)} น.` } : slotBtn(svc.code, s, prefix);
  if (wantMin != null) {
    const exact = slots.find((s) => minutesOf(s.start) === wantMin);
    if (exact && autoHold) return hold(clientId, svc, exact.start, customerName);
    const near = nearestSlots(slots, wantMin, 4);
    await say(clientId, exact ? `${thaiDay(date)} เวลา ${hhmm(exact.start)} น. ว่างค่ะ กดเลือกเพื่อ${moveId ? "เลื่อน" : "จอง"}ได้เลย` : `${thaiDay(date)} เวลาที่ขอไม่ว่างค่ะ เวลาใกล้เคียงที่ว่าง:`, (exact ? [exact] : near).map(btn).concat(
      [{ label: "ดูทุกเวลา", data: `bk:day:${svc.code}:${date}`, display: "ดูเวลาอื่น" }]));
    return;
  }
  const shown = slots.slice(0, 12);
  await say(clientId, `${thaiDay(date)} มีคิวว่าง ${slots.length} เวลา${slots.length > 12 ? ` (แสดง 12 เวลาแรก · พิมพ์เวลาที่ต้องการ เช่น "บ่าย 3" ได้)` : ""}\nเลือกเวลาได้เลยค่ะ`,
    shown.map(btn).concat([{ label: "วันอื่น", data: `bk:svc:${svc.code}`, display: "ดูวันอื่น" }]));
}

async function closureOf(date: string) {
  const c = (await listClosures(date)).find((x) => x.resourceId === null && x.from <= date && date <= x.to);
  return c ? `ปิดรับคิว (${c.reason})` : null;
}

async function hold(clientId: string, svc: ServiceRow, start: Date, customerName: string) {
  const existing = (await clientUpcoming(clientId)).find((b) => b.status === "held");
  if (existing) await setStatus(existing.id, "cancelled", BOT, "เลือกเวลาใหม่").catch(() => {});
  const b = await createBooking({ serviceCode: svc.code, start, clientId, customerName, source: "line", status: "held", by: BOT });
  const s = await getSettings();
  await say(clientId, `กันที่ไว้ให้แล้วค่ะ ⏳ (${s.holdMin} นาที)\n${summary(b)}${svc.price ? `\nราคา ${(svc.price / 100).toLocaleString("th-TH")} บาท` : ""}\n\nกด "ยืนยัน" เพื่อจองคิว`, [
    { label: "✅ ยืนยัน", data: `bk:ok:${b.id}`, display: "ยืนยันการจอง" },
    { label: "เปลี่ยนเวลา", data: `bk:day:${svc.code}:${b.day}`, display: "ขอเปลี่ยนเวลา" },
    { label: "ยกเลิก", data: `bk:x:${b.id}`, display: "ยกเลิก" },
  ]);
}

async function showMine(clientId: string) {
  const list = (await clientUpcoming(clientId)).filter((b) => b.status !== "held");
  if (!list.length) { await say(clientId, "ยังไม่มีคิวที่จองไว้ค่ะ พิมพ์ \"จองคิว\" เพื่อจองได้เลย", [{ label: "จองคิว", data: "bk:svc:" + ((await bookable())[0]?.code ?? ""), display: "จองคิว" }]); return; }
  await say(clientId, "คิวของคุณ 📋\n\n" + list.map((b) => `${b.code} · คิวที่ ${b.queueNo ?? "-"}\n${summary(b)}`).join("\n\n"),
    list.flatMap((b) => [{ label: `เลื่อน ${b.code.slice(-4)}`, data: `bk:mv:${b.id}`, display: `ขอเลื่อนคิว ${b.code}` }, { label: `ยกเลิก ${b.code.slice(-4)}`, data: `bk:x:${b.id}`, display: `ขอยกเลิกคิว ${b.code}` }]));
}
async function askCancel(clientId: string) {
  const list = (await clientUpcoming(clientId)).filter((b) => b.status === "confirmed");
  if (!list.length) { await say(clientId, "ไม่พบคิวที่ยกเลิกได้ค่ะ"); return; }
  if (list.length === 1) return askCancelOne(clientId, list[0]);
  await say(clientId, "ต้องการยกเลิกคิวไหนคะ\n\n" + list.map((b) => `${b.code}: ${thaiDay(b.day, true)} ${hhmm(b.start)} น.`).join("\n"),
    list.map((b) => ({ label: `${thaiDay(b.day, true)} ${hhmm(b.start)}`, data: `bk:x:${b.id}`, display: `ยกเลิกคิว ${b.code}` })));
}
async function askCancelOne(clientId: string, b: Booking) {
  await say(clientId, `ยืนยันยกเลิกคิวนี้ไหมคะ\n${summary(b)}\nรหัส ${b.code}`, [
    { label: "ยืนยันยกเลิก", data: `bk:xq:${b.id}`, display: "ยืนยันยกเลิกคิว" }, { label: "ไม่ยกเลิก", data: "bk:my", display: "ไม่ยกเลิก" }]);
}
async function askMove(clientId: string, userId: string) {
  const list = (await clientUpcoming(clientId)).filter((b) => b.status === "confirmed");
  if (!list.length) { await say(clientId, "ไม่พบคิวที่เลื่อนได้ค่ะ"); return; }
  if (list.length === 1) {
    await setSession(userId, { code: list[0].serviceCode, moveId: list[0].id });
    const svc = (await bookable()).find((s) => s.code === list[0].serviceCode);
    if (!svc) throw new BookingError("บริการนี้ปิดรับจองผ่าน LINE แล้ว ทีมงานจะติดต่อกลับค่ะ");
    return offerDays(clientId, svc, localDate(new Date()), list[0].id);
  }
  await say(clientId, "ต้องการเลื่อนคิวไหนคะ", list.map((b) => ({ label: `${thaiDay(b.day, true)} ${hhmm(b.start)}`, data: `bk:mv:${b.id}`, display: `เลื่อนคิว ${b.code}` })));
}
