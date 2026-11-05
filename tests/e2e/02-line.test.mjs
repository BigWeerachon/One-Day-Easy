// รับ-ส่ง LINE: ลายเซ็น · กันข้อความซ้ำ · ตอบจากกล่องข้อความ · retry + dead-letter
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, loginAs, act, webhook, lineText, linePushes, mockPost, sql, val, cron, sign } from "./lib.mjs";

const U = "Ue2eline0000000000000000000000001";
before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });

test("ลายเซ็นผิด → 401 · ปุ่ม Verify (events ว่าง) → 200", async () => {
  assert.equal((await webhook([], { signature: "bad" })).status, 401);
  assert.equal((await webhook([])).status, 200);
  assert.equal((await webhook([], { signature: sign("x", "other") })).status, 401);
});

test("ข้อความแรกสร้างลูกค้า + งาน · ส่งซ้ำ (redelivery) ไม่บันทึกซ้ำ", async () => {
  const r1 = await lineText(U, "สวัสดีครับ อยากทำเว็บร้านกาแฟ", "dup-1");
  assert.deepEqual(r1.json, { ok: true, saved: 1 });
  const r2 = await lineText(U, "สวัสดีครับ อยากทำเว็บร้านกาแฟ", "dup-1");
  assert.deepEqual(r2.json, { ok: true, saved: 0 });
  const row = (await sql(`select c.name, j.stage from contacts ct join clients c on c.id = ct.client_id join jobs j on j.client_id = c.id where ct.value = $1`, [U]))[0];
  assert.equal(row.name, "คุณทดสอบ LINE"); // ชื่อจาก LINE profile (mock)
  assert.equal(row.stage, "new_chat");
  assert.equal(await val(`select count(*)::int from messages where external_id = 'line:dup-1'`), 1);
});

test("ตอบจากกล่องข้อความ → push ถึง LINE พร้อม retry key", async () => {
  const cid = await val(`select client_id from contacts where value = $1`, [U]);
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/inbox?c=${cid}`);
  await p.fill("input[name=text]", "ยินดีครับ ส่งเมนูมาได้เลย");
  await act(p, p.getByRole("button", { name: /ส่ง/ }));
  const last = (await linePushes(U)).at(-1);
  assert.equal(last.text, "ยินดีครับ ส่งเมนูมาได้เลย");
  assert.match(last.retryKey, /^[0-9a-f-]{36}$/);
  assert.equal(await val(`select delivery from messages where body = 'ยินดีครับ ส่งเมนูมาได้เลย'`), "sent");
});

test("LINE ล่มชั่วคราว → failed → cron ลองใหม่ด้วย retry key เดิม → ครบ 3 ครั้ง dead → กดลองใหม่สำเร็จ", async () => {
  const cid = await val(`select client_id from contacts where value = $1`, [U]);
  await mockPost("line", "/__mode", "500");
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/inbox?c=${cid}`);
  await p.fill("input[name=text]", "ข้อความทดสอบล้มเหลว");
  await act(p, p.getByRole("button", { name: /ส่ง/ }));
  const tid = await val(`select id from tasks where payload is not null order by id desc limit 1`);
  assert.equal(await val(`select status from tasks where id = $1`, [tid]), "failed");
  for (let i = 0; i < 2; i++) { await sql(`update tasks set run_after = now() where id = $1`, [tid]); await cron("line"); }
  assert.equal(await val(`select status || ' ' || attempts from tasks where id = $1`, [tid]), "dead 3");
  await mockPost("line", "/__mode", "ok");
  await p.goto(`${URLS.studio}/workflow`);
  await act(p, p.locator("tr", { hasText: "line.push" }).filter({ hasText: "dead" }).getByRole("button", { name: "ลองใหม่" }).first());
  assert.equal(await val(`select status from tasks where id = $1`, [tid]), "done");
  const keys = new Set((await linePushes(U)).filter((m) => m.text === "ข้อความทดสอบล้มเหลว").map((m) => m.retryKey));
  assert.equal(keys.size, 1, "ทุกครั้งต้องใช้ X-Line-Retry-Key เดิม");
});

test("LINE ตอบ 400 → dead ทันที (ไม่ลองซ้ำ)", async () => {
  const cid = await val(`select client_id from contacts where value = $1`, [U]);
  await mockPost("line", "/__mode", "400");
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/inbox?c=${cid}`);
  await p.fill("input[name=text]", "ส่งผิด");
  await act(p, p.getByRole("button", { name: /ส่ง/ }));
  await mockPost("line", "/__mode", "ok");
  assert.equal(await val(`select status || ' ' || attempts from tasks order by id desc limit 1`), "dead 1");
});
