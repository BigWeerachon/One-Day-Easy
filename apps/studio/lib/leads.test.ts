import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSellCar, sellCarMessage } from "../../../packages/blocks/src/leads.ts";
import { checkTemplate, checksPass, type TemplateSpec } from "../../../packages/blocks/src/templates.ts";

const ok = { name: "สมชาย", phone: "081-234-5678", province: "ขอนแก่น", brand: "Toyota", model: "Yaris", year: "2019", mileage: "85,000", gear: "ออโต้", color: "ขาว", asking: "350000", consent: "on" };

test("ฟอร์มขายรถ: ข้อมูลครบผ่าน · จัดรูปเบอร์และตัวเลข", () => {
  const r = parseSellCar(ok, 5, new Date("2026-11-27"));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.phone, "0812345678");
    assert.equal(r.value.data.mileage, 85000);
    assert.equal(r.value.data.asking, 350000);
    assert.match(sellCarMessage({ id: 7, ...r.value }, "https://x/p"), /Toyota Yaris ปี 2019 · 85,000 กม\./);
  }
});

test("ฟอร์มขายรถ: แจ้งข้อผิดพลาดที่ลูกค้าเข้าใจ", () => {
  const bad = (o: Record<string, unknown>, photos: number, re: RegExp) => {
    const r = parseSellCar({ ...ok, ...o }, photos, new Date("2026-11-27"));
    assert.ok(!r.ok && re.test(r.error), JSON.stringify(r));
  };
  bad({}, 3, /แนบรูปรถ 4–10/);
  bad({}, 11, /แนบรูปรถ/);
  bad({ phone: "12" }, 5, /เบอร์โทร/);
  bad({ year: "2035" }, 5, /ปีรถ/);
  bad({ gear: "CVT" }, 5, /เกียร์/);
  bad({ consent: undefined }, 5, /ข้อมูลส่วนบุคคล/);
});

test("เทมเพลตเต็นท์รถต้องมีบล็อกรถและฟอร์มขายรถ", () => {
  const spec: TemplateSpec = { key: "D9", version: 1, name: "เต็นท์", business: "car_dealer", palette: "ocean", fonts: "modern", radius: 12,
    blocks: ["hero", "cars", "sellcar", "hours", "line", "map"].map((type) => ({ type, variant: type === "hero" ? "split" : type === "cars" ? "cards" : "default" })),
    required: ["hero", "cars", "sellcar", "hours", "line", "map"] };
  assert.ok(checksPass(checkTemplate(spec)), JSON.stringify(checkTemplate(spec).filter((c) => !c.ok)));
  const noForm = { ...spec, blocks: spec.blocks.filter((b) => b.type !== "sellcar"), required: spec.required.filter((t) => t !== "sellcar") };
  assert.ok(!checksPass(checkTemplate(noForm)));
});
