import "./_env";
import path from "node:path";
import { formatIssue, listPacks, loadPack } from "../src/server/packs/load";

/** Usage: pnpm pack:validate <slug>   (or --all) */
async function main() {
  const packsDir = path.resolve(process.env.PACKS_DIR ?? "packs");
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: pnpm pack:validate <slug> | --all");
    process.exit(2);
  }
  const slugs = arg === "--all" ? await listPacks(packsDir) : [arg];
  let failed = false;
  for (const slug of slugs) {
    const { pack, issues } = await loadPack(packsDir, slug);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    console.log(`\n▌ ${slug}`);
    for (const i of issues) console.log(`  ${formatIssue(i)}`);
    if (pack) {
      const byMode = pack.challenges.reduce<Record<string, number>>((m, c) => ((m[c.mode] = (m[c.mode] ?? 0) + 1), m), {});
      console.log(
        `  ✔ valid — ${pack.challenges.length} challenges (${Object.entries(byMode)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")}), ` +
          `${pack.story ? `${pack.story.evidence.length} evidence, ` : ""}${pack.checkpoints.length} checkpoints, ${pack.assets.length} assets` +
          `${warnings.length ? `, ${warnings.length} warning(s)` : ""} · hash ${pack.hash}`,
      );
    } else {
      failed = true;
      console.log(`  ✖ invalid — ${errors.length} error(s), ${warnings.length} warning(s)`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
