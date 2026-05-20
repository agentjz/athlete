import fs from "node:fs/promises";
import path from "node:path";

import { ensureExtensionDir, sanitizeStateSegment } from "../../shared.js";

export interface NetworkTraceRecord {
  traceId: string;
  recordedAt: string;
  summary?: string;
  request: unknown;
  response?: unknown;
  assertions?: unknown;
}

export async function writeNetworkTrace(
  rootDir: string,
  traceId: string,
  record: NetworkTraceRecord,
): Promise<string> {
  const filePath = await networkTraceFilePath(rootDir, traceId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return filePath;
}

export async function networkTraceFilePath(rootDir: string, traceId: string): Promise<string> {
  return path.join(await ensureExtensionDir(rootDir, "network"), "traces", `${sanitizeStateSegment(traceId)}.json`);
}
