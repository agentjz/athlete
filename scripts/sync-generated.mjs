import process from "node:process";

import { syncReadmeCapabilities } from "./readme-capabilities/core.mjs";

async function main() {
  const result = await syncReadmeCapabilities(process.cwd());
  console.log(`generated artifacts synced (${result.registeredToolCount} tools).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
