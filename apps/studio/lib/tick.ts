import "server-only";
import { q } from "./db";
import { runDueLineTasks, expireDocs } from "./store";
import { runDueDomainChecks } from "./domains";
import { expireHolds, sendReminders } from "./booking";
import { runDueEmails } from "./notify";
import { followUps, dailyDigest, checkLiveSites } from "./ops";

// งานตามเวลาทั้งหมดของระบบในที่เดียว
// แผน Vercel Hobby ตั้ง cron ได้วันละครั้ง จึงเรียกงานนี้จาก 3 ทาง:
//   1) GitHub Actions ทุก 5 นาที (.github/workflows/cron.yml → /api/cron/all)
//   2) ทุกครั้งที่มีคนใช้ระบบ (LINE webhook · เปิดหน้า Studio) ผ่าน tickSoon() อย่างมากนาทีละครั้ง
//   3) Vercel Cron วันละครั้งเป็นตาข่ายสุดท้าย
export async function runAllDue() {
  const safe = async <T>(name: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { console.error("tick", name, e); return `error: ${(e as Error).message}`.slice(0, 120); } };
  return {
    line: await safe("line", () => runDueLineTasks()),
    email: await safe("email", () => runDueEmails()),
    holds: await safe("holds", () => expireHolds()),
    reminders: await safe("reminders", () => sendReminders()),
    domains: await safe("domains", () => runDueDomainChecks()),
    docs: await safe("docs", () => expireDocs()),
    followUps: await safe("followUps", () => followUps()),
    sites: await safe("sites", () => checkLiveSites()),
    digest: await safe("digest", () => dailyDigest()),
  };
}

/** เรียกได้บ่อย · ทำจริงอย่างมากนาทีละครั้งทั้งระบบ (ใช้แถวเดียวในฐานข้อมูลเป็นตัวจับเวลา) */
export async function tickSoon(): Promise<boolean> {
  if (process.env.TICK_ON_REQUEST === "off") return false; // ชุดทดสอบเรียก cron เองเพื่อให้ผลแน่นอน
  const got = await q(`insert into line_booking_sessions (line_user_id, state, updated_at) values ('sys:tick', '{}', now())
    on conflict (line_user_id) do update set updated_at = now() where line_booking_sessions.updated_at < now() - interval '1 minute' returning 1`).catch(() => []);
  if (!got.length) return false;
  await runAllDue();
  return true;
}
