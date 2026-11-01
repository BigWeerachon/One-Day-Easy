// สิทธิ์ตามบทบาท (pure · ทดสอบได้)
export const ROLES = ["owner", "builder", "accountant"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", builder: "Builder", accountant: "Accountant" };

export const PERMS = {
  "work.view": "ดูงานวันนี้ · Workflow · สเปก",
  "clients.view": "ดูลูกค้า · แชท",
  "clients.edit": "เพิ่มลูกค้า · ตอบแชท · เปลี่ยนขั้นงาน",
  "sites.edit": "สร้าง/แก้เว็บ · ใช้ Claude",
  "finance.view": "ดูการเงิน",
  "finance.edit": "ออกเอกสาร · ตรวจ/ยืนยันสลิป · ยกเลิกเอกสาร",
  "system.retry": "ลองงานอัตโนมัติใหม่",
  "team.manage": "จัดการทีมและสิทธิ์",
} as const;
export type Perm = keyof typeof PERMS;

const GRANTS: Record<Role, Perm[]> = {
  owner: Object.keys(PERMS) as Perm[],
  builder: ["work.view", "clients.view", "clients.edit", "sites.edit", "system.retry"],
  accountant: ["work.view", "finance.view", "finance.edit"],
};
export const can = (role: Role | undefined | null, perm: Perm) => !!role && GRANTS[role]?.includes(perm);
export const grantsOf = (role: Role) => GRANTS[role];

/** หน้าในเมนู → สิทธิ์ที่ต้องมี */
export const PAGE_PERM: Record<string, Perm> = {
  "/": "work.view", "/workflow": "work.view", "/spec": "work.view",
  "/inbox": "clients.view", "/clients": "clients.view",
  "/builder": "sites.edit", "/finance": "finance.view", "/settings": "team.manage",
};
export const homeFor = (role: Role) => "/";

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร";
  if (pw.length > 200) return "รหัสผ่านยาวเกินไป";
  if (!/[A-Za-zก-๙]/.test(pw) || !/\d/.test(pw)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  return null;
}
