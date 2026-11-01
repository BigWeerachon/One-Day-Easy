import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, promptPayPayload } from "../../../packages/blocks/src/promptpay.ts";

test("CRC-16/CCITT-FALSE check value", () => assert.equal(crc16("123456789"), "29B1"));
test("เบอร์มือถือ + ยอด", () => {
  const p = promptPayPayload("081-234-5678", 158000);
  assert.ok(p.startsWith("000201010212"));
  assert.ok(p.includes("29370016A00000067701011101130066812345678"));
  assert.ok(p.includes("5303764") && p.includes("54071580.00") && p.includes("5802TH"));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});
test("เลข 13 หลัก ไม่มียอด = ใช้ซ้ำได้", () => {
  const p = promptPayPayload("0105556012345");
  assert.ok(p.startsWith("000201010211") && p.includes("02130105556012345") && !p.includes("5407"));
});
test("ID ผิดรูปแบบ → error", () => assert.throws(() => promptPayPayload("12345")));
import { validTaxId, validThaiPhone } from "./thai.ts";
test("เลขผู้เสียภาษี: ตรวจหลักสุดท้าย", () => {
  assert.equal(validTaxId("1101700207030"), true);  // ตัวอย่างเลขที่ผ่าน checksum
  assert.equal(validTaxId("1101700207031"), false);
  assert.equal(validTaxId("12345"), false);
});
test("เบอร์โทรไทย", () => { assert.ok(validThaiPhone("081-234-5678")); assert.ok(validThaiPhone("02 123 4567")); assert.ok(!validThaiPhone("12345")); });
