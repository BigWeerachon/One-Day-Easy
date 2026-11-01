import { moveJobAction } from "@/lib/actions";
import { nextOptions, STAGE_LABEL, type Stage } from "@/lib/workflow";
import type { Job } from "@/lib/store";
const BY_LABEL = { system: "ระบบ", human: "👤 คน", client: "ลูกค้า" };
export default function JobActions({ job, back }: { job: Job; back: string }) {
  const opts = nextOptions(job.stage);
  return (
    <div className="f">
      {job.stage === "paused" && job.pausedFrom && (
        <form action={moveJobAction}><input type="hidden" name="job" value={job.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="to" value={job.pausedFrom} /><input type="hidden" name="by" value="human" /><button className="btn o sm">ย้อนกลับ → {STAGE_LABEL[job.pausedFrom]}</button></form>
      )}
      {opts.map((t) => (
        <form key={t.to + t.by} action={moveJobAction} className="f">
          <input type="hidden" name="job" value={job.id} /><input type="hidden" name="back" value={back} />
          <input type="hidden" name="to" value={t.to} /><input type="hidden" name="by" value={t.by} />
          {t.to === "paused" && <input className="inp" name="reason" placeholder="เหตุผลการพักงาน" style={{ width: 170 }} />}
          <button className={"btn sm " + (t.to === "paused" ? "r" : "o")} title={t.condition}>{BY_LABEL[t.by]}: → {STAGE_LABEL[t.to as Stage]}</button>
        </form>
      ))}
    </div>
  );
}
