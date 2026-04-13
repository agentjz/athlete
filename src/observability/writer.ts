import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import { buildObservabilityEventRecord, type ObservabilityEventInput, type ObservabilityEventRecord } from "./schema.js";

export async function appendObservabilityEvent(
  rootDir: string,
  input: ObservabilityEventInput,
): Promise<ObservabilityEventRecord> {
  const paths = await ensureProjectStateDirectories(rootDir);
  const record = buildObservabilityEventRecord(input);
  const filePath = path.join(paths.observabilityEventsDir, `${record.timestamp.slice(0, 10)}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function recordObservabilityEvent(
  rootDir: string,
  input: ObservabilityEventInput,
): Promise<void> {
  try {
    await appendObservabilityEvent(rootDir, input);
  } catch {
    // Observability is a side-channel only. It must not break the formal path.
  }
}

export function getObservabilityPaths(rootDir: string) {
  return getProjectStatePaths(rootDir);
}
