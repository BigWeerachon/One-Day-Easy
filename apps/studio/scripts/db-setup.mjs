// สร้างตารางใน Supabase/Postgres ตาม supabase/migrations + (ถ้าใส่ --seed) ข้อมูลตัวอย่าง
// ใช้: DATABASE_URL=... node scripts/db-setup.mjs [--seed] [--reset]
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase");
const url = process.env.DATABASE_URL;
if (!url) { console.error("ต้องตั้ง DATABASE_URL"); process.exit(1); }
const local = /@(localhost|127\.0\.0\.1)|host=\/|%2F/.test(url);
const c = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
await c.connect();
const args = process.argv.slice(2);
if (args.includes("--reset")) {
  console.log("⚠ ลบ schema public ทั้งหมด");
  await c.query("drop schema public cascade; create schema public; grant all on schema public to public;");
}
await c.query("create table if not exists _migrations (name text primary key, applied_at timestamptz default now())");
await c.query("do $$ begin if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$");
const done = new Set((await c.query("select name from _migrations")).rows.map((r) => r.name));
for (const f of readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) { console.log("skip", f); continue; }
  await c.query("begin");
  try { await c.query(readFileSync(join(root, "migrations", f), "utf8")); await c.query("insert into _migrations (name) values ($1)", [f]); await c.query("commit"); console.log("applied", f); }
  catch (e) { await c.query("rollback"); console.error("FAILED", f, e.message); process.exit(1); }
}
if (args.includes("--seed")) {
  const n = (await c.query("select count(*)::int n from clients")).rows[0].n;
  if (n > 0) console.log("มีข้อมูลอยู่แล้ว ข้าม seed");
  else { await c.query(readFileSync(join(root, "seed.sql"), "utf8")); console.log("seeded"); }
}
await c.end();
