import { route } from "@/server/http";
import { listCheckpoints } from "@/server/engine/live";
import { checkpointQrPdf } from "@/server/engine/qr-sheet";
import { audit } from "@/server/audit";
import { GameError } from "@/server/engine/errors";

/** GET /api/admin/checkpoints/qr[?id=cp] → printable PDF of checkpoint QR sheets. */
export const GET = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }) => {
  const only = new URL(req.url).searchParams.get("id");
  const cps = (await listCheckpoints(db, event!.id)).filter((c) => !only || c.id === only);
  if (!cps.length) throw new GameError("not_found", "No checkpoints to export.");
  const pdf = await checkpointQrPdf(event!, cps);
  await audit(db, actor, "checkpoint.qr_export", { eventId: event!.id, details: { checkpoints: cps.map((c) => c.id) } });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${event!.id}-checkpoints${only ? `-${only}` : ""}.pdf"`,
      "cache-control": "no-store",
    },
  });
});
