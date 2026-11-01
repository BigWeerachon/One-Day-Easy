import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { can, PAGE_PERM } from "@/lib/permissions";
import { Header } from "@/components/ui";
export default async function Forbidden() {
  const me = await requireStaff();
  const home = Object.entries(PAGE_PERM).find(([, p]) => can(me.role, p))?.[0] ?? "/account";
  return (<><Header crumb="สิทธิ์" title="ไม่มีสิทธิ์เข้าหน้านี้" /><div className="bd"><div className="note">บทบาทของคุณเข้าหน้านี้ไม่ได้ · ติดต่อ Owner ถ้าต้องการสิทธิ์เพิ่ม</div><div><Link className="btn" href={home}>กลับหน้าหลัก</Link></div></div></>);
}
