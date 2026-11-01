import Link from "next/link";
import { db, clientOf } from "@/lib/store";
import { saveBlockAction, removeBlockAction, rollbackAction } from "@/lib/actions";
import { TEMPLATES, BLOCKS, runChecks } from "@/lib/blocks";
import { Header, Card, Err } from "@/components/ui";
import JobActions from "@/components/JobActions";
export default async function Builder({ searchParams }: { searchParams: Promise<{ site?: string; job?: string; block?: string; err?: string }> }) {
  const sp = await searchParams;
  const job = sp.job ? db.jobs.find((j) => j.id === sp.job) : undefined;
  const site = db.sites.find((s) => s.id === sp.site) ?? (job && db.sites.find((s) => s.clientId === job.clientId)) ?? db.sites[0];
  const tpl = TEMPLATES.find((t) => t.id === site.template)!;
  const checks = runChecks(tpl, site.config); const passed = checks.filter((c) => c.ok).length;
  const siteJob = job ?? db.jobs.find((j) => j.clientId === site.clientId && j.stage === "template");
  if (siteJob && siteJob.template === site.template) siteJob.checksPassed = passed;
  const block = sp.block && tpl.blocks.includes(sp.block) ? sp.block : tpl.blocks[0];
  const versions = db.versions.filter((v) => v.siteId === site.id);
  return (<>
    <Header crumb={`สร้างเว็บ · ${clientOf(site.clientId)?.name}`} title={site.domain}>
      {db.sites.map((s) => <Link key={s.id} className={"btn sm " + (s.id === site.id ? "" : "o")} href={`/builder?site=${s.id}`}>{clientOf(s.clientId)?.name}</Link>)}
    </Header>
    <div className="bd">
      <Err msg={sp.err} />
      <div className="row">
        <div className="main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title={`${tpl.id} · ${tpl.name}`} right={<span className="sm mut">v{site.version} · Claude/คน แก้ได้เฉพาะ JSON ตาม schema</span>}>
            <div className="f" style={{ marginBottom: 14 }}>{tpl.blocks.map((b) => <Link key={b} href={`/builder?site=${site.id}&block=${b}`} className={"chip " + (b === block ? "c-b" : b in site.config ? "c-g" : tpl.required.includes(b) ? "c-r" : "")} style={{ textDecoration: "none" }}>{b}{tpl.required.includes(b) ? "*" : ""}</Link>)}</div>
            <div className="sm mut" style={{ marginBottom: 6 }}>schema: <span className="mono">{BLOCKS[block].summary}</span></div>
            <form action={saveBlockAction} className="list" key={site.id + block + site.version}>
              <input type="hidden" name="site" value={site.id} /><input type="hidden" name="block" value={block} />
              <textarea name="json" rows={12} defaultValue={JSON.stringify(site.config[block] ?? {}, null, 2)} aria-label={`JSON ของบล็อก ${block}`} />
              <div className="f"><button className="btn">บันทึกเป็นเวอร์ชันใหม่</button></div>
            </form>
            {block in site.config && <form action={removeBlockAction} style={{ marginTop: 8 }}><input type="hidden" name="site" value={site.id} /><input type="hidden" name="block" value={block} /><button className="btn r sm">ลบบล็อกนี้</button></form>}
          </Card>
          <Card title="config ทั้งหมด (sites.config)"><pre className="code">{JSON.stringify(site.config, null, 2)}</pre></Card>
        </div>
        <div className="side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title="ตรวจอัตโนมัติก่อนส่ง" right={<span className={"chip " + (passed === 6 ? "c-g" : "c-r")}>{passed}/6</span>}><div className="list">{checks.map((c) => <div key={c.name} className="sm">{c.ok ? "✅" : "❌"} {c.name}</div>)}</div></Card>
          {siteJob && <Card title={`งาน · ${siteJob.title}`}><JobActions job={siteJob} back={`/builder?site=${site.id}`} /></Card>}
          <Card title="เวอร์ชัน (site_versions)" right={versions.length > 0 && <form action={rollbackAction}><input type="hidden" name="site" value={site.id} /><button className="btn o sm">ย้อนกลับ 1 เวอร์ชัน</button></form>}>
            <div className="list">{versions.map((v, i) => <div key={i} className="sm">v{v.version} · {v.note} · {v.by}</div>)}{!versions.length && <span className="sm mut">ยังไม่มีประวัติในรอบนี้</span>}</div>
          </Card>
          <Card title="เทมเพลต T1–T10"><div className="list">{TEMPLATES.map((t) => <div key={t.id} className="sm"><b>{t.id}</b> {t.name} <span className="mut">· {t.blocks.length} บล็อก</span></div>)}</div></Card>
        </div>
      </div>
    </div>
  </>);
}
