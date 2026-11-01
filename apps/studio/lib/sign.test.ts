import { test } from "node:test";
import assert from "node:assert/strict";
import { signPreview, verifyPreview, previewQuery } from "../../../packages/blocks/src/sign.ts";
import { THEMES, themeFor } from "../../../packages/blocks/src/themes.ts";
import { TEMPLATES } from "../../../packages/blocks/src/blocks.ts";

const S = "secret-x", now = Date.parse("2026-11-01T00:00:00Z");
test("ลิงก์ preview: ถูกต้องผ่าน", () => { const q = new URLSearchParams(previewQuery("site1", S, 3600, now)); assert.ok(verifyPreview("site1", q.get("exp"), q.get("sig"), S, now)); });
test("ลิงก์ preview: เว็บอื่น / หมดอายุ / ลายเซ็นผิด / ไม่มี secret → ไม่ผ่าน", () => {
  const q = new URLSearchParams(previewQuery("site1", S, 3600, now));
  assert.ok(!verifyPreview("site2", q.get("exp"), q.get("sig"), S, now));
  assert.ok(!verifyPreview("site1", q.get("exp"), q.get("sig"), S, now + 3601_000));
  assert.ok(!verifyPreview("site1", q.get("exp"), signPreview("site1", 1, S), S, now));
  assert.ok(!verifyPreview("site1", q.get("exp"), q.get("sig"), undefined, now));
  assert.ok(!verifyPreview("site1", "abc", q.get("sig"), S, now));
});
test("ทุกเทมเพลตมีธีม · สีหลักแทนได้เฉพาะ hex ที่ถูกต้อง", () => {
  for (const t of TEMPLATES) assert.ok(THEMES[t.id], t.id);
  assert.equal(themeFor("T3", { theme: { primary: "#00aa55" } }).primary, "#00aa55");
  assert.equal(themeFor("T3", { theme: { primary: "red;}body{x" } }).primary, THEMES.T3.primary);
});
