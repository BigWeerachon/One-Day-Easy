// จำลองลูกค้า 100 ราย (seed คงที่ รันซ้ำได้ผลเดิม) · node docs/research/simulate.mjs
import { writeFileSync } from "node:fs";
let s = 20261127; const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(r() * a.length)];
const wpick = (a) => { let x = r(), t = 0; for (const o of a) { t += o.w; if (x < t) return o; } return a.at(-1); };
const SEG = [
  { k: "คาเฟ่เปิดใหม่", w: .22, biz: "cafe", inc: [20, 60], base: .42 },
  { k: "ร้านอาหารครอบครัว/ตามสั่ง", w: .26, biz: "restaurant", inc: [15, 50], base: .18 },
  { k: "ร้านขายดีมีลูกค้าประจำ", w: .14, biz: "restaurant", inc: [50, 150], base: .34 },
  { k: "ร้านย่านท่องเที่ยว", w: .08, biz: "restaurant", inc: [40, 120], base: .45 },
  { k: "เต็นท์รถมือสอง", w: .15, biz: "car_dealer", inc: [80, 400], base: .40 },
  { k: "ที่พัก/แคมป์/โฮมสเตย์", w: .12, biz: "hotel_camp", inc: [30, 200], base: .48 },
  { k: "งานตามโจทย์ (SME/หน่วยงาน)", w: .03, biz: "custom", inc: [100, 500], base: .30 },
];
const BEH = [
  { k: "พอใจเพจ Facebook", w: .24, d: -.18, o: "มีเพจกับ Google Maps แล้ว ทำเว็บเพิ่มทำไม" },
  { k: "ยอดหลักจากแอปเดลิเวอรี/OTA", w: .14, d: -.15, o: "ลูกค้ามาจาก Grab/Agoda อยู่แล้ว" },
  { k: "อยากดูโปร", w: .18, d: +.2, o: "อยากให้ค้นใน Google เจอและดูน่าเชื่อถือ" },
  { k: "ประหยัดทุกบาท", w: .14, d: -.2, o: "จ่ายแล้วได้ลูกค้าเพิ่มกี่คน" },
  { k: "ไม่ถนัดเทคโนโลยี", w: .16, d: +.05, o: "กลัวต้องตั้งค่าเอง ถ้าทำในไลน์ได้ก็โอเค" },
  { k: "เคยจ้างทำเว็บแล้วผิดหวัง", w: .14, d: -.05, o: "เคยโดนทิ้งงาน กลัวโอนแล้วเงียบ" },
];
const CITY = ["กรุงเทพฯ", "เชียงใหม่", "ขอนแก่น", "ภูเก็ต", "หัวหิน", "นครราชสีมา", "อุดรธานี", "ชลบุรี", "เชียงราย", "สุราษฎร์ธานี", "นครปฐม", "เขาใหญ่"];
const DRAW = { cafe: "หน้าเมนูสวย กดทัก LINE ได้", restaurant: "รวมเมนู ราคา เวลาเปิดไว้หน้าเดียว", car_dealer: "ลงรถพร้อมราคา ติดป้ายขายแล้ว + ฟอร์มรับซื้อรถเข้า LINE", hotel_camp: "จองตรงไม่เสียค่าคอม OTA", custom: "ทำตามโจทย์ ราคาตามขอบเขต" };
const rows = [];
for (let i = 1; i <= 100; i++) {
  const seg = wpick(SEG), beh = wpick(BEH), city = pick(CITY), age = 24 + Math.floor(r() * 32);
  const inc = Math.round(seg.inc[0] + r() * (seg.inc[1] - seg.inc[0]));
  const hasWeb = r() < .12, paid = beh.k === "เคยจ้างทำเว็บแล้วผิดหวัง";
  let p = seg.base + beh.d + (inc > 80 ? .08 : 0) + (age < 35 ? .05 : -.03) + (hasWeb ? -.25 : 0) + (r() - .5) * .2;
  p = Math.max(0, Math.min(.95, p));
  const replies = r() < .15 + p * .25, sample = replies && r() < .35 + p * .5, pays = sample && r() < p + .1;
  const pkg = pays ? (seg.biz === "hotel_camp" || seg.biz === "car_dealer" || seg.k === "ร้านย่านท่องเที่ยว" || r() < .3 ? 1490 : 990) : 0;
  const stage = pays ? "จ่ายเงิน" : sample ? "ได้ตัวอย่างแต่ไม่จ่าย" : replies ? "ตอบแต่ไม่ส่งข้อมูล" : "ไม่ตอบ";
  const reason = pays ? DRAW[seg.biz] : sample ? pick(["ตัวอย่างดูเหมือนร้านอื่น ไม่มีเอกลักษณ์", "อยากได้ระบบสั่งอาหารออนไลน์ด้วย", "ยังไม่เห็นว่าลูกค้าจะเพิ่ม", "ขอคิดดูก่อน รอหุ้นส่วนตัดสินใจ", "รูปในตัวอย่างไม่ใช่รูปร้านจริง"]) : replies ? beh.o : pick(["ไม่ได้อ่านข้อความจากร้านที่ไม่รู้จัก", "คิดว่าเป็นสแปม", "ยุ่งช่วงขายของ", beh.o]);
  rows.push({ id: i, seg: seg.k, biz: seg.biz, city, age, incomeK: inc, behaviour: beh.k, hasWeb, p: +p.toFixed(2), stage, pkg, reason });
}
writeFileSync(new URL("customers-100.json", import.meta.url), JSON.stringify(rows, null, 1));
const by = (f) => rows.reduce((m, x) => ((m[f(x)] ??= []).push(x), m), {});
const sum = (a) => ({ n: a.length, reply: a.filter((x) => x.stage !== "ไม่ตอบ").length, sample: a.filter((x) => x.stage === "จ่ายเงิน" || x.stage === "ได้ตัวอย่างแต่ไม่จ่าย").length, pay: a.filter((x) => x.pkg).length, rev: a.reduce((t, x) => t + x.pkg, 0) });
console.log("ALL", sum(rows));
for (const [k, a] of Object.entries(by((x) => x.seg))) console.log(k, sum(a));
for (const [k, a] of Object.entries(by((x) => x.behaviour))) console.log(k, sum(a));
const rs = by((x) => x.reason); console.log(Object.entries(rs).map(([k, a]) => [k, a.length]).sort((a, b) => b[1] - a[1]));
