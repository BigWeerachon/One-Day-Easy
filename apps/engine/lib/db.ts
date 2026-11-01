import "server-only";
import { Pool } from "pg";
// Engine อ่านอย่างเดียว · ใช้ DATABASE_URL ชุดเดียวกับ Studio (แนะนำ role ที่ select ได้อย่างเดียว)
const g = globalThis as unknown as { __enginePool?: Pool };
function pool() {
  if (g.__enginePool) return g.__enginePool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้ง DATABASE_URL");
  const local = /@(localhost|127\.0\.0\.1)|host=\/|%2F/.test(url);
  return (g.__enginePool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } }));
}
export async function one<T>(sql: string, p: unknown[] = []): Promise<T | undefined> { return (await pool().query(sql, p)).rows[0] as T | undefined; }
