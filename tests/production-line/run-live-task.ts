import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, StoredMessage } from "../../src/types.js";
import { extractCloseoutSessionId, getLiveTaskSessionsDir } from "./live-ecology/sessionCapture.ts";

interface CliArgs {
  promptPath: string;
  cliOutputPath: string;
  sessionPath: string;
}

interface SpawnResult {
  exitCode: number | null;
  output: string;
}

function parseCliArgs(args: string[]): CliArgs {
  const [promptPath, cliOutputPath, sessionPath] = args;
  if (!promptPath || !cliOutputPath || !sessionPath) {
    throw new Error("Usage: node tests/production-line/run-live-task.ts <promptPath> <cliOutputPath> <sessionPath>");
  }

  return {
    promptPath,
    cliOutputPath,
    sessionPath,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const prompt = await fs.readFile(args.promptPath, "utf8");
  await fs.mkdir(path.dirname(args.cliOutputPath), { recursive: true });

  const startedAt = Date.now();
  const promptNeedle = prompt.slice(0, 160);
  const sessionsDir = getLiveTaskSessionsDir();
  let matchedSessionId = "";
  let finishRequested = false;

  const monitorSession = async (): Promise<void> => {
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
    if (satisfied) {
      finishRequested = true;
    }
  };

  const result = await runKittyCli(prompt, monitorSession, () => finishRequested);
  await fs.writeFile(args.cliOutputPath, result.output, "utf8");

  const sessionId = matchedSessionId || extractCloseoutSessionId(result.output);
  await fs.writeFile(args.sessionPath, `${sessionId}\n`, "utf8");

  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    console.error(result.output);
    process.exit(result.exitCode);
  }

  console.log(`SESSION_ID=${sessionId}`);
}

async function runKittyCli(
  prompt: string,
  monitorSession: () => Promise<void>,
  shouldStop: () => boolean,
): Promise<SpawnResult> {
  const child = spawn(process.execPath, ["dist/cli.js", "run", prompt], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  const monitor = setInterval(() => {
    monitorSession()
      .then(() => {
        if (shouldStop()) {
          child.kill("SIGTERM");
        }
      })
      .catch((error: unknown) => {
        output += `\n[session-monitor-error] ${error instanceof Error ? error.message : String(error)}\n`;
      });
  }, 5_000);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
  clearInterval(monitor);

  return {
    exitCode,
    output,
  };
}

async function findMatchingSession(
  sessionsDir: string,
  promptNeedle: string,
  startedAt: number,
): Promise<SessionRecord | null> {
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

    const session = parseSessionRecord(raw);
    if (!session) {
      continue;
    }

    const firstExternalUser = session.messages.find(isExternalUserMessage);
    if (!firstExternalUser?.content?.includes(promptNeedle.slice(0, 64))) {
      continue;
    }

    return session;
  }

  return null;
}

function parseSessionRecord(raw: string): SessionRecord | null {
  const parsed = safeParseRecord(raw) as Partial<SessionRecord> | null;
  if (typeof parsed?.id === "string" && Array.isArray(parsed.messages)) {
    return parsed as SessionRecord;
  }

  return null;
}

function safeParseRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isExternalUserMessage(message: StoredMessage): boolean {
  return message.role === "user" &&
    typeof message.content === "string" &&
    !message.content.startsWith("[internal]");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
