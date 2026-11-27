import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { envChecks, webhookCheck, LATEST_MIGRATION, worst } from "./syscheck-rules.ts";

const good = { DATABASE_URL: "postgres://u:p@aws-0.pooler.supabase.com:6543/postgres", STUDIO_URL: "https://studio.x.com", ENGINE_URL: "https://x.com", PREVIEW_SECRET: "a".repeat(32), CRON_SECRET: "b".repeat(40), LINE_CHANNEL_SECRET: "s", LINE_CHANNEL_ACCESS_TOKEN: "t", PLATFORM_DOMAIN: "onedayeasy.app", PROMPTPAY_ID: "0812345678" };

test("migration constant matches last file", () => {
  const files = readdirSync(new URL("../../../supabase/migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  assert.equal(files.at(-1), LATEST_MIGRATION);
});
test("complete required env has no fail", () => assert.notEqual(worst(envChecks(good, true)), "fail"));
test("missing / weak / test-only values fail", () => {
  const fails = envChecks({ ...good, CRON_SECRET: "short", ENGINE_URL: "http://localhost:3001", PLATFORM_DOMAIN: "https://a.app/", INSECURE_COOKIES: "1", PROMPTPAY_ID: undefined }, true).filter((c) => c.level === "fail").map((c) => c.name);
  for (const k of ["CRON_SECRET", "ENGINE_URL", "PLATFORM_DOMAIN", "INSECURE_COOKIES", "PROMPTPAY_ID"]) assert.ok(fails.includes(k), k);
});
test("test-only vars allowed outside production", () => assert.ok(!envChecks({ ...good, INSECURE_COOKIES: "1" }, false).some((c) => c.name === "INSECURE_COOKIES")));
test("direct supabase connection warns", () => assert.ok(envChecks({ ...good, DATABASE_URL: "postgres://u:p@db.abc.supabase.co:5432/postgres" }, true).some((c) => c.name === "DATABASE_URL" && c.level === "warn")));
test("webhook", () => {
  assert.equal(webhookCheck("https://studio.x.com/api/line/webhook", true, "https://studio.x.com/").level, "ok");
  assert.equal(webhookCheck("https://old.vercel.app/api/line/webhook", true, "https://studio.x.com").level, "fail");
  assert.equal(webhookCheck(undefined, undefined, "https://studio.x.com").level, "fail");
  assert.equal(webhookCheck("https://studio.x.com/api/line/webhook", false, "https://studio.x.com").level, "fail");
});
