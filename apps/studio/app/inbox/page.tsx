import Link from "next/link";
import { listThreads, listMessages, getClient } from "@/lib/store";
import { replyAction } from "@/lib/actions";
import { Header, Card, Av, Err } from "@/components/ui";
export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string; err?: string }> }) {
  const { c, err } = await searchParams;
  const threads = await listThreads();
  const cur = c ?? threads[0]?.clientId;
  const [cl, msgs] = cur ? await Promise.all([getClient(cur), listMessages(cur)]) : [undefined, []];
  return (<>
    <Header crumb="LINE + อีเมล รวมกัน" title="กล่องข้อความ" />
    <div className="bd"><Err msg={err} /><div className="row">
      <Card className="side" title="แชท" pad={false}>
        {threads.map((t) => (
          <Link key={t.clientId} href={`/inbox?c=${t.clientId}`} className="qi" style={{ textDecoration: "none", background: t.clientId === cur ? "#eef4fe" : undefined }}><Av c={t.color} n={t.name} /><div style={{ flex: 1, minWidth: 0 }}><div className="f" style={{ justifyContent: "space-between" }}><b>{t.name}</b>{t.unread > 0 && <span className="bdg">{t.unread}</span>}</div><div className="sm mut" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</div></div></Link>))}
        {!threads.length && <div className="cb mut">ยังไม่มีแชท</div>}
      </Card>
      <Card className="main" title={cl ? <Link href={`/clients/${cur}`}>{cl.name} · {cl.channel}</Link> : "—"}>
        <div className="list" style={{ minHeight: 300 }}>{msgs.map((m) => <div key={m.id} className={"bubble" + (m.from === "team" ? " me" : "")}>{m.text}<div className="sm" style={{ opacity: .75 }}>{new Date(m.at).toLocaleString("th-TH")}{m.from === "team" && m.delivery !== "none" && <> · {m.delivery === "sent" ? "✓ ส่ง LINE แล้ว" : m.delivery === "pending" ? "กำลังส่ง…" : `✗ ส่งไม่สำเร็จ: ${m.deliveryError}`}</>}</div></div>)}</div>
        {cl && <form action={replyAction} className="f" style={{ marginTop: 16 }}><input type="hidden" name="client" value={cur} /><input className="inp" name="text" placeholder={cl.channel === "LINE" ? "พิมพ์ตอบ... (ส่งผ่าน LINE OA)" : "พิมพ์ตอบ... (บันทึกในระบบ)"} style={{ flex: 1 }} /><button className="btn">ส่ง / อ่านแล้ว</button></form>}
      </Card>
    </div></div>
  </>);
}
