// ขายในแชท LINE ครบวงจร: ทัก → เมนูแพ็ก → ใบเสนอราคา → ยืนยัน + มัดจำ (QR) → รูปร้าน/ภาพ ref → กรอกข้อมูล
// → Claude ร่างเว็บอัตโนมัติ → ทีมส่งตรวจ → ขอแก้ → อนุมัติ → จ่ายส่วนที่เหลือ → ออนไลน์
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { URLS, resetDb, closeDb, closeBrowser, getBrowser, loginAs, act, chat, lineText, lineImage, linePostback, linePushes, quick, mockPost, mockLog, sql, val, waitFor, errorText } from "./lib.mjs";

const U = "Ue2eorder00000000000000000000001";
let client, job;
before(resetDb);
after(async () => { await closeBrowser(); await closeDb(); });
const data = (m, prefix) => quick(m).find((a) => a.data.startsWith(prefix))?.data;
const stage = () => val(`select stage from jobs where id = $1`, [job]);

test("ลูกค้าใหม่ทัก → ได้เมนูแพ็กเกจพร้อมปุ่ม", async () => {
  const m = await chat(U, () => lineText(U, "สวัสดีค่ะ อยากทำเว็บร้านอาหาร"));
  assert.match(m.text, /แพ็กเกจทำเว็บ/);
  assert.deepEqual(quick(m).map((a) => a.data), ["od:pkg:PKG-START", "od:pkg:PKG-BASIC", "od:pkg:PKG-PRO", "od:pkg:PKG-BIZ"]);
  client = await val(`select client_id from contacts where value = $1`, [U]);
  job = await val(`select id from jobs where client_id = $1`, [client]);
});

test("เลือกแพ็ก → ใบเสนอราคาในแชท (ออกเอกสารจริง ไม่ซ้ำเมื่อกดซ้ำ)", async () => {
  const m = await chat(U, () => linePostback(U, "od:pkg:PKG-BASIC"));
  assert.match(m.text, /ใบเสนอราคา QT-\d{4}-\d{3}/);
  assert.match(m.text, /ราคา 2,990 บาท/);
  assert.match(m.text, /มัดจำ 50% = 1,495 บาท/);
  await chat(U, () => linePostback(U, "od:pkg:PKG-BASIC"));
  assert.equal(await val(`select count(*)::int from documents where client_id = $1 and type = 'QT'`, [client]), 1);
  assert.ok(data(m, "od:ok:PKG-BASIC"));
});

let portalUrl;
test("ยืนยันสั่งทำ → ใบมัดจำ + QR พร้อมเพย์เป็นรูปในแชท + ลิงก์กรอกข้อมูล", async () => {
  const m = await chat(U, () => linePostback(U, "od:ok:PKG-BASIC"));
  assert.match(m.text, /รับออเดอร์แล้ว/);
  assert.equal(await stage(), "intake");
  assert.equal(await val(`select package from clients where id = $1`, [client]), "Basic");
  const dep = await val(`select deposit_doc from jobs where id = $1`, [job]);
  assert.equal(await val(`select total_satang::int from documents where no = $1`, [dep]), 149500);
  // QR: รูป PNG จริง · ลายเซ็นผิดเปิดไม่ได้
  assert.ok(m.image?.includes(`/api/pay/${dep}/qr`));
  const png = await fetch(m.image);
  assert.equal(png.status, 200);
  assert.equal(png.headers.get("content-type"), "image/png");
  assert.equal((await fetch(m.image.replace(/sig=.*/, "sig=bad"))).status, 404);
  portalUrl = m.text.match(/http\S+\/p\/[\w-]+/)[0];
  // กดยืนยันซ้ำ → ไม่ออกใบมัดจำใบที่สอง
  const again = await chat(U, () => linePostback(U, "od:ok:PKG-BASIC"));
  assert.equal(await val(`select count(*)::int from documents where client_id = $1 and type = 'INV'`, [client]), 1);
  portalUrl = again.text.match(/http\S+\/p\/[\w-]+/)[0]; // ลิงก์ล่าสุดเท่านั้นที่ใช้ได้ (ลิงก์เก่าถูกยกเลิก)
});

test("ส่งรูปในแชท (มีใบค้าง แต่ไม่ใช่สลิป) → เก็บเป็นรูปร้าน · ลูกค้าบอกได้ว่าเป็นภาพ ref", async () => {
  await mockPost("claude", "/__slip", "notslip");
  const ask = await chat(U, () => lineImage(U, "ord-img-1"));
  assert.match(ask.text, /รูปชุดนี้คืออะไร/);
  const done = await chat(U, () => linePostback(U, "od:img:ref"));
  assert.match(done.text, /ภาพตัวอย่าง 1 รูป/);
  const ask2 = await chat(U, () => lineImage(U, "ord-img-2"));
  await chat(U, () => linePostback(U, data(ask2, "od:img:photo")));
  assert.deepEqual((await sql(`select kind from client_files where client_id = $1 order by id`, [client])).map((r) => r.kind), ["ref", "photo"]);
  assert.equal(await val(`select count(*)::int from slips where client_id = $1 and status = 'pending'`, [client]), 0, "รูปร้านต้องไม่ค้างในคิวสลิป");
});

test("ส่งสลิปมัดจำในแชท → รับชำระ · งานยังไม่ขึ้นออนไลน์", async () => {
  await mockPost("claude", "/__slip", "ok:ORD-DEP-1:1495");
  const m = await chat(U, () => lineImage(U, "ord-slip-1"));
  assert.match(m.text, /ได้รับชำระ 1,495 บาท/);
  assert.equal(await val(`select d.status from jobs j join documents d on d.no = j.deposit_doc where j.id = $1`, [job]), "paid");
  assert.equal(await stage(), "intake");
});

test("ลูกค้ากรอกข้อมูลร้าน → Claude ร่างเว็บอัตโนมัติ (เทมเพลตตามประเภทร้าน · ใช้รูปร้าน · สีจากภาพ ref · คัดบล็อกผิดออก)", async () => {
  const m = await (await (await getBrowser()).newContext()).newPage();
  await m.goto(portalUrl);
  await m.fill("input[name=name]", "ครัวคุณยาย");
  await m.fill("input[name=phone]", "0812345678");
  await m.fill("input[name=hours]", "ทุกวัน 06:00–22:00");
  await m.locator("input[name=pdpa]").check();
  await Promise.all([m.waitForResponse((r) => r.request().method() === "POST"), m.getByRole("button", { name: "ส่งข้อมูล" }).click()]);
  await waitFor(async () => (await val(`select draft_status from jobs where id = $1`, [job])) === "done", { timeout: 20_000, message: "ร่างอัตโนมัติไม่เสร็จ" });
  assert.equal(await stage(), "template");
  const s = (await sql(`select s.id, s.template, s.config, s.domain from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job]))[0];
  assert.equal(s.template, "T3");
  const photo = await val(`select id from client_files where client_id = $1 and kind = 'photo'`, [client]);
  assert.equal(s.config.hero.image, `file:${photo}`);
  assert.match(s.config.hero.title, /ครัวคุณยาย/);
  assert.equal(s.config.theme.primary, "#1f6f54");
  assert.ok(s.config.menu && s.config.hours);
  assert.equal(s.config.faq, undefined, "บล็อกผิด schema ต้องถูกคัดออก");
  assert.equal(s.config.reviews, undefined, "รูปที่ไม่ใช่ของลูกค้าต้องถูกคัดออก");
  assert.match(s.domain, /\.onedayeasy\.app$/);
  // Claude ได้เห็นทั้งรูปร้านและภาพ ref
  const reqs = (await mockLog("claude")).filter((l) => l.body.system?.[0]?.text.includes("ร่างเว็บไซต์ฉบับแรก"));
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].body.messages[0].content.filter((c) => c.type === "image").length, 2);
});

const toReview = async () => {
  const p = await loginAs("builder");
  await p.goto(`${URLS.studio}/clients/${client}`);
  await act(p, p.getByRole("button", { name: /→ ลูกค้าตรวจ/ }));
  assert.equal(await errorText(p), null);
};

test("ทีมกดส่งตรวจ → ลูกค้าได้ลิงก์ตัวอย่างพร้อมปุ่มอนุมัติ/ขอแก้ในแชท", async () => {
  // ทีมเติมส่วนที่ขาดจนผ่านตรวจ 6/6 (จำลองด้วยการแก้ข้อมูลตรง)
  await sql(`update sites set config = config || '{"line":{"id":"@kruayai"},"legal":{"pdpa":"นโยบาย"}}'::jsonb where id = (select site_id from jobs where id = $1)`, [job]);
  await sql(`update jobs set checks_passed = 6 where id = $1`, [job]);
  const before = (await linePushes(U)).length;
  await toReview();
  const m = await waitFor(async () => { const x = await linePushes(U); return x.length > before ? x.at(-1) : null; });
  assert.match(m.text, /พร้อมให้ตรวจแล้ว/);
  assert.match(m.text, /\/preview\/[0-9a-f-]{36}\?exp=/);
  assert.deepEqual(quick(m).map((a) => a.data), ["od:approve", "od:edit"]);
});

test("ขอแก้ในแชท → งานกลับไปให้ทีมแก้ · นับรอบ", async () => {
  await chat(U, () => linePostback(U, "od:edit"));
  const m = await chat(U, () => lineText(U, "ขอเปลี่ยนรูปหน้าแรกเป็นรูปหน้าร้านค่ะ"));
  assert.match(m.text, /รับคำขอแก้แล้ว/);
  assert.equal(await stage(), "template");
  assert.equal(await val(`select edit_rounds from jobs where id = $1`, [job]), 1);
  assert.match(await val(`select edit_requests->0->>'text' from jobs where id = $1`, [job]), /เปลี่ยนรูปหน้าแรก/);
});

test("อนุมัติในแชท → ใบแจ้งหนี้ส่วนที่เหลือ (หักมัดจำ) พร้อม QR", async () => {
  const before = (await linePushes(U)).length;
  await toReview();
  await waitFor(async () => (await linePushes(U)).length > before);
  const m = await chat(U, () => linePostback(U, "od:approve"));
  assert.match(m.text, /ใบแจ้งหนี้ INV-\d{4}-\d{3} ยอด 1,495 บาท/);
  assert.ok(m.image?.includes("/qr"));
  assert.equal(await stage(), "payment");
});

test("จ่ายส่วนที่เหลือในแชท → เว็บออนไลน์ · ถามสถานะได้", async () => {
  await mockPost("claude", "/__slip", "ok:ORD-FINAL-1:1495");
  const m = await chat(U, () => lineImage(U, "ord-slip-2"));
  assert.match(m.text, /ได้รับชำระ 1,495 บาท/);
  await waitFor(async () => (await stage()) === "online");
  assert.equal(await val(`select s.status from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job]), "live");
  const st = await chat(U, () => lineText(U, "เว็บถึงไหนแล้วคะ"));
  assert.match(st.text, /เว็บออนไลน์แล้ว/);
  assert.match(st.text, /onedayeasy\.app/);
});

test("ปุ่มจองคิวยังทำงานแยกจากบอทขาย", async () => {
  const m = await chat(U, () => linePostback(U, "bk:my"));
  assert.match(m.text, /ยังไม่มีคิว|คิวของคุณ/);
});
