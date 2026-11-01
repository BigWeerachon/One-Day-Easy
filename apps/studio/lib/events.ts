// N3 — Event catalog (47) · payload: actor · job_id · before/after · source · ไม่เก็บข้อมูลส่วนบุคคล
export const EVENT_CATALOG = {
  intake: ["message.received", "client.created", "form.sent", "form.submitted", "consent.given", "info.extracted", "info.missing.asked"],
  build: ["job.created", "job.paused", "job.resumed", "template.selected", "draft.generated", "patch.proposed", "patch.applied", "check.passed", "check.failed", "site.version.saved"],
  review: ["preview.sent", "preview.viewed", "site.approved", "edit.requested", "edit.round.exceeded"],
  billing: ["document.created", "document.revised", "document.issued", "document.sent", "document.viewed", "document.accepted", "document.voided", "document.expired", "payment.qr.created", "slip.received", "slip.verified", "slip.rejected", "payment.recorded", "refund.issued"],
  publish: ["site.published", "domain.attached", "ssl.issued", "site.down", "site.recovered"],
  system: ["task.failed", "task.deadlettered", "sla.breached", "incident.opened", "incident.closed", "lesson.created"],
} as const;
export type EventName = (typeof EVENT_CATALOG)[keyof typeof EVENT_CATALOG][number];
export const ALL_EVENTS: readonly string[] = Object.values(EVENT_CATALOG).flat();
