import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

export interface ProcessRunOptions {
  cwd: string;
  timeoutMs: number;
  capturePath: string;
}

export interface ProcessRunResult {
  exitCode: number;
  timedOut: boolean;
}

export async function runCommand(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let output = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);

  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearTimeout(timer);

  if (timedOut) {
    output += `\n[TIMEOUT] process exceeded ${options.timeoutMs}ms\n`;
  }

  await fs.mkdir(path.dirname(options.capturePath), { recursive: true });
  await fs.writeFile(options.capturePath, output, "utf8");
  return {
    exitCode: typeof exitCode === "number" ? exitCode : 1,
    timedOut,
  };
}

export async function runNodeProcess(args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  return runCommand(process.execPath, args, options);
}

export function createTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
