import { AdminShell } from "@/components/dossier/admin-client";
import { requireStaffPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

import "./ops.css";

export const metadata = { title: { default: "Operations", template: "%s · Ops" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, event, csrf } = await requireStaffPage("admin");
  const ev = event ? eventView(event) : null;
  return (
    <>
      <meta name="csrf-token" content={csrf} />
      <AdminShell staff={{ email: session.staff.email, role: session.staff.role }} eventName={ev?.name ?? null} phase={ev?.phase ?? null} frozen={ev?.frozen ?? false}>
        {children}
      </AdminShell>
    </>
  );
}
