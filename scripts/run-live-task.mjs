import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const [promptPath, cliOutputPath, sessionPath] = process.argv.slice(2);

if (!promptPath || !cliOutputPath || !sessionPath) {
  console.error("Usage: node scripts/run-live-task.mjs <promptPath> <cliOutputPath> <sessionPath>");
  process.exit(1);
}

const prompt = await fs.readFile(promptPath, "utf8");
await fs.mkdir(path.dirname(cliOutputPath), { recursive: true });

const child = spawn(
  process.execPath,
  ["dist/cli.js", "run", prompt],
  {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString("utf8");
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});

await fs.writeFile(cliOutputPath, output, "utf8");

const match = [...output.matchAll(/session:\s*(\S+)/g)].at(-1);
const sessionId = match?.[1] ?? "";
await fs.writeFile(sessionPath, `${sessionId}\n`, "utf8");

if (typeof exitCode === "number" && exitCode !== 0) {
  console.error(output);
  process.exit(exitCode);
}

console.log(`SESSION_ID=${sessionId}`);
