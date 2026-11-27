# Image Prompts — One Day Easy Template Album

ชุด prompt สำหรับสร้างภาพตัวอย่างทั้งหมดที่เทมเพลตใช้ (ร้านอาหาร `R` · คาเฟ่ `C` · เต็นท์รถ `D` · ที่พัก/แคมป์ `T3–T7`)
ใช้กับ Gemini ทีละ prompt ได้เลย แต่ละข้อระบุสัดส่วนภาพตาม token `ratio.*` ของระบบ

## วิธีใช้

1. วาง **Style base** ไว้ต้น prompt ทุกครั้ง (ทำให้ภาพทั้งอัลบัมโทนเดียวกัน)
2. ต่อด้วย prompt ของภาพนั้น และใส่สัดส่วนตามคอลัมน์ "Ratio"
3. ตั้งชื่อไฟล์ตามคอลัมน์ "File" (นำเข้าระบบได้ตรงตำแหน่ง)

### Style base (ใส่ทุกภาพ)

```
Photorealistic editorial photograph, natural light, shot on a full-frame camera with a 35mm lens, soft depth of field, warm and honest color grading, set in Thailand with Thai people and Thai surroundings where people appear. Clean composition with calm negative space for text overlay. No text, no letters, no logos, no watermarks, no signage with readable words, no frames or borders.
```

### กฎที่ภาพต้องผ่าน (จากระบบ)

- **ไม่มีตัวหนังสือในภาพ** ระบบวางข้อความเองทับรูป
- **ภาพ hero แบบ cover:** ต้องมีพื้นที่โล่งด้านล่างหรือด้านซ้าย สำหรับวางข้อความ (ระบบจะทับแผ่นดำ ≥55%)
- **ภาพเดียวกันต้องใช้ได้ 2 สัดส่วน:** 16:9 (จอใหญ่) และ 4:5 (มือถือ) → ให้วัตถุหลักอยู่กลางภาพ
- **ภาพการ์ด 4:3:** วัตถุเต็มเฟรม พื้นหลังเรียบ ดูรู้เรื่องแม้ย่อเหลือ 300px
- **ภาพแกลเลอรี 1:1:** ภาพบรรยากาศหลากหลาย ไม่ซ้ำมุมกัน

---

## 1. ร้านอาหาร (R)

| File | Ratio | Prompt |
|---|---|---|
| `r-hero-cover.jpg` | 16:9 (และ 4:5) | A lively Thai street-side restaurant at golden hour, steaming woks over open flame, a cook tossing stir-fry, warm lights, wooden tables in the foreground, lower third kept dark and uncluttered |
| `r-hero-split.jpg` | 4:3 | Overhead view of a shared Thai family meal on a wooden table: green curry, pad krapao with fried egg, som tam, sticky rice in a bamboo basket, hands reaching in |
| `r-menu-01.jpg` | 4:3 | Pad krapao moo saap with a crispy fried egg and jasmine rice on a white plate, plain light background |
| `r-menu-02.jpg` | 4:3 | Tom yum goong in a clay pot, large river prawns, lemongrass and chili visible, plain background |
| `r-menu-03.jpg` | 4:3 | Green curry with chicken and Thai eggplant in a ceramic bowl, side of rice, plain background |
| `r-menu-04.jpg` | 4:3 | Som tam Thai papaya salad with grilled chicken and sticky rice, plain background |
| `r-menu-05.jpg` | 4:3 | Pad thai with shrimp, lime wedge and crushed peanuts on a banana leaf, plain background |
| `r-menu-06.jpg` | 4:3 | Khao man gai Hainanese chicken rice with ginger sauce and clear soup, plain background |
| `r-menu-07.jpg` | 4:3 | Mango sticky rice with coconut cream on a small plate, plain background |
| `r-menu-08.jpg` | 4:3 | Thai iced tea with milk in a tall glass with condensation, plain background |
| `r-set-01.jpg` | 4:3 | Value set meal on a tray: rice, two dishes, soup and a drink, top-down, plain background |
| `r-gallery-01.jpg` | 1:1 | Close-up of a chef's hands plating a dish, steam rising |
| `r-gallery-02.jpg` | 1:1 | Restaurant interior with warm pendant lights and wooden tables, no people |
| `r-gallery-03.jpg` | 1:1 | Fresh herbs and chilies in baskets on a market stall |
| `r-gallery-04.jpg` | 1:1 | Friends laughing while sharing dishes at a table |

## 2. คาเฟ่ (C)

| File | Ratio | Prompt |
|---|---|---|
| `c-hero-cover.jpg` | 16:9 (และ 4:5) | Bright minimalist Thai café interior with large windows, plants, light wood counter, barista pouring latte art, morning light, left side kept calm for text |
| `c-hero-split.jpg` | 4:3 | Iced dirty coffee in a clear glass on a marble table by a sunny window |
| `c-menu-01.jpg` | 4:3 | Latte with rosetta latte art in a ceramic cup, top-down, plain background |
| `c-menu-02.jpg` | 4:3 | Iced matcha latte with visible milk layers in a tall glass, plain background |
| `c-menu-03.jpg` | 4:3 | Iced Thai tea topped with cream foam, plain background |
| `c-menu-04.jpg` | 4:3 | Butter croissant on a small plate, flaky layers, plain background |
| `c-menu-05.jpg` | 4:3 | Slice of coconut cake with toasted coconut on top, plain background |
| `c-menu-06.jpg` | 4:3 | Thick toast with butter and condensed milk, Thai café style, plain background |
| `c-gallery-01.jpg` | 1:1 | Coffee beans being weighed on a small scale |
| `c-gallery-02.jpg` | 1:1 | Cozy reading corner with a cup of coffee and a book |
| `c-gallery-03.jpg` | 1:1 | Barista grinding coffee, warm side light |
| `c-gallery-04.jpg` | 1:1 | Café exterior with plants and bicycles at the front, no signage text |

## 3. เต็นท์รถ (D)

| File | Ratio | Prompt |
|---|---|---|
| `d-hero-cover.jpg` | 16:9 (และ 4:5) | Clean modern used-car dealership lot in Thailand at dusk, rows of polished sedans and pickup trucks, soft overhead lights, bottom area dark and clear |
| `d-hero-split.jpg` | 4:3 | Friendly Thai salesperson handing car keys to a smiling customer beside a white pickup truck |
| `d-car-01.jpg` | 4:3 | White Toyota-style pickup truck, front three-quarter view, clean lot background, no badges or plates readable |
| `d-car-02.jpg` | 4:3 | Silver compact sedan, front three-quarter view, plain background, no readable plates |
| `d-car-03.jpg` | 4:3 | Black 7-seat SUV, side profile, plain background, no readable plates |
| `d-car-04.jpg` | 4:3 | Red eco hatchback, front three-quarter view, plain background, no readable plates |
| `d-car-05.jpg` | 4:3 | Grey pickup with double cab, rear three-quarter view, plain background, no readable plates |
| `d-car-06.jpg` | 4:3 | Car interior dashboard and steering wheel, clean and bright |
| `d-sell.jpg` | 4:3 | Person photographing their own car with a phone in a driveway, for a "sell your car" form header |
| `d-gallery-01.jpg` | 1:1 | Technician inspecting an engine bay |
| `d-gallery-02.jpg` | 1:1 | Close-up of a clean alloy wheel and tire |
| `d-gallery-03.jpg` | 1:1 | Dealership office with a desk and two chairs, bright |
| `d-gallery-04.jpg` | 1:1 | Car being washed and polished |

## 4. ที่พัก / แคมป์ริมแม่น้ำ (T3–T7)

ใช้กับเทมเพลต Editorial, วิดีโอ, Riverside, Cinematic · โทนอบอุ่นหรูเรียบ (ทองบรอนซ์/มรกต)

| File | Ratio | Prompt |
|---|---|---|
| `t-hero-cover.jpg` | 16:9 (และ 4:5) | Luxury riverside glamping resort in Kanchanaburi at golden hour, wooden villas along a calm river, mist over the water, mountains behind, lower half calm and dark for text |
| `t-hero-night.jpg` | 16:9 (และ 4:5) | Same riverside resort at blue hour, warm lights glowing from villas and reflected in the river, cinematic and quiet |
| `t-hero-video-poster.jpg` | 16:9 | Slow river view from a wooden deck at sunrise, soft fog, one long-tail boat far away |
| `t-room-river-loft.jpg` | 4:3 | Wooden river-view villa bedroom for two, king bed with white linen, wooden soaking tub by the window, river visible outside |
| `t-room-river-loft-2.jpg` | 4:3 | Wooden soaking tub on a private balcony overlooking a river |
| `t-room-garden-villa.jpg` | 4:3 | Garden villa interior with a small jacuzzi and a loft bed area, tropical plants outside |
| `t-room-family-villa.jpg` | 4:3 | Large family villa next to a swimming pool, one king bed and four single beds, bright and clean |
| `t-room-river-glamp.jpg` | 4:3 | Air-conditioned canvas glamping tent on a wooden platform by a river, warm string lights |
| `t-room-glamp-inside.jpg` | 4:3 | Inside a luxury canvas tent: king bed, rattan furniture, soft lamp light |
| `t-dining.jpg` | 4:3 | Riverside terrace restaurant with candle-lit tables at dusk |
| `t-breakfast.jpg` | 4:3 | American breakfast tray on a wooden balcony table with river view |
| `t-afternoon-tea.jpg` | 4:3 | Afternoon tea set with Thai desserts on a tiered stand |
| `t-meeting.jpg` | 4:3 | Small seminar room with wooden walls, long table and chairs, large window to greenery |
| `t-pool.jpg` | 4:3 | Infinity pool facing the river and mountains, morning |
| `t-jacuzzi.jpg` | 4:3 | Outdoor jacuzzi under trees with warm evening light |
| `t-bar.jpg` | 4:3 | Outdoor riverside bar with bonfire and lounge chairs at night |
| `t-kayak.jpg` | 4:3 | Two people kayaking on a calm river at sunrise |
| `t-zone-map.jpg` | 4:3 | Aerial drone view of the resort: villas, tent zone, pool and river, clear layout |
| `t-gallery-01.jpg` | 1:1 | Coffee cup on a wooden railing with river in soft focus |
| `t-gallery-02.jpg` | 1:1 | Couple watching sunset from a wooden pier |
| `t-gallery-03.jpg` | 1:1 | Close-up of white linen and morning light on a bed |
| `t-gallery-04.jpg` | 1:1 | Lanterns hanging over a pathway at night |
| `t-gallery-05.jpg` | 1:1 | Fresh tropical fruit platter on a table |
| `t-gallery-06.jpg` | 1:1 | Hammock between trees beside the river |
| `t-banner.jpg` | 21:9 | Wide panoramic river and mountain landscape, very calm, for a full-width divider banner |

## 5. ภาพกลาง (ใช้ได้ทุกธุรกิจ)

| File | Ratio | Prompt |
|---|---|---|
| `common-review-01.jpg` | 1:1 | Portrait of a smiling Thai woman in her 30s, natural light, plain background (for review avatar) |
| `common-review-02.jpg` | 1:1 | Portrait of a smiling Thai man in his 40s, natural light, plain background |
| `common-review-03.jpg` | 1:1 | Portrait of a young Thai couple smiling, natural light, plain background |
| `common-map-placeholder.jpg` | 4:3 | Soft top-down view of a Thai town street grid from above, muted colors, no text |
| `common-empty.jpg` | 4:3 | Very soft blurred warm background with gentle light, for empty states (no objects) |

## 6. โลโก้ (ทำแยก ไม่ใช้ภาพถ่าย)

```
Minimal flat vector logo mark for a small Thai business, single color, simple geometric shape, works at 40px height, transparent background, no text.
```
สร้าง 4 แบบ: ร้านอาหาร (ชาม/ตะเกียบ) · คาเฟ่ (แก้วกาแฟ) · เต็นท์รถ (ล้อ/กุญแจ) · ที่พัก (บ้านริมน้ำ/ภูเขา)

---

## หลังได้ภาพแล้ว

- อัปโหลดเข้า Design System ที่เมนู Assets (แยกกลุ่ม R / C / D / T / Common)
- ตรวจทุกภาพว่าไม่มีตัวหนังสือหรือทะเบียนรถที่อ่านได้
- ภาพ hero ให้ลองครอปทั้ง 16:9 และ 4:5 ว่าวัตถุหลักยังอยู่ในเฟรม
- รวมทั้งหมด **70 ภาพ** + โลโก้ 4 แบบ
