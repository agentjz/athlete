import fs from "node:fs";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import { buildCrashReportRecord } from "./schema.js";

export interface CrashRecorderInstallOptions {
  rootDir: string;
  host?: string;
  sessionId?: string;
  executionId?: string;
}

export interface CrashContextScope {
  host?: string;
  sessionId?: string;
  executionId?: string;
}

let installed = false;
let installedHandler: ((error: Error, origin: string) => void) | null = null;
let defaultContext: CrashRecorderInstallOptions | null = null;
const activeCrashContexts = new Map<number, CrashContextScope>();
let nextCrashContextId = 0;

export function installCrashRecorder(options: CrashRecorderInstallOptions): void {
  defaultContext = {
    ...(defaultContext ?? {}),
    ...options,
  };

  if (installed) {
    return;
  }

  installedHandler = (error, origin) => {
    if (!defaultContext?.rootDir) {
      return;
    }

    writeCrashReportSync(defaultContext.rootDir, error, origin, readMergedCrashContext());
  };
  process.on("uncaughtExceptionMonitor", installedHandler);
  installed = true;
}

export function enterCrashContext(context: CrashContextScope): () => void {
  const id = ++nextCrashContextId;
  activeCrashContexts.set(id, context);
  return () => {
    activeCrashContexts.delete(id);
  };
}

export function writeCrashReportSync(
  rootDir: string,
  error: unknown,
  origin: string,
  context: CrashContextScope = {},
): string | null {
  try {
    const paths = getProjectStatePaths(rootDir);
    fs.mkdirSync(paths.observabilityCrashesDir, { recursive: true });
    const record = buildCrashReportRecord({
      cwd: process.cwd(),
      host: context.host,
      sessionId: context.sessionId,
      executionId: context.executionId,
      error,
      details: {
        origin,
        activeContexts: [...activeCrashContexts.values()],
      },
    });
    const filename = `${record.timestamp.replace(/[:.]/g, "-")}-${record.pid}.json`;
    const filePath = path.join(paths.observabilityCrashesDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
    return filePath;
  } catch {
    return null;
  }
}

function readMergedCrashContext(): CrashContextScope {
  const latestActive = [...activeCrashContexts.values()].at(-1) ?? {};
  return {
    host: latestActive.host ?? defaultContext?.host,
    sessionId: latestActive.sessionId ?? defaultContext?.sessionId,
    executionId: latestActive.executionId ?? defaultContext?.executionId,
  };
}
