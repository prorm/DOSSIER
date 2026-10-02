import { redirect } from "next/navigation";

/** v1 URL: challenges are now nodes. */
export default async function Legacy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/play/node/${encodeURIComponent(id)}`);
}
