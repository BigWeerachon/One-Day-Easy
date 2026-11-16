import "server-only";
import { q, one } from "./db";
import * as S from "./store";
import { notify } from "./notify";
import { logRun } from "./agents";
import { STAGE_LABEL, type Stage } from "./workflow";

// Ops Agent: ตามลูกค้าที่เงียบ (ครั้งเดียวต่อช่วง) และสรุปงานรายวันให้เจ้าของ · ไม่ใช้ Claude จึงไม่มีค่าใช้จ่ายต่อครั้ง

const NUDGE: Partial<Record<Stage, string>> = {
  intake: "สวัสดีค่ะ ทีมงานยังรอข้อมูลร้านและรูปเพื่อเริ่มทำเว็บนะคะ ส่งในแชทนี้ หรือกรอกที่ลิงก์เดิมได้เลยค่ะ ถ้าลิงก์หมดอายุ พิมพ์ \"สถานะ\" ได้ค่ะ",
  client_review: "สวัสดีค่ะ ตัวอย่างเว็บรอให้ตรวจอยู่นะคะ ถ้าเรียบร้อยกด \"อนุมัติ\" หรือกด \"ขอแก้\" ในข้อความก่อนหน้าได้เลยค่ะ",
  payment: "สวัสดีค่ะ เว็บพร้อมขึ้นออนไลน์แล้ว รอเพียงยอดชำระส่วนที่เหลือค่ะ ส่งสลิปในแชทนี้ได้เลย",
};
/** ลูกค้าเงียบเกิน 24 ชม. ในขั้นที่รอลูกค้า → เตือนทาง LINE หนึ่งครั้ง */
export async function followUps(limit = 20) {
  const due = await q<{ id: string; client_id: string; stage: Stage; waiting: boolean }>(`
    select j.id, j.client_id, j.stage, j.agent_status = 'waiting_customer' waiting from jobs j join clients c on c.id = j.client_id
    where j.followed_up_at is null and c.last_contact_at < now() - interval '24 hours'
      and (j.stage in ('client_review','payment') or (j.stage = 'intake' and c.package is not null) or j.agent_status = 'waiting_customer')
      and exists (select 1 from contacts ct where ct.client_id = c.id and ct.channel = 'LINE' and ct.value like 'U%')
    order by c.last_contact_at limit $1`, [limit]);
  for (const j of due) {
    const text = j.waiting ? `สวัสดีค่ะ ทีมงานยังรอข้อมูลเพิ่มเพื่อทำเว็บให้เสร็จนะคะ: ${(await one<{ n: string | null }>(`select agent_note n from jobs where id = $1`, [j.id]))?.n ?? ""}` : NUDGE[j.stage];
    if (!text) continue;
    await q(`update jobs set followed_up_at = now() where id = $1`, [j.id]);
    await S.sendSystemMessage(j.client_id, text).catch(() => {});
    await logRun("ops", "followed_up", { jobId: j.id, clientId: j.client_id, detail: { stage: j.stage } });
  }
  return due.length;
}

const bkkDate = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
export async function buildDigest() {
  const stages = await q<{ stage: Stage; n: number }>(`select stage, count(*)::int n from jobs where stage not in ('online','care') group by stage`);
  const one1 = async (sql: string) => Number((await one<{ v: string | null }>(sql))?.v ?? 0);
  const [human, slips, deadTasks, deadMail, newLeads, sent, online, revenue, tokens, handoffs] = await Promise.all([
    one1(`select count(*) v from jobs where agent_status = 'needs_human' and stage = 'template'`),
    one1(`select count(*) v from slips where status = 'pending'`),
    one1(`select count(*) v from tasks where status = 'dead'`),
    one1(`select count(*) v from email_outbox where status = 'dead'`),
    one1(`select count(*) v from clients where created_at > now() - interval '24 hours'`),
    one1(`select count(*) v from agent_runs where agent = 'qa' and outcome = 'pass' and created_at > now() - interval '24 hours'`),
    one1(`select count(*) v from events where name = 'site.published' and created_at > now() - interval '24 hours'`),
    one1(`select coalesce(sum(amount_satang),0) v from payments where created_at > now() - interval '24 hours'`),
    one1(`select coalesce(sum(input_tokens + output_tokens),0) v from agent_runs where created_at > now() - interval '24 hours'`),
    one1(`select count(*) v from agent_runs where agent = 'sales' and outcome = 'handoff' and created_at > now() - interval '24 hours'`),
  ]);
  const todo = [
    human ? `งานที่ Agent ส่งต่อให้คน: ${human}` : null, slips ? `สลิปรอยืนยัน: ${slips}` : null,
    deadTasks ? `ข้อความ LINE ส่งไม่สำเร็จ: ${deadTasks}` : null, deadMail ? `อีเมลส่งไม่สำเร็จ: ${deadMail}` : null,
    handoffs ? `คำถามลูกค้าที่ Sales Agent ส่งต่อ (24 ชม.): ${handoffs} · ดูในกล่องข้อความ` : null,
  ].filter(Boolean) as string[];
  return [
    `ต้องให้คุณทำ: ${todo.length ? "" : "ไม่มี"}`, ...todo.map((t) => `• ${t}`),
    `24 ชม. ที่ผ่านมา: ลูกค้าใหม่ ${newLeads} · ส่งเว็บให้ลูกค้าตรวจ ${sent} · เว็บขึ้นออนไลน์ ${online} · รับเงิน ${(revenue / 100).toLocaleString("th-TH")} บาท`,
    `งานค้างตามขั้น: ${stages.map((s) => `${STAGE_LABEL[s.stage]} ${s.n}`).join(" · ") || "ไม่มี"}`,
    `Agent ใช้ ${tokens.toLocaleString("th-TH")} token`,
  ];
}
/** ส่งสรุปวันละครั้ง (หลัง 08:00 เวลาไทย) · เรียกซ้ำในวันเดียวกันไม่ส่งซ้ำ */
export async function dailyDigest(now = new Date()) {
  if (new Date(now.getTime() + 7 * 3600e3).getUTCHours() < 8) return false;
  const date = bkkDate(now);
  if (await one(`select 1 from email_outbox where event = 'ops.digest' and idempotency_key like $1 limit 1`, [`ops.digest:${date}:%`])) return false;
  await notify({ type: "ops.digest", date, lines: await buildDigest() });
  return true;
}

/** Dev Agent: เปิดเว็บที่ออนไลน์แล้วผ่าน Site Engine ทีละชุด · เปิดไม่ได้ 2 ครั้งติดกัน = ตั้งสถานะ "ล่ม" และแจ้ง Owner · กลับมาเปิดได้ = คืนสถานะเอง */
export async function checkLiveSites(limit = 10) {
  const engine = (process.env.ENGINE_URL ?? "").replace(/\/$/, "");
  if (!engine) return 0;
  const sites = await q<{ id: string; domain: string; status: string; check_error: string | null; client_id: string }>(
    `select id, domain, status, check_error, client_id from sites where status in ('live','down') and (checked_at is null or checked_at < now() - interval '6 hours') order by checked_at nulls first limit $1`, [limit]);
  for (const s of sites) {
    let err: string | null = null;
    try {
      const r = await fetch(`${engine}/s/${s.domain.split(".")[0]}`, { signal: AbortSignal.timeout(20_000) });
      // เว็บสถานะ "ล่ม" ยังถูก Engine แสดงอยู่ จึงใช้ตรวจการกลับมาได้
      if (r.status !== 200) err = `Site Engine ตอบ ${r.status}`;
    } catch (e) { err = `เปิดไม่ได้: ${(e as Error).message}`; }
    const second = err && s.check_error; // ล้มเหลวครั้งที่สองติดกัน
    await q(`update sites set checked_at = now(), check_error = $2, status = case when $3 then 'down' when $2::text is null then 'live' else status end where id = $1`, [s.id, err, !!second]);
    if (second && s.status === "live") {
      await logRun("dev", "site_down", { clientId: s.client_id, detail: { domain: s.domain, problems: [err] } });
      await notify({ type: "site.down", siteId: s.id, domain: s.domain, error: err! });
    } else if (!err && s.status === "down") await logRun("dev", "site_recovered", { clientId: s.client_id, detail: { domain: s.domain } });
  }
  return sites.length;
}
