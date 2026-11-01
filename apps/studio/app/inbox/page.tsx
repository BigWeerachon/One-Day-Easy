import Link from "next/link";
import { db, clientOf } from "@/lib/store";
import { replyAction } from "@/lib/actions";
import { Header, Card, Av } from "@/components/ui";
export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const threads = [...new Set([...db.messages].sort((a, b) => b.at.localeCompare(a.at)).map((m) => m.clientId))];
  const cur = c ?? threads[0]; const cl = clientOf(cur);
  const msgs = db.messages.filter((m) => m.clientId === cur).sort((a, b) => a.at.localeCompare(b.at));
  return (<>
    <Header crumb="LINE + อีเมล รวมกัน" title="กล่องข้อความ" />
    <div className="bd"><div className="row">
      <Card className="side" title="แชท" pad={false}>{threads.map((id) => { const x = clientOf(id)!; const last = db.messages.filter((m) => m.clientId === id).at(-1)!; const un = db.messages.filter((m) => m.clientId === id && !m.read).length; return (
        <Link key={id} href={`/inbox?c=${id}`} className="qi" style={{ textDecoration: "none", background: id === cur ? "#eef4fe" : undefined }}><Av c={x.color} n={x.name} /><div style={{ flex: 1, minWidth: 0 }}><div className="f" style={{ justifyContent: "space-between" }}><b>{x.name}</b>{un > 0 && <span className="bdg">{un}</span>}</div><div className="sm mut" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.text}</div></div></Link>); })}</Card>
      <Card className="main" title={cl ? <Link href={`/clients/${cur}`}>{cl.name} · {cl.channel}</Link> : "—"}>
        <div className="list" style={{ minHeight: 300 }}>{msgs.map((m) => <div key={m.id} className={"bubble" + (m.from === "team" ? " me" : "")}>{m.text}<div className="sm" style={{ opacity: .7 }}>{new Date(m.at).toLocaleString("th-TH")}</div></div>)}</div>
        {cl && <form action={replyAction} className="f" style={{ marginTop: 16 }}><input type="hidden" name="client" value={cur} /><input className="inp" name="text" placeholder="พิมพ์ตอบ... (ส่งผ่าน LINE OA)" style={{ flex: 1 }} /><button className="btn">ส่ง</button></form>}
      </Card>
    </div></div>
  </>);
}
