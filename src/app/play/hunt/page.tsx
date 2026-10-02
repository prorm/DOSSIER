import { redirect } from "next/navigation";

/** v1 URL: the hunt/ctf boards are now rounds on the case map. */
export default function Legacy() {
  redirect("/play/map");
}
