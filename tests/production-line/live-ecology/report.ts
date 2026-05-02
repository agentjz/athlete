import fs from "node:fs/promises";
import path from "node:path";

import type { LiveEcologySummary } from "./runner.ts";

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function printLiveEcologySummary(summary: LiveEcologySummary): void {
  console.log(`live ecology: ${summary.status}`);
  console.log(`mode=${summary.mode}`);
  console.log(`runRoot=${summary.runRoot}`);
  for (const group of summary.groups) {
    const progress = group.mode === "dry-run"
      ? `prepared=${group.preparedTools.length}`
      : `covered=${group.coveredTools.length}/${group.expectedTools.length} missing=${group.missingTools.length} failed=${group.failedTools.length}`;
    console.log(`${group.id}: ${group.status} ${progress}`);
    if (group.missingTools.length > 0) {
      console.log(`  missing: ${group.missingTools.join(", ")}`);
    }
    if (group.failedTools.length > 0) {
      console.log(`  failed: ${group.failedTools.map((item) => item.tool).join(", ")}`);
    }
    if (group.reportProblems.length > 0) {
      console.log(`  report: ${group.reportProblems.join("; ")}`);
    }
  }
}
