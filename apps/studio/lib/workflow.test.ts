import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./workflow.ts";
import { validateBlock, runChecks, TEMPLATES } from "../../../packages/blocks/src/blocks.ts";
import { ALL_EVENTS } from "./events.ts";
import { formatDocNo, slipMatches } from "./money.ts";

const ok = { checklistDone: true, pdpa: true, checksPassed: 6, paidInFull: true, approved: true };

test("ห้ามข้ามขั้น: ออนไลน์ก่อนชำระ", () => {
  assert.equal(canTransition("invoice", "online", "system", ok).ok, false);
  assert.equal(canTransition("payment", "online", "system", { ...ok, paidInFull: false }).ok, false);
  assert.equal(canTransition("payment", "online", "system", ok).ok, true);
});
test("ส่งลูกค้าต้องตรวจผ่าน 6/6 และต้องเป็นคน", () => {
  assert.equal(canTransition("template", "client_review", "human", { ...ok, checksPassed: 5 }).ok, false);
  assert.equal(canTransition("template", "client_review", "system", ok).ok, false);
});
test("พักงานต้องมีเหตุผล", () => {
  assert.equal(canTransition("payment", "paused", "human", ok).ok, false);
  assert.equal(canTransition("payment", "paused", "human", { ...ok, reason: "ลูกค้าขอเลื่อน" }).ok, true);
});
test("block schema", () => {
  assert.equal(validateBlock("hero", { title: "x".repeat(49) }) !== null, true);
  assert.equal(validateBlock("line", { id: "@mokahouse" }), null);
  assert.notEqual(validateBlock("promptpay", { id: "12345" }), null);
  assert.notEqual(validateBlock("hero", { hack: 1 }), null);
  const t3 = TEMPLATES.find((t) => t.id === "T3")!;
  assert.equal(runChecks(t3, {}).filter((c) => c.ok).length < 6, true);
});
test("event catalog = 45+ events", () => assert.ok(ALL_EVENTS.length >= 45));
test("เงิน: เลขที่ + สลิป", () => {
  assert.equal(formatDocNo("INV", 2026, 11, 8), "INV-2611-008");
  assert.equal(slipMatches(700000, 745000), false);
  assert.equal(slipMatches(745000, 745000), true);
});
