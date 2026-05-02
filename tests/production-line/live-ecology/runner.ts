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
import { readToolLedgerReport, type LiveEcologyToolReportEntry } from "./toolLedger.ts";
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
  reportProblems: string[];
  skippedTools: string[];
  skipReasons: Record<string, string>;
  promptPath: string;
  outputPath: string;
  cases: LiveEcologyToolCaseSummary[];
}

export interface LiveEcologyToolCaseSummary {
  tool: string;
  status: "passed" | "needs_review";
  exitCode: number;
  timedOut: boolean;
  sessionId: string;
  coveredTools: string[];
  failedTools: FailedToolSummary[];
  ledgerEntries: LiveEcologyToolReportEntry[];
  reportProblems: string[];
  promptPath: string;
  outputPath: string;
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
  const runRoot = path.resolve(rootDir, options.outputDir || `live-ecology-test-${timestamp}`);
  await fs.mkdir(runRoot, { recursive: true });

  const mirror = await createLiveEcologyMirror(rootDir, runRoot);
  await prepareLiveEcologyMirror(mirror);
  const toolNames = await loadRegisteredToolNames(mirror.mirrorRoot);
  const inventoryGroups = await loadLiveEcologyGroups(mirror.mirrorRoot);
  const inventoryFindings = diagnoseLiveEcologyInventory(toolNames, inventoryGroups);
  const groups = options.allTools === true
    ? enableAllTools(selectGroups(options.groupIds, inventoryGroups))
    : selectGroups(options.groupIds, inventoryGroups);
  const summary: LiveEcologySummary = {
    status: "running",
    mode: options.dryRun === true ? "dry-run" : "live",
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
    await writeJson(path.join(runRoot, "summary.json"), summary);
    summary.status = "needs_review";
    summary.finishedAt = new Date().toISOString();
    await writeJson(path.join(runRoot, "summary.json"), summary);
    return summary;
  }

  await captureCliFacts(mirror);

  for (const group of groups) {
    const result = options.dryRun === true
      ? await dryRunGroup(mirror, group, toolNames)
      : await runGroup(mirror, group, toolNames, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    summary.groups.push(result);
    await writeJson(path.join(runRoot, "summary.json"), summary);
  }

  summary.status = summary.groups.some((group) => group.status !== "passed") ? "needs_review" : "passed";
  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(runRoot, "summary.json"), summary);
  return summary;
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

  const expectedTools = getExpectedTools(group);
  const cases: LiveEcologyToolCaseSummary[] = [];
  for (const tool of expectedTools) {
    const caseDir = path.join(groupDir, tool);
    const caseEvidenceDir = path.join(mirrorEvidenceDir, tool);
    await fs.mkdir(caseDir, { recursive: true });
    await fs.mkdir(caseEvidenceDir, { recursive: true });
    const prompt = buildLiveEcologyPrompt(group, caseEvidenceDir, toolNames, { targetTool: tool });
    const promptPath = path.join(caseDir, "prompt.txt");
    const outputPath = path.join(caseDir, "cli-output.txt");
    await fs.writeFile(promptPath, `${prompt}\n`, "utf8");
    const caseSummary: LiveEcologyToolCaseSummary = {
      tool,
      status: "passed",
      exitCode: 0,
      timedOut: false,
      sessionId: "",
      coveredTools: [],
      failedTools: [],
      ledgerEntries: [],
      reportProblems: [],
      promptPath,
      outputPath,
    };
    cases.push(caseSummary);
    await writeJson(path.join(caseDir, "dry-run.json"), caseSummary);
  }

  const promptPath = path.join(groupDir, "machine-plan.json");
  const outputPath = path.join(groupDir, "cli-output.txt");
  await writeJson(promptPath, {
    id: group.id,
    title: group.title,
    expectedTools,
    skippedTools: getSkippedTools(group),
    cases: cases.map((item) => ({
      tool: item.tool,
      promptPath: item.promptPath,
      outputPath: item.outputPath,
    })),
  });

  return {
    id: group.id,
    title: group.title,
    mode: "dry-run",
    status: "passed",
    exitCode: 0,
    timedOut: false,
    sessionId: "",
    expectedTools,
    preparedTools: expectedTools,
    coveredTools: [],
    missingTools: [],
    failedTools: [],
    reportProblems: [],
    skippedTools: getSkippedTools(group),
    skipReasons: Object.fromEntries(group.tools.filter((tool) => !tool.enabled).map((tool) => [tool.name, tool.skipReason ?? "disabled"])),
    promptPath,
    outputPath,
    cases,
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
  await runNodeProcess(["dist/cli.js", "--version"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 30_000,
    capturePath: path.join(mirror.runRoot, "cli-version.txt"),
  });
  await runNodeProcess(["dist/cli.js", "doctor", "runtime"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 60_000,
    capturePath: path.join(mirror.runRoot, "doctor-runtime.txt"),
  });
  await runNodeProcess(["dist/cli.js", "doctor", "observability"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 60_000,
    capturePath: path.join(mirror.runRoot, "doctor-observability.txt"),
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

  const expectedTools = getExpectedTools(group);
  const cases: LiveEcologyToolCaseSummary[] = [];
  for (const tool of expectedTools) {
    cases.push(await runToolCase({
      mirror,
      group,
      toolNames,
      timeoutMs,
      tool,
      groupDir,
      mirrorEvidenceDir,
    }));
  }

  const coveredTools = [...new Set(cases.flatMap((item) => item.coveredTools))].sort();
  const missingTools = expectedTools.filter((name) => !coveredTools.includes(name));
  const failedTools = cases.flatMap((item) => item.failedTools);
  const reportProblems = cases.flatMap((item) => item.reportProblems);
  const skippedTools = getSkippedTools(group);
  const groupSummary: LiveEcologyGroupSummary = {
    id: group.id,
    title: group.title,
    mode: "live",
    status: cases.every((item) => item.status === "passed") && missingTools.length === 0 && failedTools.length === 0 && reportProblems.length === 0
      ? "passed"
      : "needs_review",
    exitCode: cases.every((item) => item.exitCode === 0) ? 0 : 1,
    timedOut: cases.some((item) => item.timedOut),
    sessionId: cases.map((item) => item.sessionId).filter(Boolean).join(","),
    expectedTools,
    preparedTools: expectedTools,
    coveredTools,
    missingTools,
    failedTools,
    reportProblems,
    skippedTools,
    skipReasons: Object.fromEntries(group.tools.filter((tool) => !tool.enabled).map((tool) => [tool.name, tool.skipReason ?? "disabled"])),
    promptPath: path.join(groupDir, "machine-plan.json"),
    outputPath: path.join(groupDir, "cli-output.txt"),
    cases,
  };
  await writeJson(groupSummary.promptPath, {
    id: group.id,
    title: group.title,
    expectedTools,
    skippedTools,
    cases: cases.map((item) => ({
      tool: item.tool,
      status: item.status,
      promptPath: item.promptPath,
      outputPath: item.outputPath,
    })),
  });
  await writeJson(path.join(groupDir, "coverage.json"), groupSummary);
  return groupSummary;
}

async function runToolCase(input: {
  mirror: LiveEcologyMirror;
  group: LiveEcologyGroup;
  toolNames: string[];
  timeoutMs: number;
  tool: string;
  groupDir: string;
  mirrorEvidenceDir: string;
}): Promise<LiveEcologyToolCaseSummary> {
  const caseDir = path.join(input.groupDir, input.tool);
  const caseEvidenceDir = path.join(input.mirrorEvidenceDir, input.tool);
  await fs.mkdir(caseDir, { recursive: true });
  await fs.mkdir(caseEvidenceDir, { recursive: true });

  const prompt = buildLiveEcologyPrompt(input.group, caseEvidenceDir, input.toolNames, {
    targetTool: input.tool,
  });
  const promptPath = path.join(caseDir, "prompt.txt");
  const outputPath = path.join(caseDir, "cli-output.txt");
  const sessionPath = path.join(caseDir, "session-id.txt");
  await fs.writeFile(promptPath, `${prompt}\n`, "utf8");

  const processResult = await runNodeProcess(
    ["node_modules/tsx/dist/cli.mjs", "tests/production-line/run-live-task.ts", promptPath, outputPath, sessionPath],
    {
      cwd: input.mirror.mirrorRoot,
      timeoutMs: input.timeoutMs,
      capturePath: path.join(caseDir, "runner-output.txt"),
    },
  );
  const sessionId = (await fs.readFile(sessionPath, "utf8").catch(() => "")).trim();
  const sessionRecord = await readSessionRecord(sessionId, input.mirror.mirrorRoot);
  if (sessionRecord) {
    await writeJson(path.join(caseDir, "session-record.json"), sessionRecord);
  }

  const coveredTools = collectCoveredTools(sessionRecord);
  const toolReport = await readToolLedgerReport(caseEvidenceDir, [input.tool]);
  const failedTools = collectFailedTools(sessionRecord);
  const reportProblems = [
    ...toolReport.problems,
    ...toolReport.unreportedTools.map((tool) => `Tool not reported in ledger: ${tool}`),
  ];
  const caseSummary: LiveEcologyToolCaseSummary = {
    tool: input.tool,
    status: processResult.exitCode === 0 &&
      coveredTools.includes(input.tool) &&
      failedTools.length === 0 &&
      toolReport.unreportedTools.length === 0 &&
      toolReport.problems.length === 0
      ? "passed"
      : "needs_review",
    exitCode: processResult.exitCode,
    timedOut: processResult.timedOut,
    sessionId,
    coveredTools,
    failedTools,
    ledgerEntries: toolReport.entries,
    reportProblems,
    promptPath,
    outputPath,
  };
  await writeJson(path.join(caseDir, "coverage.json"), caseSummary);
  return caseSummary;
}
