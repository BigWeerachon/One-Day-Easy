import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature } from "./line-signature.ts";

const secret = "test-secret", body = '{"destination":"U1","events":[]}';
const sig = createHmac("sha256", secret).update(body).digest("base64");
test("LINE signature: ถูกต้องผ่าน", () => assert.equal(verifySignature(body, sig, secret), true));
test("LINE signature: body ถูกแก้ / secret ผิด / ไม่มี header → ไม่ผ่าน", () => {
  assert.equal(verifySignature(body + " ", sig, secret), false);
  assert.equal(verifySignature(body, sig, "other"), false);
  assert.equal(verifySignature(body, null, secret), false);
  assert.equal(verifySignature(body, "short", secret), false);
  assert.equal(verifySignature(body, sig, undefined), false);
});
