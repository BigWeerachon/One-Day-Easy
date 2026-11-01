import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSlip, receiverMatches, type SlipRead } from "./slip-rules.ts";

const now = new Date("2026-11-01T10:00:00+07:00");
const receiver = { names: ["บจก. วันเดย์ อีซี่"], accountDigits: ["123-4-56789-0"] };
const base: SlipRead = { is_transfer_slip: true, amount: 7450, ref: "202611010001ABC", paid_at: "2026-11-01T09:30:00+07:00", bank: "KBANK", sender_name: "นาง แอน", receiver_name: "บจก. วันเดย์ อีซี่", receiver_account: "xxx-x-x6789-x" };
const docs = [{ no: "INV-2611-008", due: 745000, issuedAt: "2026-10-29" }, { no: "RN-2611-004", due: 299000, issuedAt: "2026-11-01" }];
const ev = (r: Partial<SlipRead>, o: Partial<{ refUsed: boolean; receiver: typeof receiver }> = {}) =>
  evaluateSlip({ ...base, ...r }, docs, { receiver: o.receiver ?? receiver, refUsed: o.refUsed ?? false, now, maxAgeDays: 3 });

test("สลิปถูกต้อง → ผ่านทุกข้อ จับคู่ INV", () => { const r = ev({}); assert.equal(r.allPass, true); assert.equal(r.doc?.no, "INV-2611-008"); });
test("ยอดไม่ตรง → ไม่ผ่าน", () => assert.equal(ev({ amount: 7000 }).allPass, false));
test("สลิปซ้ำ (ref เคยใช้) → ไม่ผ่าน", () => assert.equal(ev({}, { refUsed: true }).allPass, false));
test("ไม่มี ref → ไม่ผ่าน", () => assert.equal(ev({ ref: null }).allPass, false));
test("โอนเข้าบัญชีอื่น → ไม่ผ่าน", () => assert.equal(ev({ receiver_name: "สมชาย ใจดี", receiver_account: "xxx-x-x1111-x" }).allPass, false));
test("ยังไม่ตั้งบัญชีร้าน → ไม่อนุมัติอัตโนมัติ", () => assert.equal(ev({}, { receiver: { names: [], accountDigits: [] } }).allPass, false));
test("สลิปเก่า / อนาคต / ก่อนออกใบ → ไม่ผ่าน", () => {
  assert.equal(ev({ paid_at: "2026-10-20T09:00:00+07:00" }).allPass, false);
  assert.equal(ev({ paid_at: "2026-11-02T09:00:00+07:00" }).allPass, false);
  assert.equal(ev({ paid_at: "2026-10-28T09:00:00+07:00" }).allPass, false);
});
test("ไม่ใช่สลิป → ไม่ผ่าน", () => assert.equal(ev({ is_transfer_slip: false }).allPass, false));
test("จับคู่ผู้รับจากชื่อหรือท้ายเลขบัญชี", () => {
  assert.equal(receiverMatches({ ...base, receiver_name: null }, receiver), true);
  assert.equal(receiverMatches({ ...base, receiver_account: null, receiver_name: "วันเดย์ อีซี่" }, receiver), true);
  assert.equal(receiverMatches({ ...base, receiver_account: "x-12", receiver_name: "ab" }, receiver), false);
});
