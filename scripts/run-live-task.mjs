import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import envPaths from "env-paths";

const [promptPath, cliOutputPath, sessionPath] = process.argv.slice(2);

if (!promptPath || !cliOutputPath || !sessionPath) {
  console.error("Usage: node scripts/run-live-task.mjs <promptPath> <cliOutputPath> <sessionPath>");
  process.exit(1);
}

const prompt = await fs.readFile(promptPath, "utf8");
await fs.mkdir(path.dirname(cliOutputPath), { recursive: true });
const startedAt = Date.now();
const promptNeedle = prompt.slice(0, 160);
const sessionsDir = path.join(envPaths("deadmouse").data, "sessions");

const child = spawn(
  process.execPath,
  ["dist/cli.js", "run", prompt],
  {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
let matchedSessionId = "";
let finishRequested = false;
child.stdout.on("data", (chunk) => {
  output += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString("utf8");
});

const monitor = setInterval(async () => {
  if (finishRequested) {
    return;
  }

  const matched = await findMatchingSession(sessionsDir, promptNeedle, startedAt);
  if (!matched) {
    return;
  }

  matchedSessionId = matched.id;
  const satisfied =
    matched.checkpoint?.status === "completed" ||
    matched.acceptanceState?.status === "satisfied";
  if (!satisfied) {
    return;
  }

  finishRequested = true;
  child.kill("SIGTERM");
}, 5_000);

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
clearInterval(monitor);

await fs.writeFile(cliOutputPath, output, "utf8");

const match = [...output.matchAll(/session:\s*(\S+)/g)].at(-1);
const sessionId = matchedSessionId || match?.[1] || "";
await fs.writeFile(sessionPath, `${sessionId}\n`, "utf8");

if (typeof exitCode === "number" && exitCode !== 0) {
  console.error(output);
  process.exit(exitCode);
}

console.log(`SESSION_ID=${sessionId}`);

async function findMatchingSession(sessionsDir, promptNeedle, startedAt) {
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const recent = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .slice(-20);

  for (const entry of recent) {
    const fullPath = path.join(sessionsDir, entry.name);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat || stat.mtimeMs < startedAt - 5_000) {
      continue;
    }

    const raw = await fs.readFile(fullPath, "utf8").catch(() => "");
    if (!raw || !raw.includes(promptNeedle.slice(0, 64))) {
      continue;
    }

    const session = JSON.parse(raw);
    const firstExternalUser = Array.isArray(session.messages)
      ? session.messages.find((message) =>
        message?.role === "user" &&
        typeof message.content === "string" &&
        !message.content.startsWith("[internal]"),
      )
      : null;
    if (!firstExternalUser?.content?.includes(promptNeedle.slice(0, 64))) {
      continue;
    }

    return session;
  }

  return null;
}
