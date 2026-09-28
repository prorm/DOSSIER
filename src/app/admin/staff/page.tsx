import { StaffCreateForm, StaffToggle } from "@/components/dossier/admin-misc";
import { DataTable } from "@/components/dossier/admin-table";
import { LockedState, PageHeader, Panel, SectionTitle } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { hasRole } from "@/server/auth/session";
import { listStaff } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Staff" };

export default async function AdminStaff() {
  const { session, db } = await requireStaffPage("admin");
  if (!hasRole(session.staff.role, "owner")) return <LockedState title="Owner only">Staff management is limited to owners.</LockedState>;
  const staff = await listStaff(db);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Access" title="Staff accounts">
        Owners manage staff and packs. Admins run the event. Volunteers only see the station console.
      </PageHeader>
      <Panel>
        <SectionTitle>New account</SectionTitle>
        <StaffCreateForm />
      </Panel>
      <DataTable head={["Email", "Name", "Role", "Status", ""]} caption="Staff accounts">
        {staff.map((s) => (
          <tr key={s.id}>
            <td className="font-mono text-sm">{s.email}</td>
            <td className="text-sm">{s.name}</td>
            <td>
              <Badge variant={s.role === "owner" ? "accent" : s.role === "admin" ? "info" : "secondary"}>{s.role}</Badge>
            </td>
            <td>{s.disabled ? <Badge variant="danger">disabled</Badge> : <Badge variant="success">active</Badge>}</td>
            <td className="text-right">{s.id !== session.staff.id ? <StaffToggle id={s.id} disabled={s.disabled} /> : <span className="font-mono text-xs text-faint">you</span>}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
