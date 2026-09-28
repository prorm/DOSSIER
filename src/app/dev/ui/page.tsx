import { notFound } from "next/navigation";

import { EffectsBoot } from "@/components/dossier/effects";
import { PageHeader } from "@/components/dossier/primitives";
import { UiLab } from "@/components/dossier/ui-lab";
import { env } from "@/server/env";
import { pageStaffSession } from "@/server/page-auth";

export const metadata = { title: "UI Lab" };

/** Internal design laboratory. Open in development; in production only for signed-in staff or with DEV_UI=1. */
export default async function DevUiPage() {
  const e = env();
  const staff = await pageStaffSession();
  if (e.NODE_ENV === "production" && !e.DEV_UI && !(staff && staff.kind === "staff")) notFound();
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10">
      <EffectsBoot />
      <PageHeader eyebrow="DOSSIER // design laboratory" title="/dev/ui">
        Every foundational primitive and React Bits integration in its real states. If it looks wrong here, it looks wrong in the product.
      </PageHeader>
      <UiLab />
    </main>
  );
}
