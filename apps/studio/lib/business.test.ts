import { test } from "node:test";
import assert from "node:assert/strict";
import { businessOf, AGENT_TEMPLATE, isVersionedKey } from "./business.ts";

test("เดาประเภทธุรกิจจากคำที่ลูกค้าพิมพ์", () => {
  assert.equal(businessOf("เต็นท์รถมือสอง"), "car_dealer");
  assert.equal(businessOf("รีสอร์ทริมน้ำ กาญจนบุรี"), "hotel_camp");
  assert.equal(businessOf("แคมป์ปิ้ง"), "hotel_camp");
  assert.equal(businessOf("ร้านกาแฟ"), "cafe");
  assert.equal(businessOf("ร้านอาหารตามสั่ง"), "restaurant");
  assert.equal(businessOf(null), "restaurant");
});

test("Agent ใช้ D1/H1 กับธุรกิจใหม่ · T1/T3 กับร้านอาหารและคาเฟ่", () => {
  assert.equal(AGENT_TEMPLATE[businessOf("เต็นท์รถ")], "D1");
  assert.equal(AGENT_TEMPLATE[businessOf("โฮมสเตย์")], "H1");
  assert.ok(isVersionedKey("D1") && isVersionedKey("H1") && !isVersionedKey("T3"));
});

test("ธุรกิจอื่นทั้งหมด → general + เลือกเทมเพลตทั่วไปตามคำ", async () => {
  const { businessOf, generalTemplateOf, agentTemplateFor } = await import("./business.ts");
  for (const k of ["คลินิกทันตกรรม", "ร้านซ่อมแอร์", "สตูดิโอถ่ายภาพ", "ทนายความ"]) assert.equal(businessOf(k), "general", k);
  assert.equal(businessOf("ร้านก๋วยเตี๋ยว"), "restaurant");
  assert.equal(businessOf(""), "restaurant");
  assert.equal(generalTemplateOf("สถาบันสอนภาษา"), "G3");
  assert.equal(generalTemplateOf("ขายเสื้อผ้าออนไลน์"), "G2");
  assert.equal(generalTemplateOf("บริษัทเอเจนซีการตลาด"), "G4");
  assert.equal(generalTemplateOf("คลินิกความงาม"), "G1");
  assert.equal(agentTemplateFor("ร้านซ่อมแอร์"), "G1");
  assert.equal(agentTemplateFor("เต็นท์รถมือสอง"), "D1");
});
