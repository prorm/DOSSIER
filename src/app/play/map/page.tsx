import { MapIndex } from "@/components/experience/deck/deck";
import { requireTeamPage } from "@/server/page-auth";

export const metadata = { title: "Case map" };

/**
 * The whole investigation, pulled back. The universe (rendered by the play
 * shell behind this page) is the map; this page contributes the index — the
 * same graph as a list, for keyboards, screen readers and small screens.
 */
export default async function MapPage() {
  const { event } = await requireTeamPage("/play/map");
  return <MapIndex eyebrow={event.name} />;
}
