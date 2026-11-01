import Nav from "@/components/Nav";
import { unreadCount } from "@/lib/store";
import { requireStaff } from "@/lib/auth";
import { can, PAGE_PERM } from "@/lib/permissions";
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const allowed = Object.entries(PAGE_PERM).filter(([, p]) => can(me.role, p)).map(([h]) => h);
  const unread = can(me.role, "clients.view") ? await unreadCount().catch(() => 0) : 0;
  return <div className="s"><Nav unread={unread} allowed={allowed} me={{ name: me.name, role: me.role }} /><main className="mn">{children}</main></div>;
}
