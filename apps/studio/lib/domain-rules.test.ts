import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, isPlatformDomain, parsePrice, toE164Dot } from "./domain-rules.ts";
test("normalizeDomain", () => {
  assert.equal(normalizeDomain(" https://WWW.MokaHouse.com/menu "), "mokahouse.com");
  assert.equal(normalizeDomain("kruapadaeng.co.th"), "kruapadaeng.co.th");
  assert.equal(normalizeDomain("shop.example.in.th."), "shop.example.in.th");
  for (const bad of ["localhost", "-bad.com", "bad-.com", "a..com", "1.2.3.4", "exa mple.com", "x".repeat(64) + ".com", "ex_ample.com", "javascript:alert(1)"]) assert.equal(normalizeDomain(bad), null, bad);
});
test("platform domain", () => { assert.ok(isPlatformDomain("a.onedayeasy.app", "onedayeasy.app")); assert.ok(!isPlatformDomain("onedayeasy.app.evil.com", "onedayeasy.app")); });
test("parsePrice", () => { assert.equal(parsePrice(11.25), 11.25); assert.equal(parsePrice("20"), 20); assert.equal(parsePrice("x"), null); assert.equal(parsePrice(0), null); });
test("toE164Dot", () => { assert.equal(toE164Dot("081-234-5678"), "+66.812345678"); assert.equal(toE164Dot("+66812345678"), "+66.812345678"); assert.equal(toE164Dot("123"), null); });
