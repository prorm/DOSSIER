import type { ChallengeView, OpenChallengeView } from "@/server/engine/play";

/** Type guard: a challenge the team can see in full (open or solved). */
export function isOpenView(c: ChallengeView): c is OpenChallengeView {
  return c.state === "open" || c.state === "solved";
}
