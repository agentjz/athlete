import process from "node:process";

import { loadLiveEcologyGroups } from "./live-ecology/groups.ts";
import { printLiveEcologySummary } from "./live-ecology/report.ts";
import { runLiveEcology } from "./live-ecology/runner.ts";

interface LiveEcologyCliOptions {
  outputDir: string;
  timeoutMs?: number;
  groupIds: Set<string>;
  help: boolean;
  dryRun: boolean;
}

function parseOptions(args: string[]): LiveEcologyCliOptions {
  const options: LiveEcologyCliOptions = {
    outputDir: "",
    timeoutMs: undefined,
    groupIds: new Set<string>(),
    help: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      options.outputDir = readNext(args, ++index, "--out");
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(readNext(args, ++index, "--timeout-ms"), 10);
      continue;
    }
    if (arg === "--group") {
      options.groupIds.add(readNext(args, ++index, "--group"));
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readNext(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    const groups = await loadLiveEcologyGroups(root);
    console.log("Usage: npm.cmd run live:ecology -- [--dry-run] [--out <dir>] [--group <id>] [--timeout-ms <ms>]");
    console.log(`Groups: ${groups.map((group) => group.id).join(", ")}`);
    return;
  }

  const summary = await runLiveEcology(root, options);
  printLiveEcologySummary(summary);
  if (summary.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
