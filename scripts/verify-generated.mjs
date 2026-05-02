import process from "node:process";

import { syncReadmeCapabilities } from "./readme-capabilities/core.mjs";

async function main() {
  const result = await syncReadmeCapabilities(process.cwd(), { check: true });
  if (result.staleFiles.length > 0) {
    throw new Error(`Generated artifacts are stale: ${result.staleFiles.join(", ")}. Run npm.cmd run sync.`);
  }
  console.log(`generated artifacts checked (${result.registeredToolCount} tools).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
