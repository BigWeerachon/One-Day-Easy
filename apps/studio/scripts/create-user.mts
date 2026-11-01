// สร้าง/รีเซ็ตบัญชีทีมจาก command line (ใช้สร้าง Owner คนแรก)
// npm run user:create -w apps/studio -- <email> "<ชื่อ>" [owner|builder|accountant]
// รหัสผ่าน: ตัวแปร STUDIO_PASSWORD หรือพิมพ์ตอนรัน · ไม่รับจาก argument (กันหลุดใน shell history)
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../lib/password.ts";
import { validatePassword, ROLES, type Role } from "../lib/permissions.ts";

const [email, name, role = "owner"] = process.argv.slice(2);
if (!email || !name || !(ROLES as readonly string[]).includes(role)) {
  console.error('ใช้: npm run user:create -w apps/studio -- <email> "<ชื่อ>" [owner|builder|accountant]'); process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("ต้องตั้ง DATABASE_URL"); process.exit(1); }
let password = process.env.STUDIO_PASSWORD ?? "";
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = (await rl.question("รหัสผ่าน (≥10 ตัว มีตัวอักษรและตัวเลข): ")).trim();
  rl.close();
}
const err = validatePassword(password);
if (err) { console.error(err); process.exit(1); }
const local = /@(localhost|127\.0\.0\.1)|host=\/|%2F/.test(url);
const c = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(
  `insert into staff (email, name, role, password_hash) values ($1,$2,$3,$4)
   on conflict (email) do update set name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, active = true, must_change_password = false
   returning (xmax = 0) created`, [email.trim().toLowerCase(), name, role as Role, await hashPassword(password)]);
await c.query(`delete from staff_sessions where staff_id = (select id from staff where email = $1)`, [email.trim().toLowerCase()]);
console.log(r.rows[0].created ? `สร้าง ${role} ${email} แล้ว` : `อัปเดต ${email} (บทบาท ${role}, รหัสผ่านใหม่) แล้ว`);
await c.end();
