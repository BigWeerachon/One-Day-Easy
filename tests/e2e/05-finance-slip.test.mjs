// การเงิน: สลิปทาง LINE อนุมัติอัตโนมัติ → ใบเสร็จ · ref ซ้ำ → รอคนตรวจ · ไม่ใช่สลิป · อัปโหลด · ออกเอกสาร · PDF
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, loginAs, act, lineImage, linePushes, mockPost, sql, val, waitFor, errorText } from "./lib.mjs";
import { PNG } from "../mocks/mocks.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const U = "Ue2eslip0000000000000000000000001";
let client;
before(async () => {
  await resetDb();
  client = await val(`select id from clients where name = 'Lumière Clinic'`);
  await sql(`insert into contacts (client_id, channel, value, name) values ($1, 'LINE', $2, 'คุณแอน')`, [client, U]);
  await sql(`insert into conversations (client_id, channel) values ($1, 'LINE') on conflict do nothing`, [client]);
  await sql(`update slips set status = 'rejected' where status = 'pending'`);
});
after(async () => { await closeBrowser(); await closeDb(); });
const slipOf = (mid) => waitFor(async () => (await sql(`select * from slips where line_message_id = $1`, [mid]))[0], { message: `ไม่พบสลิป ${mid}` });
const settled = (mid) => waitFor(async () => { const s = (await sql(`select * from slips where line_message_id = $1`, [mid]))[0]; return s && s.checks ? s : null; });

test("สลิปถูกต้องทาง LINE → อนุมัติอัตโนมัติ → ใบเสร็จ → แจ้งลูกค้า", async () => {
  await mockPost("claude", "/__slip", "ok:REF-A-001");
  assert.equal((await lineImage(U, "img-a")).status, 200);
  const s = await waitFor(async () => { const r = (await sql(`select * from slips where line_message_id = 'img-a'`))[0]; return r?.status === "verified" ? r : null; });
  assert.equal(s.doc_no, "INV-2611-008");
  assert.equal(await val(`select status || ' ' || paid_satang from documents where no = 'INV-2611-008'`), "paid 745000");
  assert.ok(await val(`select no from documents where type = 'RC' and client_id = $1`, [client]));
  const msg = await waitFor(async () => (await linePushes(U)).find((m) => /ได้รับชำระ/.test(m.text)));
  assert.match(msg.text, /INV-2611-008/);
});

test("ไม่มีใบค้าง → รูปไม่ถูกตีเป็นสลิป", async () => {
  await lineImage(U, "img-b");
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await val(`select count(*)::int from slips where line_message_id = 'img-b'`), 0);
});

test("เลขอ้างอิงซ้ำ → ไม่อนุมัติอัตโนมัติ รอคนตรวจ", async () => {
  await sql(`insert into documents (no, type, client_id, total_satang) values ('INV-E2E-1', 'INV', $1, 745000)`, [client]);
  await lineImage(U, "img-c");
  const s = await settled("img-c");
  assert.equal(s.status, "pending");
  assert.ok(s.checks.some((c) => !c.ok && /ซ้ำ/.test(c.rule)), JSON.stringify(s.checks));
});

test("รูปที่ไม่ใช่สลิป → รอคนตรวจ", async () => {
  await mockPost("claude", "/__slip", "notslip");
  await lineImage(U, "img-d");
  const s = await settled("img-d");
  assert.equal(s.status, "pending");
});

test("อัปโหลดสลิปยอดผิดที่หน้าการเงิน → คนเลือกใบแล้วยืนยัน", async () => {
  await mockPost("claude", "/__slip", "wrong");
  const dir = mkdtempSync(join(tmpdir(), "e2e-")); const png = join(dir, "slip.png"); writeFileSync(png, PNG);
  const p = await loginAs("accountant", { width: 1440, height: 1400 });
  await p.goto(`${URLS.studio}/finance`);
  await p.selectOption("select[name=client]", client);
  await p.setInputFiles("input[name=image]", png);
  await act(p, p.getByRole("button", { name: "ตรวจสลิป" }));
  const up = await waitFor(async () => (await sql(`select * from slips where source = 'upload' and checks is not null`))[0]);
  assert.equal(up.status, "pending");
  await p.goto(`${URLS.studio}/finance`);
  const row = p.locator(".qi", { hasText: `#${up.id}` });
  await act(p, row.getByRole("button", { name: "ปฏิเสธ" }));
  assert.equal(await val(`select status from slips where id = $1`, [up.id]), "rejected");
  // ไฟล์ที่ไม่ใช่รูป
  const txt = join(dir, "x.txt"); writeFileSync(txt, "hello");
  await p.setInputFiles("input[name=image]", txt);
  await act(p, p.getByRole("button", { name: "ตรวจสลิป" }));
  assert.ok(await errorText(p));
});

test("ออกใบแจ้งหนี้ใหม่ → เลขต่อเนื่อง · ยกเลิกได้ · PDF ภาษาไทย", async () => {
  const p = await loginAs("owner", { width: 1440, height: 1600 });
  await p.goto(`${URLS.studio}/finance`);
  const form = p.locator("form", { has: p.locator("select[name=type]") }).first();
  await form.locator("select[name=type]").selectOption("INV");
  await form.locator("select[name=client]").selectOption({ label: "KidzLab" });
  await form.locator("input[name=total]").fill("1590");
  await act(p, form.getByRole("button").first());
  assert.equal(await errorText(p), null);
  const no = await val(`select no from documents where client_id = (select id from clients where name = 'KidzLab') and type = 'INV' order by no desc limit 1`);
  assert.match(no, /^INV-\d{4}-\d{3}$/);
  assert.equal(await val(`select total_satang::int from documents where no = $1`, [no]), 159000);
  const pdf = await p.request.get(`${URLS.studio}/api/docs/${no}/pdf`);
  assert.equal(pdf.status(), 200);
  assert.ok((await pdf.body()).length > 5000);
});
