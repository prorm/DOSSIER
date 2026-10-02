import { redirect } from "next/navigation";

/** v1 URL: the inquest now lives in the case file. */
export default function Legacy() {
  redirect("/play/case");
}
