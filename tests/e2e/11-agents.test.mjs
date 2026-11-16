// ทีม Agent: Sales ตอบ/ส่งต่อ · QA ไม่ผ่านเกินรอบ → ส่งต่อคน (อีเมล + คิวงานวันนี้) · คนสั่งให้ทำต่อ · Ops ตามลูกค้าและสรุปรายวัน
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, USERS, resetDb, closeDb, closeBrowser, loginAs, act, chat, lineText, linePushes, mockPost, emails, sql, val, cron, waitFor, errorText } from "./lib.mjs";

const U = "Ue2eagent00000000000000000000001";
let client, job;
before(async () => {
  await resetDb();
  await chat(U, () => lineText(U, "สวัสดีค่ะ"));
  client = await val(`select client_id from contacts where value = $1`, [U]);
  job = await val(`select id from jobs where client_id = $1`, [client]);
});
after(async () => { await closeBrowser(); await closeDb(); });

test("Sales Agent ตอบคำถามที่ปุ่มตอบไม่ได้ · ข้อความถูกทำเป็นอ่านแล้ว", async () => {
  const m = await chat(U, () => lineText(U, "แก้ได้กี่รอบคะ", "sales-q1"));
  assert.match(m.text, /แก้ฟรี 2 รอบ/);
  assert.equal(await val(`select read_at is not null from messages where external_id = 'line:sales-q1'`), true);
  assert.equal(await val(`select outcome from agent_runs where client_id = $1 and agent = 'sales' order by id desc limit 1`, [client]), "replied");
});

test("ขอส่วนลด → Sales Agent ไม่ตอบ ส่งต่อให้คน (ข้อความค้างในกล่องข้อความ)", async () => {
  const n = (await linePushes(U)).length;
  await lineText(U, "ขอส่วนลดหน่อยได้ไหมคะ", "sales-q2");
  await waitFor(async () => (await val(`select count(*)::int from agent_runs where client_id = $1 and outcome = 'handoff'`, [client])) === 1);
  assert.equal((await linePushes(U)).length, n);
  assert.equal(await val(`select read_at is null from messages where external_id = 'line:sales-q2'`), true);
});

test("QA ไม่ผ่านครบ 2 รอบแก้ → ส่งต่อคน: สถานะ + อีเมลถึงทีม + ขึ้นคิวงานวันนี้ · ไม่ส่งอะไรให้ลูกค้า", async () => {
  // เตรียมงานที่ข้อมูลครบและมีเว็บร่างครบทุกบล็อกบังคับ
  await sql(`update clients set name = 'ร้านทดสอบ Agent', kind = 'ร้านอาหาร', package = 'Basic', phone = '0812345678', opening_hours = 'ทุกวัน 08:00-20:00' where id = $1`, [client]);
  await sql(`update jobs set stage = 'intake', checklist_done = true, pdpa_consent = true where id = $1`, [job]);
  await sql(`update jobs set stage = 'template' where id = $1`, [job]);
  const site = (await sql(`insert into sites (client_id, domain, template, config) values ($1, 'agent-test.onedayeasy.app', 'T3', $2) returning id`, [client, JSON.stringify({
    hero: { title: "ร้านทดสอบ Agent", subtitle: "อาหารตามสั่ง", cta: "สั่งเลย" }, menu: { items: [{ name: "กะเพรา", price: 999 }] },
    line: { id: "@agenttest" }, hours: { days: "ทุกวัน", open: "08:00", close: "20:00" }, map: { address: "กรุงเทพ" } })]))[0].id;
  await sql(`update jobs set site_id = $2, template = 'T3' where id = $1`, [job, site]);
  await mockPost("claude", "/__review", "fail");
  await mockPost("email", "/__reset");
  const n = (await linePushes(U)).length;

  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/clients/${client}`);
  await act(p, p.getByRole("button", { name: "ให้ Agent ทำต่อ" }));
  assert.equal(await errorText(p), null);
  assert.equal(await val(`select agent_status from jobs where id = $1`, [job]), "needs_human");
  assert.match(await val(`select agent_note from jobs where id = $1`, [job]), /ราคาเมนูไม่มีในข้อมูล/);
  assert.equal(await val(`select stage from jobs where id = $1`, [job]), "template");
  assert.equal((await linePushes(U)).length, n, "งานที่ QA ไม่ผ่านต้องไม่ถึงลูกค้า");
  const runs = (await sql(`select agent, outcome from agent_runs where job_id = $1 order by id`, [job])).map((r) => `${r.agent}:${r.outcome}`);
  assert.deepEqual(runs, ["qa:fail", "builder:fixed", "qa:fail", "builder:fixed", "qa:fail", "qa:escalated"]);
  const mail = await waitFor(async () => (await emails(USERS.builder.email)).find((m) => /Agent ส่งต่องานให้คน/.test(m.subject)));
  assert.match(mail.text, /ราคาเมนูไม่มีในข้อมูล/);
  // หน้าลูกค้าแสดงผลตรวจ · งานวันนี้มีรายการให้คนดู
  await p.goto(`${URLS.studio}/clients/${client}`);
  assert.match(await p.locator("body").innerText(), /ต้องให้คนดู[\s\S]*ราคาเมนูไม่มีในข้อมูล/);
  await p.goto(URLS.studio);
  assert.match(await p.locator(".qi", { hasText: "Agent ส่งต่อให้คนดู" }).innerText(), /ราคาเมนูไม่มีในข้อมูล/);
});

test("คนแก้แล้วกด \"ให้ Agent ทำต่อ\" → QA ผ่าน → ส่งตัวอย่างให้ลูกค้าเอง", async () => {
  await mockPost("claude", "/__review", "pass");
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/clients/${client}`);
  await act(p, p.getByRole("button", { name: "ให้ Agent ทำต่อ" }));
  assert.equal(await val(`select stage || ' ' || agent_status from jobs where id = $1`, [job]), "client_review sent");
  assert.match((await linePushes(U)).at(-1).text, /พร้อมให้ตรวจแล้ว/);
});

test("Ops: ลูกค้าเงียบเกิน 24 ชม. → ตามทาง LINE ครั้งเดียว", async () => {
  await sql(`update clients set last_contact_at = now() - interval '30 hours' where id = $1`, [client]);
  const n = (await linePushes(U)).length;
  const r1 = await (await cron("ops")).json();
  assert.ok(r1.followedUp >= 1);
  await cron("ops");
  const sent = (await linePushes(U)).slice(n);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /ตัวอย่างเว็บรอให้ตรวจ/);
});

test("Ops: สรุปงานรายวันถึง Owner วันละครั้ง", async () => {
  await sql(`delete from email_outbox where event = 'ops.digest'`).catch(() => {});
  const hour = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  await cron("ops"); await cron("ops");
  const n = await val(`select count(*)::int from email_outbox where event = 'ops.digest' and to_addr = $1`, [USERS.owner.email]);
  assert.equal(n, hour >= 8 ? 1 : 0, "ก่อน 08:00 เวลาไทยยังไม่ส่ง · หลังจากนั้นส่งครั้งเดียว");
  if (hour >= 8) assert.match(await val(`select text_body from email_outbox where event = 'ops.digest' limit 1`), /ต้องให้คุณทำ[\s\S]*24 ชม\. ที่ผ่านมา/);
  assert.equal(await val(`select count(*)::int from email_outbox where event = 'ops.digest' and to_addr = $1`, [USERS.builder.email]), 0);
});

test("cron ops ต้องมี secret", async () => { assert.equal((await cron("ops", false)).status, 401); });
