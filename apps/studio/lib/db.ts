import "server-only";
import { Pool, type PoolClient } from "pg";

// DATABASE_URL = Supabase → Project Settings → Database → Connection string (URI)
// ใช้ฝั่ง server เท่านั้น · บทบาท postgres ข้าม RLS — ห้ามส่งไป browser
const g = globalThis as unknown as { __pool?: Pool };
function pool() {
  if (g.__pool) return g.__pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้ง DATABASE_URL (ดู apps/studio/.env.example)");
  const local = /@(localhost|127\.0\.0\.1)|host=\/|%2F/.test(url);
  g.__pool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  return g.__pool;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query(sql, params)).rows as T[];
}
export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback"); throw e; }
  finally { c.release(); }
}
