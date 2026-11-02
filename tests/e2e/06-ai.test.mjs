// Claude: สรุปข้อมูลจากแชท · ข้อเสนอแก้เว็บ (ตรวจ schema · ข้อเสนอเก่า · ปฏิเสธ · key ผิด) · รูปแบบคำขอ
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, loginAs, act, mockPost, mockLog, sql, val, errorText } from "./lib.mjs";

const S1 = "00000000-0000-0000-0000-0000000000b1";
before(resetDb);
after(async () => { await mockPost("claude", "/__mode", "ok"); await closeBrowser(); await closeDb(); });

const propose = async (p, text) => { await p.fill("textarea[name=instruction]", text); await act(p, p.getByRole("button", { name: "ขอข้อเสนอ" })); };

test("สรุปข้อมูลจากแชท → บันทึก intake + โน้ตลูกค้า", async () => {
  const c1 = await val(`select id from clients where name = 'ครัวป้าแดง'`);
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/clients/${c1}`);
  await act(p, p.getByRole("button", { name: "สรุปจากแชท" }));
  assert.equal(await errorText(p), null);
  assert.match(await p.locator("section", { hasText: "ข้อมูลจากแชท" }).innerText(), /ร้านกาแฟสมชาย/);
  assert.match(await val(`select string_agg(note, ' / ') from client_notes where client_id = $1`, [c1]), /โทนไม้อบอุ่น/);
});

test("ข้อเสนอแก้เว็บ → ใช้ → เวอร์ชันเพิ่ม 1 และเนื้อหาเปลี่ยน", async () => {
  const p = await loginAs("builder", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/builder?site=${S1}`);
  const v0 = await val(`select version from sites where id = $1`, [S1]);
  await propose(p, "เขียนหัวข้อให้อบอุ่นขึ้น และเพิ่ม FAQ 3 ข้อ");
  await act(p, p.getByRole("button", { name: "ใช้ข้อเสนอนี้" }).first());
  assert.equal(await val(`select version from sites where id = $1`, [S1]), v0 + 1);
  assert.equal(await val(`select config->'hero'->>'title' from sites where id = $1`, [S1]), "ครัวป้าแดง รสมือแม่");
  assert.equal(await val(`select jsonb_array_length(config->'faq'->'items') from sites where id = $1`, [S1]), 3);
});

test("ข้อเสนอผิด schema → ปุ่มใช้กดไม่ได้", async () => {
  await mockPost("claude", "/__mode", "invalid");
  const p = await loginAs("builder", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/builder?site=${S1}`);
  await propose(p, "หัวข้อยาวๆ");
  assert.ok(await p.getByRole("button", { name: "ใช้ข้อเสนอนี้" }).first().isDisabled());
  await mockPost("claude", "/__mode", "ok");
});

test("ข้อเสนอเก่า (เว็บถูกแก้หลังขอ) → ใช้ไม่ได้", async () => {
  const p = await loginAs("builder", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/builder?site=${S1}`);
  await propose(p, "ปรับหัวข้อ");
  await sql(`update sites set version = version + 1 where id = $1`, [S1]);
  await act(p, p.getByRole("button", { name: "ใช้ข้อเสนอนี้" }).first());
  assert.ok(await errorText(p));
});

test("Claude ปฏิเสธ / API key ผิด → แสดงข้อผิดพลาดที่อ่านได้", async () => {
  const p = await loginAs("builder", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/builder?site=${S1}`);
  await mockPost("claude", "/__mode", "refusal");
  await propose(p, "x x x");
  assert.match(await errorText(p), /ปฏิเสธ/);
  await mockPost("claude", "/__mode", "401");
  await propose(p, "x x x");
  assert.match(await errorText(p), /ANTHROPIC_API_KEY/);
  await mockPost("claude", "/__mode", "ok");
});

test("รูปแบบคำขอไป Claude: structured output · cache · ไม่มีข้อมูลลับใน system", async () => {
  const r = (await mockLog("claude")).find((l) => l.body.system?.[0]?.text.includes("แก้เนื้อหาเว็บไซต์"));
  assert.ok(r, "ต้องมีคำขอแก้เว็บ");
  assert.equal(r.key, "e2e-anthropic-key");
  assert.equal(r.body.output_config.format.type, "json_schema");
  assert.deepEqual(r.body.system[0].cache_control, { type: "ephemeral" });
});
