// ขายในแชท LINE ครบวงจร: ทัก → เมนูแพ็ก → ใบเสนอราคา → ยืนยัน + มัดจำ (QR) → รูปร้าน/ภาพ ref → กรอกข้อมูล
// → Agent ร่างเว็บ ถามข้อมูลที่ขาด ตรวจ และส่งตัวอย่างเอง → ขอแก้ → อนุมัติ → จ่ายส่วนที่เหลือ → ออนไลน์
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
  await waitFor(async () => (await val(`select agent_status from jobs where id = $1`, [job])) === "waiting_customer", { timeout: 30_000, message: "Agent ไม่ได้ร่างและถามข้อมูลที่ขาด" });
  assert.equal(await stage(), "template");
  assert.equal(await val(`select draft_status from jobs where id = $1`, [job]), "done");
  const s = (await sql(`select s.id, s.template, s.config, s.domain from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job]))[0];
  assert.equal(s.template, "T3");
  const photo = await val(`select id from client_files where client_id = $1 and kind = 'photo'`, [client]);
  assert.equal(s.config.hero.image, `file:${photo}`);
  assert.match(s.config.hero.title, /ครัวคุณยาย/);
  // Design Agent: สีหลักจากภาพ ref · ฟอนต์นอกรายการและสีที่อ่านยากถูกคัดออก (ใช้ของเทมเพลตแทน)
  assert.deepEqual(s.config.theme, { primary: "#1f6f54", accent: "#f2c14e", font: "Sarabun", radius: 20 });
  const brief = await val(`select design_brief from jobs where id = $1`, [job]);
  assert.equal(brief.usedRef, true);
  assert.equal(brief.heroPhoto, `file:${photo}`);
  assert.ok(brief.dropped.some((x) => /Comic Sans/.test(x)) && brief.dropped.some((x) => /อ่านยาก/.test(x)));
  assert.ok(s.config.menu && s.config.hours);
  assert.equal(s.config.faq, undefined, "บล็อกผิด schema ต้องถูกคัดออก");
  assert.equal(s.config.reviews, undefined, "รูปที่ไม่ใช่ของลูกค้าต้องถูกคัดออก");
  assert.match(s.domain, /\.onedayeasy\.app$/);
  // หน้าเว็บจริงใช้ธีมของนักออกแบบ
  // Claude ได้เห็นทั้งรูปร้านและภาพ ref
  const reqs = (await mockLog("claude")).filter((l) => l.body.system?.[0]?.text.includes("ร่างเว็บไซต์ฉบับแรก"));
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].body.messages[0].content.filter((c) => c.type === "image").length, 2);
});

test("Intake Agent ถามข้อมูลที่ขาด → ลูกค้าตอบในแชท → Builder เติม → QA ผ่าน → ส่งตัวอย่างให้ลูกค้าเอง", async () => {
  const ask = (await linePushes(U)).at(-1);
  assert.match(ask.text, /ขอข้อมูลเพิ่ม/);
  assert.match(ask.text, /LINE ID/);
  assert.match(ask.text, /ที่อยู่ร้าน/);
  await lineText(U, "@kruayai ที่อยู่ 12 ซอยลาดพร้าว 71 กรุงเทพ");
  const m = await waitFor(async () => (await linePushes(U)).find((x) => /พร้อมให้ตรวจแล้ว/.test(x.text)), { timeout: 30_000, message: "ไม่ได้ส่งตัวอย่างให้ลูกค้า" });
  assert.match(m.text, /\/preview\/[0-9a-f-]{36}\?exp=/);
  assert.deepEqual(quick(m).map((a) => a.data), ["od:approve", "od:edit"]);
  assert.equal(await stage(), "client_review");
  const cfg = await val(`select s.config from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job]);
  assert.equal(cfg.line.id, "@kruayai");
  assert.match(cfg.map.address, /ลาดพร้าว 71/);
  assert.ok(cfg.legal.pdpa.includes("ครัวคุณยาย"));
  assert.deepEqual((await sql(`select agent, outcome from agent_runs where job_id = $1 order by id`, [job])).map((r) => `${r.agent}:${r.outcome}`),
    ["design:designed", "builder:drafted", "qa:fail", "intake:asked", "intake:answered", "builder:fixed", "qa:pass", "dev:pass"]);
  // Dev Agent เปิดหน้าตัวอย่างจริงและโหลดรูปของร้านได้
  const dev = await val(`select detail from agent_runs where job_id = $1 and agent = 'dev'`, [job]);
  assert.ok(dev.checked.images >= 1 && dev.checked.bytes > 1000);
});

test("ขอแก้ในแชท → Builder แก้ → QA ตรวจ → ส่งตัวอย่างใหม่เอง · นับรอบ", async () => {
  const n = (await linePushes(U)).filter((x) => /พร้อมให้ตรวจแล้ว/.test(x.text)).length;
  await chat(U, () => linePostback(U, "od:edit"));
  await lineText(U, "ขอเปลี่ยนคำโปรยหน้าแรกค่ะ");
  await waitFor(async () => (await linePushes(U)).filter((x) => /พร้อมให้ตรวจแล้ว/.test(x.text)).length === n + 1, { timeout: 30_000, message: "ไม่ได้ส่งตัวอย่างใหม่หลังแก้" });
  assert.equal(await stage(), "client_review");
  assert.equal(await val(`select edit_rounds from jobs where id = $1`, [job]), 1);
  assert.equal(await val(`select s.config->'hero'->>'subtitle' from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job]), "แก้ตามคำขอแล้ว");
  assert.ok((await linePushes(U)).some((x) => /รับคำขอแก้แล้ว/.test(x.text)));
});

test("อนุมัติในแชท → ใบแจ้งหนี้ส่วนที่เหลือ (หักมัดจำ) พร้อม QR", async () => {
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
  assert.match(m.text, /เว็บของคุณออนไลน์แล้ว/);
  // ที่อยู่แบบ path บน Engine (ใช้ช่วงที่ยังไม่มีโดเมนหลัก) เปิดเว็บเดียวกันได้
  const slug = (await val(`select s.domain from jobs j join sites s on s.id = j.site_id where j.id = $1`, [job])).split(".")[0];
  const page = await fetch(`${URLS.engine}/s/${slug}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ครัวคุณยาย/);
  assert.equal((await fetch(`${URLS.engine}/s/no-such-shop`)).status, 404);
});

test("ปุ่มจองคิวยังทำงานแยกจากบอทขาย", async () => {
  const m = await chat(U, () => linePostback(U, "bk:my"));
  assert.match(m.text, /ยังไม่มีคิว|คิวของคุณ/);
});
