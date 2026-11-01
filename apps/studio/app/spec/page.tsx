import { BLOCKS } from "@/lib/blocks";
import { EVENT_CATALOG, ALL_EVENTS } from "@/lib/events";
import { Header, Card } from "@/components/ui";
const ROAD = [["O1 · แกนกลาง", "Site Engine + T3 + clients/sites/site_versions/events + แก้ config ในหลังบ้าน", "กำลังทำ"], ["O2 · ลูกค้าคนแรก", "LINE webhook + Portal + ใบแจ้งหนี้ + QR + คนยืนยันสลิป", "รอ O1"], ["O3 · อัตโนมัติ", "state machine + คิว + SLA + ตรวจสลิปอัตโนมัติ + publish อัตโนมัติ", "รอ O2"], ["O4 · ขยาย", "เทมเพลต T1–T10 + ต่ออายุ + บัญชี + ต้นทุน + canary", "รอ O3"]];
export default function Spec() {
  return (<>
    <Header crumb="ระบบ" title="สเปก & Roadmap"><span className="chip c-g">อนุมัติรอบที่ 3 · 1 พ.ย. 2569</span></Header>
    <div className="bd">
      <Card title="Roadmap · ส่งมอบเป็นช่วง (O1–O5)" right={<span className="sm mut">เกณฑ์ผ่าน: ลูกค้าจริง ≥ 3 ราย</span>}><div className="kpis">{ROAD.map(([n, d, s]) => <div key={n} className="card kpi"><div className="f" style={{ justifyContent: "space-between" }}><b>{n}</b><span className={"chip " + (s === "กำลังทำ" ? "c-b" : "")}>{s}</span></div><div className="sm mut" style={{ marginTop: 8 }}>{d}</div></div>)}</div></Card>
      <Card title={`Block schema (N1) · ${Object.keys(BLOCKS).length} บล็อก`} pad={false}><div className="tw"><table><thead><tr><th>บล็อก</th><th>ฟิลด์และข้อจำกัด</th><th>ใช้ใน</th></tr></thead><tbody>{Object.entries(BLOCKS).map(([k, b]) => <tr key={k}><td className="mono"><b>{k}</b></td><td>{b.summary}</td><td>{b.usedIn}</td></tr>)}</tbody></table></div></Card>
      <Card title={`Event catalog (N3) · ${ALL_EVENTS.length} events`} pad={false}><div className="tw"><table><tbody>{Object.entries(EVENT_CATALOG).map(([g, es]) => <tr key={g}><td><b>{g}</b></td><td className="mono sm">{es.join(" · ")}</td></tr>)}</tbody></table></div></Card>
    </div>
  </>);
}
