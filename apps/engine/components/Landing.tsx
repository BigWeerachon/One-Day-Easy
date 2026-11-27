import "./landing.css";

/** หน้าขายบริการ One Day Easy · แสดงเมื่อเปิดจากโดเมนบริษัท (MARKETING_HOST) */
const LINE_OA = process.env.LINE_OA_ID ?? "";
const lineHref = /^@[\w.-]{2,}$/.test(LINE_OA) ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA)}` : "#start";
const year = new Date().getFullYear();

const steps = [
  ["ทัก LINE", "บอกชื่อร้านและประเภทร้าน ระบบถามข้อมูลที่ต้องใช้ทีละข้อในแชท"],
  ["ส่งรูปเมนูจากมือถือ", "ไม่ต้องเตรียมไฟล์สวย ถ่ายจากมือถือได้เลย เวลาเปิดและที่ตั้งพิมพ์ในแชท"],
  ["ดูตัวอย่างเว็บก่อนจ่าย", "ได้ลิงก์เว็บร้านคุณจริงภายในวันเดียว แก้ฟรี 2 รอบ"],
  ["ถูกใจค่อยจ่าย", "สแกน PromptPay ในแชท เว็บขึ้นออนไลน์ทันที ไม่มีมัดจำ"],
];
const kinds = [
  ["ร้านอาหาร", "เมนูพร้อมราคา ชุดคุ้มค่า รีวิว แผนที่ ปุ่มทัก LINE"],
  ["คาเฟ่", "เมนูเครื่องดื่มและขนม แกลเลอรีบรรยากาศ เวลาเปิด"],
  ["เต็นท์รถมือสอง", "รายการรถพร้อมราคา ป้ายขายแล้ว ฟอร์มรับซื้อรถพร้อมรูป"],
  ["ที่พัก / แคมป์", "ห้องพักพร้อมราคาต่อคืน แกลเลอรี เช็กอิน–เช็กเอาต์"],
];
const plans = [
  { name: "เว็บร้าน", price: "990", note: "ใช้ที่อยู่ฟรี", items: ["หน้าเมนู เวลาเปิด แผนที่ ปุ่มทักแชท", "แก้ฟรี 2 รอบ", "ดูตัวอย่างก่อนจ่าย"] },
  { name: "เว็บร้าน + โดเมน", price: "1,490", note: "ชื่อร้านคุณเป็นที่อยู่เว็บ", items: ["ทุกอย่างในแพ็กแรก", "โดเมนของร้าน เช่น ชื่อร้าน.com", "ตั้งค่า SSL ให้ครบ"], hot: true },
  { name: "ดูแลรายปี", price: "990", note: "ต่อหรือไม่ต่อก็ได้", items: ["แก้เมนูและราคาเองได้ตลอดปี", "เว็บออนไลน์ต่อเนื่อง", "ทีมช่วยแก้ทาง LINE"] },
];
const faqs = [
  ["มีเพจ Facebook กับ Google Maps แล้ว ต้องมีเว็บไหม", "ลูกค้าที่ค้นชื่อร้านใน Google จะเจอเมนู ราคา และเวลาเปิดในหน้าเดียว ไม่ต้องเลื่อนหาโพสต์เก่า และกดทัก LINE สั่งได้ทันที"],
  ["ต้องจ่ายก่อนไหม", "ไม่ต้อง เราทำตัวอย่างเว็บร้านคุณให้ดูก่อน ถ้าถูกใจค่อยจ่ายเต็มจำนวนผ่าน PromptPay"],
  ["ไม่มีเวลาเตรียมข้อมูล", "ส่งรูปเมนูจากมือถือในแชทได้เลย ระบบอ่านชื่อและราคาให้ คุณแค่ตรวจ"],
  ["ค่ารายปีต้องจ่ายทุกปีไหม", "ไม่บังคับ ปีแรกรวมในราคาแล้ว ปีต่อไปต่อเมื่ออยากให้ทีมดูแลและแก้ให้"],
  ["ทำเสร็จวันเดียวจริงไหม", "ถ้าข้อมูลครบภายในวัน ได้ลิงก์ตัวอย่างภายในวันนั้น เว็บใช้เทมเพลตที่ผ่านการตรวจความอ่านง่ายบนมือถือแล้ว"],
  ["แก้เมนูหรือราคาเองได้ไหม", "ได้ พิมพ์ \"แก้เว็บ\" ในแชท LINE จะได้ลิงก์หน้าแก้เมนู ราคา รูป และเวลาเปิด"],
];

export default function Landing() {
  return (
    <div className="ode">
      <header className="ode-top"><div className="ode-wrap ode-row">
        <a className="ode-brand" href="#">One Day Easy</a>
        <nav aria-label="เมนูหลัก"><a href="#how">ขั้นตอน</a><a href="#price">ราคา</a><a href="#faq">คำถาม</a></nav>
        <a className="ode-btn sm" href={lineHref}>ทัก LINE</a>
      </div></header>

      <section className="ode-hero"><div className="ode-wrap ode-hero-in">
        <div>
          <p className="ode-eyebrow">เว็บไซต์ร้านค้า เสร็จในวันเดียว ผ่าน LINE</p>
          <h1>ร้านคุณมีเว็บของตัวเอง<br />ดูตัวอย่างก่อน ถูกใจค่อยจ่าย</h1>
          <p className="ode-lead">ส่งรูปเมนูในแชท ได้เว็บร้านที่ลูกค้าค้นเจอใน Google มีเมนู ราคา เวลาเปิด แผนที่ และปุ่มทัก LINE เริ่มต้น 990 บาท ไม่มีมัดจำ</p>
          <div className="ode-actions"><a className="ode-btn" href={lineHref}>เริ่มทำเว็บฟรีใน LINE</a><a className="ode-btn ghost" href="#price">ดูราคา</a></div>
          <ul className="ode-proof"><li>✓ ไม่มีมัดจำ</li><li>✓ แก้ฟรี 2 รอบ</li><li>✓ จ่ายผ่าน PromptPay</li></ul>
        </div>
        <div className="ode-phone" aria-hidden="true">
          <div className="ode-phone-bar" />
          <div className="ode-mock-hero"><b>ครัวคุณยาย</b><span>อาหารไทยรสมือแม่ ปรุงสดทุกจาน</span><i>สั่งผ่าน LINE</i></div>
          {[["ผัดกะเพราหมูกรอบ", "฿70"], ["ต้มยำกุ้งน้ำข้น", "฿150"], ["แกงเขียวหวานไก่", "฿80"]].map(([n, p]) => <div className="ode-mock-row" key={n}><span>{n}</span><b>{p}</b></div>)}
          <div className="ode-mock-row"><span>เปิดทุกวัน 10:00–21:00</span></div>
        </div>
      </div></section>

      <section id="how" className="ode-sx"><div className="ode-wrap">
        <h2>4 ขั้นตอน ทั้งหมดอยู่ในแชท</h2>
        <ol className="ode-steps">{steps.map(([t, d], i) => <li key={t}><span className="ode-n">{i + 1}</span><b>{t}</b><p>{d}</p></li>)}</ol>
      </div></section>

      <section className="ode-sx alt"><div className="ode-wrap">
        <h2>เทมเพลตสำหรับธุรกิจของคุณ</h2>
        <div className="ode-grid">{kinds.map(([t, d]) => <div className="ode-card" key={t}><b>{t}</b><p>{d}</p></div>)}</div>
        <p className="ode-note">ทุกเทมเพลตออกแบบสำหรับมือถือก่อน ตัวหนังสืออ่านง่าย และผ่านการตรวจคอนทราสต์ทุกชุดสี</p>
      </div></section>

      <section id="price" className="ode-sx"><div className="ode-wrap">
        <h2>ราคาชัด จ่ายครั้งเดียว</h2>
        <div className="ode-grid plans">{plans.map((p) => (
          <div className={"ode-card plan" + (p.hot ? " hot" : "")} key={p.name}>
            {p.hot && <span className="ode-tag">นิยม</span>}
            <b>{p.name}</b><div className="ode-price">฿{p.price}</div><p className="ode-muted">{p.note}</p>
            <ul>{p.items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>))}</div>
        <p className="ode-note">แก้เกินรอบ ครั้งละ 450 บาท · ราคารวมแล้ว ไม่มีค่าใช้จ่ายแอบแฝง</p>
      </div></section>

      <section id="faq" className="ode-sx alt"><div className="ode-wrap narrow">
        <h2>คำถามที่พบบ่อย</h2>
        {faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div></section>

      <section id="start" className="ode-cta"><div className="ode-wrap">
        <h2>เริ่มได้วันนี้ ไม่ต้องจ่ายก่อน</h2>
        <p>ทักแชท LINE แล้วส่งชื่อร้าน ได้ตัวอย่างเว็บร้านคุณภายในวันเดียว</p>
        <a className="ode-btn" href={lineHref}>ทัก LINE {LINE_OA}</a>
      </div></section>

      <footer className="ode-foot"><div className="ode-wrap">© {year} One Day Easy · บริการทำเว็บไซต์ร้านค้าผ่าน LINE</div></footer>
    </div>
  );
}
