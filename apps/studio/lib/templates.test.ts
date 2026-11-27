import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTemplate, checksPass, visibleBlocks, sampleConfig, specTheme, PALETTES, PALETTE_PAIR, VARIANTS, type TemplateSpec } from "../../../packages/blocks/src/templates.ts";
import { contrast } from "../../../packages/blocks/src/themes.ts";

const base: TemplateSpec = {
  key: "R1", version: 1, name: "ครัวไทย", business: "restaurant", palette: "chili", fonts: "bold", radius: 16,
  blocks: [{ type: "hero", variant: "split" }, { type: "menu", variant: "cards" }, { type: "reviews", variant: "cards" }, { type: "faq", variant: "accordion" }, { type: "hours", variant: "default" }, { type: "line", variant: "default" }, { type: "map", variant: "default" }],
  required: ["hero", "menu", "hours", "line", "map"],
};

test("เทมเพลตที่ถูกต้องผ่านการตรวจทุกข้อ", () => {
  const c = checkTemplate(base);
  assert.ok(checksPass(c), JSON.stringify(c.filter((x) => !x.ok)));
});

test("ขาดบล็อกบังคับ / หน้าตาไม่มีจริง / หน้าแรกไม่อยู่บน → ไม่ผ่าน", () => {
  const fail = (s: Partial<TemplateSpec>, name: RegExp) => {
    const c = checkTemplate({ ...base, ...s });
    assert.ok(c.some((x) => !x.ok && name.test(x.name)), name.source);
  };
  fail({ blocks: base.blocks.filter((b) => b.type !== "map"), required: base.required.filter((t) => t !== "map") }, /บังคับครบ/);
  fail({ required: base.required.filter((t) => t !== "line") }, /บังคับครบ/);
  fail({ blocks: base.blocks.map((b) => (b.type === "menu" ? { ...b, variant: "carousel" } : b)) }, /หน้าตา/);
  fail({ blocks: [...base.blocks.slice(1), base.blocks[0]] }, /หน้าแรก/);
  fail({ blocks: [...base.blocks, { type: "menu", variant: "list" }] }, /ซ้ำ/);
  fail({ palette: "neon" }, /ชุดสี/);
  fail({ radius: 40 }, /โค้งมุม/);
});

test("ทุกชุดสีอ่านได้ และทุกบล็อกมีหน้าตาอย่างน้อย 1 แบบ", () => {
  for (const p of PALETTES) {
    assert.ok(contrast(p.text, p.bg) >= 4.5, p.id);
    assert.ok(contrast("#ffffff", p.primary) >= 3, p.id);
  }
  for (const v of Object.values(VARIANTS)) assert.ok(v.length >= 1);
  assert.equal(specTheme(base).primary, "#c8102e");
});

test("ลูกค้าปิดบล็อกได้ ยกเว้นบล็อกบังคับ · บล็อกที่ไม่มีข้อมูลไม่แสดง", () => {
  const cfg = { ...sampleConfig("restaurant", "sample"), hidden: ["reviews", "menu", "hero"] };
  const v = visibleBlocks(base, cfg).map((b) => b.type);
  assert.ok(!v.includes("reviews"));
  assert.ok(v.includes("menu") && v.includes("hero"));
  const empty = visibleBlocks(base, sampleConfig("restaurant", "empty")).map((b) => b.type);
  assert.ok(!empty.includes("faq") && !empty.includes("reviews"));
});

test("ทุกชุดสีมีคู่สว่าง/มืด · ตัวหนังสืออ่านได้ทั้งบนพื้นและการ์ด · ตัวบนสีเน้นอ่านได้", () => {
  for (const p of PALETTES) {
    const pair = PALETTES.find((x) => x.id === PALETTE_PAIR(p.id));
    assert.ok(pair, `${p.id} ไม่มีคู่ ${PALETTE_PAIR(p.id)}`);
    assert.equal(!!pair!.dark, !p.dark, `${p.id} คู่ต้องต่างโหมด`);
    assert.ok(contrast(p.text, p.surface) >= 4.5, `${p.id} text/surface`);
    assert.ok(contrast(p.dark ? p.bg : p.text, p.accent) >= 4.5, `${p.id} ตัวบนสีเน้น`);
  }
});

test("เทมเพลตชุดสีใหม่ + Google Sans ผ่านการตรวจ", () => {
  for (const palette of ["apple", "bronze-dark", "emerald"]) assert.ok(checksPass(checkTemplate({ ...base, palette, fonts: "google-sans" })), palette);
});
