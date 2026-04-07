import fs from "node:fs/promises";
import path from "node:path";

export interface WeixinProcessLock {
  pidFilePath: string;
  release(): Promise<void>;
}

export async function acquireWeixinProcessLock(options: {
  stateDir: string;
  processId?: number;
  isProcessAlive?: (processId: number) => Promise<boolean> | boolean;
}): Promise<WeixinProcessLock> {
  const processId = options.processId ?? process.pid;
  const pidFilePath = path.join(options.stateDir, "service.pid");
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;

  await fs.mkdir(options.stateDir, { recursive: true });

  const existingPid = await readPidFile(pidFilePath);
  if (existingPid && existingPid !== processId && await isProcessAlive(existingPid)) {
    throw new Error(`Weixin service already running with PID ${existingPid}. Stop the existing process before starting a new one.`);
  }

  await fs.writeFile(pidFilePath, `${processId}\n`, "utf8");

  return {
    pidFilePath,
    async release() {
      const currentPid = await readPidFile(pidFilePath);
      if (currentPid !== processId) {
        return;
      }

      await fs.rm(pidFilePath, { force: true });
    },
  };
}

async function readPidFile(filePath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function defaultIsProcessAlive(targetPid: number): Promise<boolean> {
  if (!Number.isFinite(targetPid) || targetPid <= 0) {
    return false;
  }

  try {
    process.kill(targetPid, 0);
    return true;
  } catch {
    return false;
  }
}
