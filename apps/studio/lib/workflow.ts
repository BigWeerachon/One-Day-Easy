// N4 — ตารางการเปลี่ยนขั้น · ห้ามข้ามขั้น
export const STAGES = ["new_chat", "intake", "template", "client_review", "invoice", "payment", "online", "care", "paused"] as const;
export type Stage = (typeof STAGES)[number];
export type Actor = "system" | "human" | "client";

export const STAGE_LABEL: Record<Stage, string> = {
  new_chat: "แชทใหม่", intake: "เก็บข้อมูล", template: "เลือกเทมเพลต", client_review: "ลูกค้าตรวจ",
  invoice: "ออกใบ", payment: "ชำระ", online: "ออนไลน์", care: "ดูแลรายปี", paused: "พักงาน",
};

export interface Transition { from: Stage | "*"; to: Stage; by: Actor; condition: string }

export const TRANSITIONS: Transition[] = [
  { from: "new_chat", to: "intake", by: "system", condition: "สร้าง client แล้ว" },
  { from: "intake", to: "template", by: "system", condition: "เช็กลิสต์ครบ + ยินยอม PDPA" },
  { from: "template", to: "client_review", by: "human", condition: "ตรวจผ่าน 6/6" },
  { from: "client_review", to: "template", by: "client", condition: "ขอแก้ · นับรอบ" },
  { from: "client_review", to: "invoice", by: "client", condition: "กดอนุมัติ" },
  { from: "invoice", to: "payment", by: "system", condition: "ใบแจ้งหนี้ออกแล้ว" },
  { from: "payment", to: "online", by: "system", condition: "ชำระครบ + อนุมัติแล้ว" },
  { from: "online", to: "care", by: "system", condition: "ครบ 11 เดือน" },
  { from: "*", to: "paused", by: "human", condition: "ใส่เหตุผล · ย้อนกลับได้" },
];

export interface JobCtx { checklistDone: boolean; pdpa: boolean; checksPassed: number; paidInFull: boolean; approved: boolean; reason?: string }

export function guard(t: Transition, c: JobCtx): string | null {
  if (t.to === "template" && t.from === "intake" && !(c.checklistDone && c.pdpa)) return "เช็กลิสต์ยังไม่ครบหรือยังไม่ยินยอม PDPA";
  if (t.to === "client_review" && c.checksPassed < 6) return `ตรวจผ่าน ${c.checksPassed}/6 ยังไม่ครบ`;
  if (t.to === "online" && !(c.paidInFull && c.approved)) return "ยังชำระไม่ครบหรือยังไม่อนุมัติ";
  if (t.to === "paused" && !c.reason?.trim()) return "ต้องใส่เหตุผลการพักงาน";
  return null;
}

export function findTransition(from: Stage, to: Stage, by: Actor): Transition | undefined {
  return TRANSITIONS.find((t) => (t.from === from || (t.from === "*" && from !== "paused")) && t.to === to && t.by === by);
}

export function canTransition(from: Stage, to: Stage, by: Actor, c: JobCtx): { ok: true } | { ok: false; error: string } {
  const t = findTransition(from, to, by);
  if (!t) return { ok: false, error: `ไม่อนุญาต: ${STAGE_LABEL[from]} → ${STAGE_LABEL[to]} โดย ${by}` };
  const g = guard(t, c);
  return g ? { ok: false, error: g } : { ok: true };
}

export function nextOptions(from: Stage): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from || (t.from === "*" && from !== "paused"));
}
