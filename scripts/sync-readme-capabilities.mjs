import process from "node:process";

import { syncReadmeCapabilities } from "./readme-capabilities/core.mjs";

async function main() {
  const result = await syncReadmeCapabilities(process.cwd(), { check: process.argv.includes("--check") });
  if (result.mode === "check" && result.staleFiles.length > 0) {
    throw new Error(`README capability ecology is stale: ${result.staleFiles.join(", ")}. Run npm.cmd run sync:readme-capabilities.`);
  }

  console.log(`README capability ecology ${result.mode === "check" ? "checked" : "synced"} (${result.registeredToolCount} tools).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
