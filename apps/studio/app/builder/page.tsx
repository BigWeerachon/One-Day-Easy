import Link from "next/link";
import { listSites, getSite, getJob, listJobs, siteVersions, listClients } from "@/lib/store";
import { saveBlockAction, removeBlockAction, rollbackAction, createSiteAction } from "@/lib/actions";
import { TEMPLATES, BLOCKS, runChecks } from "@/lib/blocks";
import { Header, Card, Err } from "@/components/ui";
import JobActions from "@/components/JobActions";
export default async function Builder({ searchParams }: { searchParams: Promise<{ site?: string; job?: string; block?: string; err?: string }> }) {
  const sp = await searchParams;
  const [sites, clients] = await Promise.all([listSites(), listClients()]);
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const job = sp.job ? await getJob(sp.job) : undefined;

  // งานที่ยังไม่มีเว็บ → เลือกเทมเพลตเพื่อสร้าง
  if (job && !job.siteId) return (<>
    <Header crumb={`สร้างเว็บ · ${name[job.clientId]}`} title="เลือกเทมเพลต" />
    <div className="bd"><Err msg={sp.err} />
      <Card title={`งาน: ${job.title}`} right={<span className="sm mut">สร้างเว็บใหม่จากเทมเพลต (บล็อก + theme)</span>}>
        <div className="kpis">{TEMPLATES.map((t) => (
          <form key={t.id} action={createSiteAction} className="card kpi"><input type="hidden" name="job" value={job.id} /><input type="hidden" name="template" value={t.id} />
            <b>{t.id} · {t.name}</b><div className="sm mut" style={{ margin: "6px 0 10px" }}>{t.blocks.join(" · ")}</div><button className="btn o sm">ใช้เทมเพลตนี้</button></form>))}
        </div>
      </Card>
    </div>
  </>);

  const site = (sp.site && await getSite(sp.site)) || (job?.siteId && await getSite(job.siteId)) || sites[0];
  if (!site) return (<><Header crumb="สร้างเว็บ" title="ยังไม่มีเว็บ" /><div className="bd"><div className="note">เริ่มจากเพิ่มลูกค้าแล้วเลือกเทมเพลตในงานนั้น</div></div></>);
  const tpl = TEMPLATES.find((t) => t.id === site.template)!;
  const checks = runChecks(tpl, site.config); const passed = checks.filter((c) => c.ok).length;
  const siteJob = job ?? (await listJobs(site.clientId)).find((j) => j.siteId === site.id && !["online", "care"].includes(j.stage));
  const block = sp.block && tpl.blocks.includes(sp.block) ? sp.block : tpl.blocks[0];
  const versions = await siteVersions(site.id);
  return (<>
    <Header crumb={`สร้างเว็บ · ${name[site.clientId]}`} title={site.domain}>
      {sites.map((s) => <Link key={s.id} className={"btn sm " + (s.id === site.id ? "" : "o")} href={`/builder?site=${s.id}`}>{name[s.clientId]}</Link>)}
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
          <Card title="ตรวจอัตโนมัติก่อนส่ง" right={<span className={"chip " + (passed === 6 ? "c-g" : "c-r")}>{passed}/6</span>}><div className="list">{checks.map((c) => <div key={c.name} className="sm">{c.ok ? "✅" : "❌"} {c.name}</div>)}</div><div className="sm mut" style={{ marginTop: 8 }}>ผลตรวจบันทึกลงงานทุกครั้งที่กดบันทึก</div></Card>
          {siteJob && <Card title={`งาน · ${siteJob.title}`}><div className="sm mut" style={{ marginBottom: 8 }}>ตรวจผ่านที่บันทึกไว้ {siteJob.checksPassed}/6</div><JobActions job={siteJob} back={`/builder?site=${site.id}`} /></Card>}
          <Card title="เวอร์ชัน (site_versions)" right={versions.length > 0 && <form action={rollbackAction}><input type="hidden" name="site" value={site.id} /><button className="btn o sm">ย้อนกลับ 1 เวอร์ชัน</button></form>}>
            <div className="list">{versions.map((v) => <div key={v.version} className="sm">v{v.version} · {v.note} · {v.by} · {new Date(v.at).toLocaleString("th-TH")}</div>)}{!versions.length && <span className="sm mut">ยังไม่มีประวัติ</span>}</div>
          </Card>
        </div>
      </div>
    </div>
  </>);
}
