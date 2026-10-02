import "./_env";
import path from "node:path";
import { createDb, setDbHandle } from "../src/server/db/client";
import { formatIssue, listPacks, loadPack, packSummary } from "../src/server/packs/load";
import { blueprintFromV1 } from "../src/server/packs/adapter";
import { prepareBlueprint } from "../src/server/game/compile";
import { validateBlueprint } from "../src/server/game/compiler/validate";

/** Usage: pnpm pack:validate <slug>   (or --all) */
async function main() {
  const packsDir = path.resolve(process.env.PACKS_DIR ?? "packs");
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: pnpm pack:validate <slug> | --all");
    process.exit(2);
  }
  const slugs = arg === "--all" ? await listPacks(packsDir) : [arg];
  setDbHandle(await createDb("memory://validate"));
  let failed = false;
  for (const slug of slugs) {
    const { pack, issues } = await loadPack(packsDir, slug);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    console.log(`\n▌ ${slug}`);
    for (const i of issues) console.log(`  ${formatIssue(i)}`);
    if (pack) {
      const sum = packSummary(pack);
      console.log(`  ✔ schema valid (${sum.format}) — ${sum.nodes} challenges [${sum.families.join(", ")}], ${sum.checkpoints} checkpoints, ${pack.assets.length} assets · hash ${pack.hash}`);
      // Full compiler validation: reachability, intended solutions, leakage, seeds…
      const prepared = prepareBlueprint(pack.format === "v2" ? pack.blueprint : blueprintFromV1(pack));
      const report = await validateBlueprint(prepared.blueprint, { plaintext: prepared.plaintext, samples: 2 });
      for (const i of [...report.errors, ...report.warnings]) console.log(`  ${i.severity === "error" ? "✖" : "⚠"} [${i.check}]${i.node ? ` ${i.node}:` : ""} ${i.message}`);
      console.log(`  ${report.ok ? "✔" : "✖"} compiler: ${report.errors.length} error(s), ${report.warnings.length} warning(s); max depth ${report.stats.maxDepth}, critical path ~${report.stats.criticalMinutes} min`);
      if (!report.ok) failed = true;
    } else {
      failed = true;
      console.log(`  ✖ invalid — ${errors.length} error(s), ${warnings.length} warning(s)`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
