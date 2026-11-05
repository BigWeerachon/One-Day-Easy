import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsForDay, localDate, localTime, atLocal, nearestSlots, canMove, canSelfCancel, openWindows, type Hours, type Service } from "./booking-rules.ts";
import { parseThaiDate, parseThaiTime, detectIntent } from "./thai-date.ts";

// 2026-11-01 = วันอาทิตย์
const today = "2026-11-01";
const hours: Hours[] = [1, 2, 3, 4, 5, 6].map((wd) => ({ resourceId: null, weekday: wd, open: "09:00", close: "12:00" }));
const svc: Service = { code: "CONSULT", durationMin: 60, bufferMin: 0, maxPerDay: null, resourceIds: ["A"] };
const rules = { stepMin: 30, minNoticeMin: 120, maxDaysAhead: 30 };
const base = { service: svc, hours, closures: [], busy: [], bookedToday: 0, rules, now: new Date("2026-11-01T10:00:00+07:00") };
const times = (s: { start: Date }[]) => s.map((x) => localTime(x.start));

test("เวลาไทย UTC+7", () => {
  assert.equal(localDate(new Date("2026-11-01T18:00:00Z")), "2026-11-02");
  assert.equal(atLocal("2026-11-02", 9 * 60).toISOString(), "2026-11-02T02:00:00.000Z");
});

test("ช่วงว่างตามเวลาทำการและ step", () => {
  assert.deepEqual(times(slotsForDay({ ...base, date: "2026-11-02" })), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
  assert.deepEqual(slotsForDay({ ...base, date: "2026-11-01" }), [], "วันอาทิตย์ปิด");
});

test("ไม่ซ้อนกับคิวที่มีอยู่ · นับ buffer", () => {
  const busy = [{ resourceId: "A", start: atLocal("2026-11-02", 600), end: atLocal("2026-11-02", 660) }];
  assert.deepEqual(times(slotsForDay({ ...base, date: "2026-11-02", busy })), ["09:00", "11:00"]);
  const withBuffer = { ...svc, bufferMin: 30 };
  assert.deepEqual(times(slotsForDay({ ...base, service: withBuffer, date: "2026-11-02", busy })), ["11:00"]);
});

test("หลาย resource · วันหยุด · จำกัดต่อวัน · จองล่วงหน้าขั้นต่ำ", () => {
  const two = { ...svc, resourceIds: ["A", "B"] };
  const busy = [{ resourceId: "A", start: atLocal("2026-11-02", 540), end: atLocal("2026-11-02", 720) }];
  const s = slotsForDay({ ...base, service: two, date: "2026-11-02", busy });
  assert.equal(s.length, 5); assert.ok(s.every((x) => x.resourceId === "B"));
  assert.deepEqual(slotsForDay({ ...base, date: "2026-11-02", closures: [{ resourceId: null, from: "2026-11-02", to: "2026-11-03" }] }), []);
  assert.deepEqual(openWindows("A", "2026-11-04", hours, [{ resourceId: "B", from: "2026-11-04", to: "2026-11-04" }]), [[540, 720]]);
  assert.deepEqual(slotsForDay({ ...base, service: { ...svc, maxPerDay: 2 }, bookedToday: 2, date: "2026-11-02" }), []);
  const near = { ...base, now: new Date("2026-11-02T08:30:00+07:00") };
  assert.deepEqual(times(slotsForDay({ ...near, date: "2026-11-02" })), ["10:30", "11:00"]);
  assert.deepEqual(slotsForDay({ ...base, date: "2026-12-05" }), [], "เกิน maxDaysAhead");
});

test("เสนอเวลาใกล้ที่ขอ", () => {
  const s = slotsForDay({ ...base, date: "2026-11-02" });
  assert.deepEqual(times(nearestSlots(s, 10 * 60 + 15, 2)), ["10:00", "10:30"]);
});

test("ลำดับสถานะคิว · ยกเลิกเอง", () => {
  assert.ok(canMove("confirmed", "checked_in")); assert.ok(!canMove("done", "confirmed")); assert.ok(!canMove("held", "in_service"));
  const start = new Date("2026-11-02T10:00:00+07:00");
  assert.ok(canSelfCancel("confirmed", start, new Date("2026-11-02T06:00:00+07:00"), 180));
  assert.ok(!canSelfCancel("confirmed", start, new Date("2026-11-02T08:00:00+07:00"), 180));
  assert.ok(!canSelfCancel("checked_in", start, new Date("2026-11-01T08:00:00+07:00"), 180));
});

test("แปลงวันภาษาไทย", () => {
  assert.equal(parseThaiDate("พรุ่งนี้ว่างไหม", today), "2026-11-02");
  assert.equal(parseThaiDate("มะรืนนี้", today), "2026-11-03");
  assert.equal(parseThaiDate("วันศุกร์นี้", today), "2026-11-06");
  assert.equal(parseThaiDate("ศุกร์หน้า", today), "2026-11-13");
  assert.equal(parseThaiDate("สัปดาห์หน้าวันจันทร์", today), "2026-11-09");
  assert.equal(parseThaiDate("15 พ.ย.", today), "2026-11-15");
  assert.equal(parseThaiDate("วันที่ 3 ธันวาคม 2569", today), "2026-12-03");
  assert.equal(parseThaiDate("๒๐/๑๑", today), "2026-11-20");
  assert.equal(parseThaiDate("5/1/70", today), "2027-01-05");
  assert.equal(parseThaiDate("10 ต.ค.", today), "2027-10-10", "ผ่านไปแล้ว = ปีหน้า");
  assert.equal(parseThaiDate("วันที่ 31", "2026-11-05"), "2026-12-31");
  assert.equal(parseThaiDate("31/2", today), null);
  assert.equal(parseThaiDate("สวัสดีครับ", today), null);
});

test("แปลงเวลาภาษาไทย", () => {
  assert.equal(parseThaiTime("10 โมง"), 600);
  assert.equal(parseThaiTime("บ่ายสอง"), 13 * 60); // ไม่รองรับเลขเป็นคำ → ถือว่าช่วงบ่าย
  assert.equal(parseThaiTime("บ่าย 2"), 14 * 60);
  assert.equal(parseThaiTime("บ่าย 3 โมงครึ่ง"), 15 * 60 + 30);
  assert.equal(parseThaiTime("14:30"), 14 * 60 + 30);
  assert.equal(parseThaiTime("10.30 น."), 630);
  assert.equal(parseThaiTime("2 ทุ่ม"), 20 * 60);
  assert.equal(parseThaiTime("4 โมงเย็น"), 16 * 60);
  assert.equal(parseThaiTime("เที่ยง"), 12 * 60);
  assert.equal(parseThaiTime("15/11"), null);
});

test("เจตนาในแชท", () => {
  assert.equal(detectIntent("ขอจองคิวพรุ่งนี้ 10 โมงค่ะ"), "book");
  assert.equal(detectIntent("วันศุกร์ว่างไหมคะ"), "availability");
  assert.equal(detectIntent("เช็คคิวของฉัน"), "my");
  assert.equal(detectIntent("ขอยกเลิกคิวครับ"), "cancel");
  assert.equal(detectIntent("ขอเลื่อนนัดได้ไหม"), "reschedule");
  assert.equal(detectIntent("ขอเปลี่ยนรูปหน้าแรก"), null);
  assert.equal(detectIntent("โอนแล้วนะคะ"), null);
});
