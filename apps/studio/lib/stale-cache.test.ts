import { test } from "node:test";
import assert from "node:assert/strict";
import { staleCache } from "../../engine/lib/stale-cache.ts";

test("แคชเว็บร้าน: ใช้ค่าเดิมภายใน ttl · โหลดใหม่เมื่อหมดอายุ", async () => {
  let t = 0, n = 0;
  const c = staleCache<number>({ ttl: 30, staleFor: 1000, now: () => t });
  assert.equal(await c.get("a", async () => ++n), 1);
  t = 10; assert.equal(await c.get("a", async () => ++n), 1, "ยังไม่หมดอายุ ไม่โหลดใหม่");
  t = 40; assert.equal(await c.get("a", async () => ++n), 2, "หมดอายุ โหลดใหม่");
});

test("ฐานข้อมูลล่ม: ใช้ค่าเดิมต่อได้ถึง staleFor · เกินแล้ว/ไม่เคยมีค่า → ส่งข้อผิดพลาดต่อ", async () => {
  let t = 0; const stale: string[] = [];
  const c = staleCache<string>({ ttl: 30, staleFor: 1000, now: () => t, onStale: (k) => stale.push(k) });
  const down = async (): Promise<string> => { throw new Error("db down"); };
  assert.equal(await c.get("shop", async () => "v1"), "v1");
  t = 500; assert.equal(await c.get("shop", down), "v1", "ล่ม → ใช้ของเดิม");
  assert.deepEqual(stale, ["shop"]);
  t = 600; assert.equal(await c.get("shop", async () => "v2"), "v2", "กลับมาแล้ว → ค่าใหม่");
  t = 1700; await assert.rejects(c.get("shop", down), /db down/, "เก่าเกิน staleFor → ไม่ใช้");
  await assert.rejects(c.get("never", down), /db down/, "ไม่เคยมีค่า → ล่มตามจริง");
});

test("จำกัดจำนวนรายการ: ตัดรายการที่ไม่ได้ใช้นานที่สุดออก", async () => {
  const c = staleCache<number>({ ttl: 0, staleFor: 1000, max: 2 });
  for (const k of ["a", "b", "c"]) await c.get(k, async () => 1);
  assert.equal(c.size(), 2);
});
