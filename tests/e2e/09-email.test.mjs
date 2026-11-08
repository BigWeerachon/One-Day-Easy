// อีเมลแจ้งเตือน: ทีม (ตามบทบาท + ปิดรับเองได้) · ลูกค้า (มีอีเมลเท่านั้น · แนบ PDF) · ลองส่งซ้ำ · กันส่งซ้ำ
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, USERS, resetDb, closeDb, closeBrowser, loginAs, act, getBrowser, lineImage, mockPost, emails, sql, val, cron, waitFor, errorText } from "./lib.mjs";

const bkk = new Date(Date.now() + 7 * 3600e3);
const wed = new Date(bkk); wed.setUTCDate(wed.getUTCDate() + 2); while (wed.getUTCDay() !== 3) wed.setUTCDate(wed.getUTCDate() + 1);
const ISO = wed.toISOString().slice(0, 10);
const U = "Ue2email000000000000000000000001";
let kitchen, lumiere;

before(async () => {
  await resetDb();
  kitchen = await val(`select id from clients where name = 'ครัวป้าแดง'`);
  lumiere = await val(`select id from clients where name = 'Lumière Clinic'`);
});
after(async () => { await closeBrowser(); await closeDb(); });

const book = async (p, client, svc = "PHOTO") => {
  await p.goto(`${URLS.studio}/queue?day=${ISO}&svc=${svc}`);
  await p.selectOption("select[name=client]", { label: client });
  await act(p, p.getByRole("button", { name: "จองคิว", exact: true }));
  assert.equal(await errorText(p), null);
};

test("ตั้งอีเมลลูกค้าในหน้าลูกค้า · รูปแบบผิดถูกปฏิเสธ", async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/clients/${kitchen}`);
  const f = p.locator("form", { has: p.locator("input[name=email]") });
  await f.locator("input[name=email]").fill("daeng@example");
  await act(p, f.getByRole("button", { name: "บันทึก" }));
  assert.match(await errorText(p), /อีเมลไม่ถูกต้อง/);
  await f.locator("input[name=email]").fill("Daeng@Example.com");
  await act(p, f.getByRole("button", { name: "บันทึก" }));
  assert.equal(await val(`select value from contacts where client_id = $1 and channel = 'Email'`, [kitchen]), "daeng@example.com");
});

test("จองคิว → อีเมลถึง owner + builder (ไม่ถึง accountant) และยืนยันถึงลูกค้า", async () => {
  await book(await loginAs("builder"), "ครัวป้าแดง");
  const all = await waitFor(async () => { const e = await emails(); return e.length >= 3 ? e : null; });
  const to = (who) => all.filter((m) => m.to.includes(who));
  assert.match(to(USERS.owner.email)[0].subject, /^คิวใหม่: ครัวป้าแดง/);
  assert.equal(to(USERS.builder.email).length, 1);
  assert.equal(to(USERS.accountant.email).length, 0);
  const c = to("daeng@example.com")[0];
  assert.match(c.subject, /^ยืนยันการจองคิว BK-/);
  assert.match(c.text, /ถ่ายรูปร้านสำหรับเว็บ/);
  assert.match(c.html, /<h2/);
  assert.equal(c.from, "Studio <noti@e2e.test>");
  assert.ok(c.key, "ต้องส่ง Idempotency-Key");
});

test("ปิดรับอีเมลกลุ่มคิวในหน้าบัญชี → จองครั้งถัดไป builder ไม่ได้รับ", async () => {
  const b = await loginAs("builder");
  await b.goto(`${URLS.studio}/account`);
  await b.locator("input[name=booking]").uncheck();
  await act(b, b.locator("form", { has: b.locator("input[name=booking]") }).getByRole("button", { name: "บันทึก" }));
  assert.deepEqual(await val(`select email_prefs from staff where email = $1`, [USERS.builder.email]), { booking: false, portal: true });
  await mockPost("email", "/__reset");
  await book(await loginAs("owner"), "KidzLab");
  await waitFor(async () => (await emails(USERS.owner.email)).length === 1);
  assert.equal((await emails(USERS.builder.email)).length, 0);
  assert.equal((await emails()).filter((m) => /KidzLab/.test(m.subject)).length, 1, "KidzLab ไม่มีอีเมล → ลูกค้าไม่ได้รับ");
});

test("ยกเลิกคิวพร้อมเหตุผล → แจ้งทีมและลูกค้า", async () => {
  await mockPost("email", "/__reset");
  const p = await loginAs("owner");
  await p.goto(`${URLS.studio}/queue?day=${ISO}`);
  const row = p.locator("tr", { hasText: "ครัวป้าแดง" });
  await row.locator("summary", { hasText: "ยกเลิก" }).click();
  await row.locator("input[name=reason]").fill("ช่างกล้องป่วย");
  await act(p, row.getByRole("button", { name: "ยืนยันยกเลิก" }));
  const c = await waitFor(async () => (await emails("daeng@example.com"))[0]);
  assert.match(c.subject, /ถูกยกเลิก/);
  assert.match(c.text, /ช่างกล้องป่วย/);
  assert.match((await emails(USERS.owner.email))[0].subject, /^ยกเลิกคิว: ครัวป้าแดง/);
});

test("ชำระครบผ่าน LINE → ทีมการเงินได้รับ · ลูกค้าได้ใบเสร็จ PDF แนบ", async () => {
  await mockPost("email", "/__reset");
  await sql(`insert into contacts (client_id, channel, value, name) values ($1,'LINE',$2,'แอน'), ($1,'Email','ann@lumiere.test','ann@lumiere.test')`, [lumiere, U]);
  await sql(`insert into conversations (client_id, channel) values ($1,'LINE') on conflict do nothing`, [lumiere]);
  await sql(`update slips set status = 'rejected' where status = 'pending'`);
  await mockPost("claude", "/__slip", "ok:REF-EMAIL-1");
  await lineImage(U, "img-email-1");
  const c = await waitFor(async () => (await emails("ann@lumiere.test"))[0], { message: "ลูกค้าไม่ได้รับอีเมลใบเสร็จ" });
  assert.match(c.subject, /^ใบเสร็จรับเงิน RC-/);
  assert.equal(c.attachments.length, 1);
  assert.match(c.attachments[0].filename, /^RC-.*\.pdf$/);
  assert.equal(c.attachments[0].head, "%PDF");
  const acc = await waitFor(async () => (await emails(USERS.accountant.email))[0]);
  assert.match(acc.subject, /^รับชำระแล้ว 7,450 บาท · Lumière Clinic/);
  assert.equal((await emails(USERS.builder.email)).length, 0, "builder ไม่ได้ดูการเงิน");
});

test("สลิปรอตรวจ → แจ้ง owner และ accountant", async () => {
  await mockPost("email", "/__reset");
  await sql(`insert into documents (no, type, client_id, total_satang) values ('INV-EMAIL-1','INV',$1,500000)`, [lumiere]);
  await mockPost("claude", "/__slip", "wrong");
  await lineImage(U, "img-email-2");
  const m = await waitFor(async () => (await emails(USERS.accountant.email)).find((x) => /^สลิปรอตรวจ/.test(x.subject)));
  assert.match(m.text, /ข้อที่ไม่ผ่าน|สลิป #/);
  assert.ok((await emails(USERS.owner.email)).some((x) => /^สลิปรอตรวจ/.test(x.subject)));
});

test("ออกใบแจ้งหนี้ → ลูกค้าได้อีเมลแนบ PDF", async () => {
  await mockPost("email", "/__reset");
  const p = await loginAs("accountant", { width: 1440, height: 1600 });
  await p.goto(`${URLS.studio}/finance`);
  const form = p.locator("form", { has: p.locator("select[name=type]") }).first();
  await form.locator("select[name=type]").selectOption("INV");
  await form.locator("select[name=client]").selectOption({ label: "ครัวป้าแดง" });
  await form.locator("input[name=total]").fill("1590");
  await act(p, form.getByRole("button").first());
  const m = await waitFor(async () => (await emails("daeng@example.com"))[0]);
  assert.match(m.subject, /^ใบแจ้งหนี้ INV-\d{4}-\d{3} · 1,590 บาท$/);
  assert.equal(m.attachments[0].head, "%PDF");
});

test("ผู้ให้บริการอีเมลล่ม → failed → cron ส่งซ้ำด้วย key เดิม · 422 → dead → กดส่งใหม่ได้", async () => {
  await mockPost("email", "/__reset");
  await mockPost("email", "/__mode", "500");
  await book(await loginAs("owner"), "ครัวป้าแดง", "CONSULT");
  await waitFor(async () => (await val(`select count(*)::int from email_outbox where status = 'failed'`)) >= 2);
  await mockPost("email", "/__mode", "ok");
  await sql(`update email_outbox set run_after = now() where status = 'failed'`);
  assert.equal((await cron("email")).status, 200);
  assert.equal(await val(`select count(*)::int from email_outbox where status = 'failed'`), 0);
  assert.equal(await val(`select count(*)::int from email_outbox where status = 'sent' and attempts = 2`) >= 2, true);

  await mockPost("email", "/__mode", "422");
  await sql(`insert into email_outbox (event, to_addr, subject, html, text_body, idempotency_key) values ('test','x@e2e.test','ทดสอบ','<p>x</p>','x','test:1')`);
  await cron("email");
  assert.equal(await val(`select status from email_outbox where idempotency_key = 'test:1'`), "dead");
  await mockPost("email", "/__mode", "ok");
  const o = await loginAs("owner");
  await o.goto(`${URLS.studio}/settings`);
  await act(o, o.locator("tr", { hasText: "x@e2e.test" }).getByRole("button", { name: "ส่งใหม่" }));
  assert.equal(await val(`select status from email_outbox where idempotency_key = 'test:1'`), "sent");
  assert.equal(await val(`select count(*)::int from email_outbox where status = 'dead'`), 0);
});

test("event เดิมซ้ำไม่ส่งซ้ำ (idempotency)", async () => {
  const before = await val(`select count(*)::int from email_outbox`);
  await sql(`insert into email_outbox (event, to_addr, subject, html, text_body, idempotency_key) values ('test','x@e2e.test','ซ้ำ','<p>x</p>','x','test:1') on conflict (idempotency_key) do nothing`);
  assert.equal(await val(`select count(*)::int from email_outbox`), before);
});

test("Portal: ลูกค้ากรอกข้อมูลพร้อมอีเมล → บันทึกอีเมล · แจ้งทีมทำเว็บ", async () => {
  await mockPost("email", "/__reset");
  const pulse = await val(`select id from clients where name = 'PULSE Gym'`);
  const o = await loginAs("owner");
  await o.goto(`${URLS.studio}/clients/${pulse}`);
  await act(o, o.getByRole("button", { name: "ส่งลิงก์ Portal" }));
  const url = (await o.locator(".note .mono").innerText()).trim();
  const m = await (await (await getBrowser()).newContext()).newPage();
  await m.goto(url);
  await m.fill("input[name=name]", "PULSE Gym");
  await m.fill("input[name=phone]", "0812345678");
  await m.fill("input[name=email]", "Owner@Pulse.test");
  await m.fill("input[name=hours]", "ทุกวัน 06:00–22:00");
  await m.locator("input[name=pdpa]").check();
  await Promise.all([m.waitForResponse((r) => r.request().method() === "POST"), m.getByRole("button", { name: "ส่งข้อมูล" }).click()]);
  await waitFor(async () => (await val(`select value from contacts where client_id = $1 and channel = 'Email'`, [pulse])) === "owner@pulse.test");
  const t = await waitFor(async () => (await emails(USERS.owner.email)).find((x) => /ส่งข้อมูลร้านแล้ว/.test(x.subject)));
  assert.match(t.subject, /^PULSE Gym ส่งข้อมูลร้านแล้ว/);
});
