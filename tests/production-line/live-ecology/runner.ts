import fs from "node:fs/promises";
import path from "node:path";

import {
  diagnoseLiveEcologyInventory,
  loadLiveEcologyGroups,
  type LiveEcologyGroup,
  type LiveEcologyInventoryFinding,
} from "./groups.ts";
import { createLiveEcologyMirror, prepareLiveEcologyMirror, type LiveEcologyMirror } from "./mirror.ts";
import { buildLiveEcologyPrompt, getExpectedTools, getSkippedTools } from "./prompt.ts";
import { createTimestamp, runNodeProcess } from "./process.ts";
import { writeJson } from "./report.ts";
import { collectCoveredTools, collectFailedTools, readSessionRecord, type FailedToolSummary } from "./session.ts";
import { loadRegisteredToolNames } from "./tools.ts";

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;

export interface LiveEcologyOptions {
  outputDir: string;
  timeoutMs?: number;
  groupIds: Set<string>;
  dryRun?: boolean;
  allTools?: boolean;
}

export interface LiveEcologyGroupSummary {
  id: string;
  title: string;
  mode: "dry-run" | "live";
  status: "passed" | "needs_review";
  exitCode: number;
  timedOut: boolean;
  sessionId: string;
  expectedTools: string[];
  preparedTools: string[];
  coveredTools: string[];
  missingTools: string[];
  failedTools: FailedToolSummary[];
  skippedTools: string[];
  skipReasons: Record<string, string>;
  promptPath: string;
  outputPath: string;
  reportPath: string;
  reportExists: boolean;
  reportCandidates: string[];
}

export interface LiveEcologySummary {
  status: "running" | "passed" | "needs_review";
  mode: "dry-run" | "live";
  startedAt: string;
  finishedAt?: string;
  runRoot: string;
  mirrorRoot: string;
  groups: LiveEcologyGroupSummary[];
  registeredToolCount: number;
  inventoryFindings: LiveEcologyInventoryFinding[];
}

export async function runLiveEcology(rootDir: string, options: LiveEcologyOptions): Promise<LiveEcologySummary> {
  const timestamp = createTimestamp();
  const runRoot = path.resolve(rootDir, options.outputDir || await createDefaultRunRoot(rootDir, timestamp));
  await fs.mkdir(runRoot, { recursive: true });
  const mode = options.dryRun === true ? "dry-run" : "live";

  logLiveEcology(`start mode=${mode}`);
  logLiveEcology(`runRoot=${runRoot}`);

  const mirror = await createLiveEcologyMirror(rootDir, runRoot);
  logLiveEcology(`mirrorRoot=${mirror.mirrorRoot}`);
  logLiveEcology("prepare mirror");
  await prepareLiveEcologyMirror(mirror);
  logLiveEcology("load tool inventory");
  const toolNames = await loadRegisteredToolNames(mirror.mirrorRoot);
  const inventoryGroups = await loadLiveEcologyGroups(mirror.mirrorRoot);
  const inventoryFindings = diagnoseLiveEcologyInventory(toolNames, inventoryGroups);
  const groups = options.allTools === true
    ? enableAllTools(selectGroups(options.groupIds, inventoryGroups))
    : selectGroups(options.groupIds, inventoryGroups);
  const summary: LiveEcologySummary = {
    status: "running",
    mode,
    startedAt: new Date().toISOString(),
    runRoot,
    mirrorRoot: mirror.mirrorRoot,
    groups: [],
    registeredToolCount: toolNames.length,
    inventoryFindings,
  };

  await writeJson(path.join(runRoot, "summary.json"), summary);
  await writeJson(path.join(runRoot, "registered-tools.json"), toolNames);
  await writeJson(path.join(runRoot, "live-ecology-inventory.json"), inventoryGroups);
  await writeJson(path.join(runRoot, "inventory-findings.json"), inventoryFindings);
  if (inventoryFindings.length > 0) {
    logLiveEcology(`inventory needs review findings=${inventoryFindings.length}`);
    await writeJson(path.join(runRoot, "summary.json"), summary);
    summary.status = "needs_review";
    summary.finishedAt = new Date().toISOString();
    await writeJson(path.join(runRoot, "summary.json"), summary);
    return summary;
  }

  await captureCliFacts(mirror);

  for (const group of groups) {
    logLiveEcology(`group start ${group.id} expected=${getExpectedTools(group).length} skipped=${getSkippedTools(group).length}`);
    const result = options.dryRun === true
      ? await dryRunGroup(mirror, group, toolNames)
      : await runGroup(mirror, group, toolNames, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    summary.groups.push(result);
    await writeJson(path.join(runRoot, "summary.json"), summary);
    logGroupResult(result);
  }

  summary.status = summary.groups.some((group) => group.status !== "passed") ? "needs_review" : "passed";
  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(runRoot, "summary.json"), summary);
  logLiveEcology(`finish status=${summary.status}`);
  return summary;
}

async function createDefaultRunRoot(rootDir: string, timestamp: string): Promise<string> {
  const baseName = `live-ecology-test-${timestamp}`;
  for (let index = 0; index < 100; index += 1) {
    const name = index === 0 ? baseName : `${baseName}-${index + 1}`;
    try {
      await fs.mkdir(path.resolve(rootDir, name), { recursive: false });
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Could not allocate a unique live ecology run directory for ${baseName}.`);
}

async function dryRunGroup(
  mirror: LiveEcologyMirror,
  group: LiveEcologyGroup,
  toolNames: string[],
): Promise<LiveEcologyGroupSummary> {
  const groupDir = path.join(mirror.runRoot, group.id);
  const mirrorEvidenceDir = path.join(mirror.mirrorRoot, ".live-ecology", group.id);
  await fs.mkdir(groupDir, { recursive: true });
  await fs.mkdir(mirrorEvidenceDir, { recursive: true });

  const prompt = buildLiveEcologyPrompt(group, mirrorEvidenceDir, toolNames);
  const promptPath = path.join(groupDir, "prompt.txt");
  const outputPath = path.join(groupDir, "cli-output.txt");
  await fs.writeFile(promptPath, `${prompt}\n`, "utf8");
  await writeJson(path.join(groupDir, "dry-run.json"), {
    id: group.id,
    title: group.title,
    expectedTools: getExpectedTools(group),
    skippedTools: getSkippedTools(group),
    promptPath,
    outputPath,
  });
  logLiveEcology(`dry-run prepared ${group.id} prompt=${promptPath}`);

  return {
    id: group.id,
    title: group.title,
    mode: "dry-run",
    status: "passed",
    exitCode: 0,
    timedOut: false,
    sessionId: "",
    expectedTools: getExpectedTools(group),
    preparedTools: getExpectedTools(group),
    coveredTools: [],
    missingTools: [],
    failedTools: [],
    skippedTools: getSkippedTools(group),
    skipReasons: Object.fromEntries(group.tools.filter((tool) => !tool.enabled).map((tool) => [tool.name, tool.skipReason ?? "disabled"])),
    promptPath,
    outputPath,
    reportPath: path.join(mirrorEvidenceDir, group.reportFile),
    reportExists: false,
    reportCandidates: [],
  };
}

function selectGroups(groupIds: Set<string>, inventoryGroups: LiveEcologyGroup[]): LiveEcologyGroup[] {
  if (groupIds.size === 0) {
    return inventoryGroups;
  }
  const groups = inventoryGroups.filter((group) => groupIds.has(group.id));
  if (groups.length === 0) {
    throw new Error(`No live ecology test groups selected. Available: ${inventoryGroups.map((group) => group.id).join(", ")}`);
  }
  return groups;
}

function enableAllTools(groups: LiveEcologyGroup[]): LiveEcologyGroup[] {
  return groups.map((group) => ({
    ...group,
    tools: group.tools.map((tool) => ({
      name: tool.name,
      enabled: true,
    })),
    promptLines: group.promptLines.map((line) => line
      .replaceAll("for disabled tools, write skipped only and do not call them.", "all tools must be attempted in this run; do not write skipped.")
      .replaceAll("do not call disabled tools.", "all tools must be attempted in this run.")
      .replaceAll("Do not call disabled tools.", "All tools must be attempted in this run.")),
  }));
}

async function captureCliFacts(mirror: LiveEcologyMirror): Promise<void> {
  logLiveEcology("capture cli --version");
  await runNodeProcess(["dist/cli.js", "--version"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 30_000,
    capturePath: path.join(mirror.runRoot, "cli-version.txt"),
    streamOutput: true,
    streamLabel: "cli-version",
  });
  logLiveEcology("capture doctor runtime");
  await runNodeProcess(["dist/cli.js", "doctor", "runtime"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 60_000,
    capturePath: path.join(mirror.runRoot, "doctor-runtime.txt"),
    streamOutput: true,
    streamLabel: "doctor-runtime",
  });
  logLiveEcology("capture doctor observability");
  await runNodeProcess(["dist/cli.js", "doctor", "observability"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 60_000,
    capturePath: path.join(mirror.runRoot, "doctor-observability.txt"),
    streamOutput: true,
    streamLabel: "doctor-observability",
  });
}

async function runGroup(
  mirror: LiveEcologyMirror,
  group: LiveEcologyGroup,
  toolNames: string[],
  timeoutMs: number,
): Promise<LiveEcologyGroupSummary> {
  const groupDir = path.join(mirror.runRoot, group.id);
  const mirrorEvidenceDir = path.join(mirror.mirrorRoot, ".live-ecology", group.id);
  await fs.mkdir(groupDir, { recursive: true });
  await fs.mkdir(mirrorEvidenceDir, { recursive: true });

  const prompt = buildLiveEcologyPrompt(group, mirrorEvidenceDir, toolNames);
  const promptPath = path.join(groupDir, "prompt.txt");
  const outputPath = path.join(groupDir, "cli-output.txt");
  const sessionPath = path.join(groupDir, "session-id.txt");
  await fs.writeFile(promptPath, `${prompt}\n`, "utf8");

  const processResult = await runNodeProcess(
    ["node_modules/tsx/dist/cli.mjs", "tests/production-line/run-live-task.ts", promptPath, outputPath, sessionPath],
    {
      cwd: mirror.mirrorRoot,
      timeoutMs,
      capturePath: path.join(groupDir, "runner-output.txt"),
      streamOutput: true,
      streamLabel: group.id,
    },
  );
  const sessionId = (await fs.readFile(sessionPath, "utf8").catch(() => "")).trim();
  const sessionRecord = await readSessionRecord(sessionId, mirror.mirrorRoot);
  if (sessionRecord) {
    await writeJson(path.join(groupDir, "session-record.json"), sessionRecord);
  }

  const coveredTools = collectCoveredTools(sessionRecord);
  const expectedTools = getExpectedTools(group);
  const missingTools = expectedTools.filter((name) => !coveredTools.includes(name));
  const failedTools = collectFailedTools(sessionRecord);
  const skippedTools = getSkippedTools(group);
  const reportCheck = await findGroupReport(mirrorEvidenceDir, group.reportFile);
  const groupSummary: LiveEcologyGroupSummary = {
    id: group.id,
    title: group.title,
    mode: "live",
    status: processResult.exitCode === 0 && missingTools.length === 0 && failedTools.length === 0 ? "passed" : "needs_review",
    exitCode: processResult.exitCode,
    timedOut: processResult.timedOut,
    sessionId,
    expectedTools,
    preparedTools: expectedTools,
    coveredTools,
    missingTools,
    failedTools,
    skippedTools,
    skipReasons: Object.fromEntries(group.tools.filter((tool) => !tool.enabled).map((tool) => [tool.name, tool.skipReason ?? "disabled"])),
    promptPath,
    outputPath,
    reportPath: reportCheck.path,
    reportExists: reportCheck.exists,
    reportCandidates: reportCheck.candidates,
  };
  await writeJson(path.join(groupDir, "coverage.json"), groupSummary);
  return groupSummary;
}

interface GroupReportCheck {
  path: string;
  exists: boolean;
  candidates: string[];
}

async function findGroupReport(groupDir: string, preferredFile: string): Promise<GroupReportCheck> {
  const preferredPath = path.join(groupDir, preferredFile);
  if (await isNonEmptyFile(preferredPath)) {
    return { path: preferredPath, exists: true, candidates: [preferredPath] };
  }

  const entries = await fs.readdir(groupDir, { withFileTypes: true }).catch(() => []);
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const candidate = path.join(groupDir, entry.name);
    if (await isLikelyReportFile(candidate)) {
      candidates.push(candidate);
    }
  }

  candidates.sort();
  return { path: candidates[0] ?? preferredPath, exists: candidates.length > 0, candidates };
}

async function isLikelyReportFile(filePath: string): Promise<boolean> {
  const name = path.basename(filePath).toLowerCase();
  if (!name.includes("report") && !name.includes("报告")) {
    return false;
  }
  return isNonEmptyFile(filePath);
}

async function isNonEmptyFile(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stat) => stat.isFile() && stat.size > 0, () => false);
}

function logLiveEcology(message: string): void {
  console.log(`[live-ecology] ${message}`);
}

function logGroupResult(group: LiveEcologyGroupSummary): void {
  const progress = group.mode === "dry-run"
    ? `prepared=${group.preparedTools.length}`
    : `covered=${group.coveredTools.length}/${group.expectedTools.length} missing=${group.missingTools.length} failed=${group.failedTools.length}`;
  logLiveEcology(`group finish ${group.id} status=${group.status} ${progress}`);
  if (group.missingTools.length > 0) {
    logLiveEcology(`group missing ${group.id}: ${group.missingTools.join(", ")}`);
  }
  if (group.failedTools.length > 0) {
    logLiveEcology(`group failed ${group.id}: ${group.failedTools.map((item) => item.tool).join(", ")}`);
  }
  if (group.mode === "live" && !group.reportExists) {
    logLiveEcology(`group missing report ${group.id}: ${group.reportPath}`);
  }
  if (group.mode === "live" && group.reportExists) {
    logLiveEcology(`group report ${group.id}: ${group.reportPath}`);
  }
}
