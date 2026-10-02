import { PageHeader, Panel } from "@/components/dossier/primitives";
import { CreateEventForm } from "@/components/dossier/studio-setup";

export const metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <>
      <PageHeader eyebrow="Studio · step 1 of 5" title="Create new event">
        Set the frame: who is running it, for how long, and for teams of what size. You can change all of this later.
      </PageHeader>
      <Panel>
        <CreateEventForm />
      </Panel>
    </>
  );
}
