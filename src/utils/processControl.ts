import process from "node:process";

import { execa } from "execa";

export async function terminateKnownProcesses(
  pids: Array<number | undefined>,
): Promise<number[]> {
  const uniquePids = [...new Set(
    pids
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value)),
  )];
  const terminated: number[] = [];

  for (const pid of uniquePids) {
    const killed = await terminateProcessTree(pid);
    if (killed || !isProcessAlive(pid)) {
      terminated.push(pid);
    }
  }

  return terminated;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcessTree(pid: number): Promise<boolean> {
  if (!isProcessAlive(pid)) {
    return false;
  }

  if (process.platform === "win32") {
    await execa("taskkill", ["/PID", String(pid), "/T", "/F"], {
      reject: false,
      timeout: 10_000,
      windowsHide: true,
    }).catch(() => null);
    await waitForProcessExit(pid, 40, 50);
    return !isProcessAlive(pid);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }

  await waitForProcessExit(pid, 20, 50);
  if (!isProcessAlive(pid)) {
    return true;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return false;
  }

  await waitForProcessExit(pid, 20, 50);
  return !isProcessAlive(pid);
}

async function waitForProcessExit(pid: number, attempts: number, delayMs: number): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
