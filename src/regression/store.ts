import fs from "node:fs/promises";
import path from "node:path";

import { SessionStore } from "../agent/session.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { readAgentTraceEvents } from "../trace/store.js";
import { stringifyJson } from "../utils/json.js";
import {
  createRegressionCase,
  evaluateRegressionCase,
  parseRegressionCase,
  type RegressionCase,
  type RegressionCaseRunResult,
} from "./schema.js";

export interface RegressionCaseCaptureResult {
  regressionCase: RegressionCase;
  casePath: string;
}

export async function captureRegressionCase(input: {
  rootDir: string;
  sessionsDir: string;
  sessionId: string;
  caseId?: string;
}): Promise<RegressionCaseCaptureResult> {
  const sessionStore = new SessionStore(input.sessionsDir);
  const session = await sessionStore.load(input.sessionId);
  const traceEvents = await readAgentTraceEvents(input.rootDir, input.sessionId);
  if (traceEvents.length === 0) {
    throw new Error(`Session '${input.sessionId}' has no trace events to capture.`);
  }

  const regressionCase = createRegressionCase({
    session,
    traceEvents,
    caseId: input.caseId,
  });
  const casePath = getRegressionCasePath(input.rootDir, regressionCase.caseId);
  await fs.mkdir(path.dirname(casePath), { recursive: true });
  await fs.writeFile(casePath, stringifyJson(regressionCase), "utf8");
  return { regressionCase, casePath };
}

export async function listRegressionCaseFiles(rootDir: string): Promise<string[]> {
  const dir = getRegressionCaseRoot(rootDir);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".regression.json"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

export async function readRegressionCaseFile(casePath: string): Promise<RegressionCase> {
  return parseRegressionCase(JSON.parse(await fs.readFile(casePath, "utf8")));
}

export async function runRegressionCase(input: {
  rootDir: string;
  sessionsDir: string;
  casePath: string;
}): Promise<RegressionCaseRunResult> {
  const regressionCase = await readRegressionCaseFile(input.casePath);
  const sessionStore = new SessionStore(input.sessionsDir);
  const session = await sessionStore.load(regressionCase.source.sessionId);
  const traceEvents = (await readAgentTraceEvents(input.rootDir, regressionCase.source.sessionId))
    .filter((event) => regressionCase.source.turnIds.length === 0 || regressionCase.source.turnIds.includes(event.turnId));
  return evaluateRegressionCase({
    regressionCase,
    session,
    traceEvents,
  });
}

export async function runRegressionCases(input: {
  rootDir: string;
  sessionsDir: string;
  casePath?: string;
}): Promise<RegressionCaseRunResult[]> {
  const files = input.casePath ? [path.resolve(input.casePath)] : await listRegressionCaseFiles(input.rootDir);
  const results: RegressionCaseRunResult[] = [];
  for (const file of files) {
    results.push(await runRegressionCase({
      rootDir: input.rootDir,
      sessionsDir: input.sessionsDir,
      casePath: file,
    }));
  }
  return results;
}

export function getRegressionCaseRoot(rootDir: string): string {
  return path.join(getProjectStatePaths(rootDir).kittyDir, "regression-cases");
}

function getRegressionCasePath(rootDir: string, caseId: string): string {
  return path.join(getRegressionCaseRoot(rootDir), `${caseId}.regression.json`);
}
