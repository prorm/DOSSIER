import { route } from "@/server/http";
import { exportPack, zipFiles } from "@/server/packs/export";
import { audit } from "@/server/audit";

export const GET = route({ auth: "staff", role: "admin", event: true }, async ({ db, event, actor }) => {
  const files = await exportPack(db, event!);
  const zip = zipFiles(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${event!.id}/${k}`, v])));
  await audit(db, actor, "pack.export", { eventId: event!.id, target: event!.id });
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${event!.id}-export.zip"`,
      "cache-control": "no-store",
    },
  });
});
