import { test } from "node:test";
import assert from "node:assert/strict";
import { can, validatePassword } from "./permissions.ts";
import { hashPassword, verifyPassword } from "./password.ts";

test("owner ทำได้ทุกอย่าง", () => { assert.ok(can("owner", "team.manage")); assert.ok(can("owner", "finance.edit")); });
test("builder ไม่เห็นเงิน ไม่จัดการทีม", () => {
  assert.ok(can("builder", "sites.edit")); assert.ok(!can("builder", "finance.view")); assert.ok(!can("builder", "finance.edit")); assert.ok(!can("builder", "team.manage"));
});
test("accountant ทำได้เฉพาะการเงิน", () => {
  assert.ok(can("accountant", "finance.edit")); assert.ok(!can("accountant", "sites.edit")); assert.ok(!can("accountant", "clients.view"));
});
test("ไม่มีบทบาท = ไม่มีสิทธิ์", () => assert.ok(!can(null, "work.view")));
test("กฎรหัสผ่าน", () => {
  assert.notEqual(validatePassword("short1"), null);
  assert.notEqual(validatePassword("onlyletterslong"), null);
  assert.equal(validatePassword("goodpass123"), null);
});
test("hash รหัสผ่าน: ถูกผ่าน ผิดไม่ผ่าน · salt ต่างกันทุกครั้ง", async () => {
  const h = await hashPassword("goodpass123");
  assert.ok(await verifyPassword("goodpass123", h));
  assert.ok(!(await verifyPassword("goodpass124", h)));
  assert.notEqual(h, await hashPassword("goodpass123"));
  assert.ok(!(await verifyPassword("x", "garbage")));
});
