import type { AgentMode } from "../types.js";
import { applyPatchTool } from "./files/applyPatchTool.js";
import { backgroundCheckTool } from "./background/backgroundCheckTool.js";
import { backgroundRunTool } from "./background/backgroundRunTool.js";
import { broadcastTool } from "./team/broadcastTool.js";
import { claimTaskTool } from "./tasks/claimTaskTool.js";
import { coordinationPolicyTool } from "./team/coordinationPolicyTool.js";
import { downloadUrlTool } from "./network/downloadUrlTool.js";
import { editDocxTool } from "./documents/editDocxTool.js";
import { editFileTool } from "./files/editFileTool.js";
import { idleTool } from "./team/idleTool.js";
import { httpProbeTool } from "./network/httpProbeTool.js";
import { listFilesTool } from "./files/listFilesTool.js";
import { listTeammatesTool } from "./team/listTeammatesTool.js";
import { loadSkillTool } from "./skills/loadSkillTool.js";
import { mineruDocReadTool } from "./documents/mineruDocReadTool.js";
import { mineruImageReadTool } from "./documents/mineruImageReadTool.js";
import { mineruPdfReadTool } from "./documents/mineruPdfReadTool.js";
import { mineruPptReadTool } from "./documents/mineruPptReadTool.js";
import { planApprovalTool } from "./team/planApprovalTool.js";
import { readDocxTool } from "./documents/readDocxTool.js";
import { readFileTool } from "./files/readFileTool.js";
import { readInboxTool } from "./team/readInboxTool.js";
import { readSpreadsheetTool } from "./documents/readSpreadsheetTool.js";
import { runShellTool } from "./shell/runShellTool.js";
import { searchFilesTool } from "./files/searchFilesTool.js";
import { sendMessageTool } from "./team/sendMessageTool.js";
import { shutdownRequestTool } from "./team/shutdownRequestTool.js";
import { shutdownResponseTool } from "./team/shutdownResponseTool.js";
import { spawnTeammateTool } from "./team/spawnTeammateTool.js";
import { taskTool } from "./tasks/taskTool.js";
import { todoWriteTool } from "./tasks/todoWriteTool.js";
import { taskCreateTool } from "./tasks/taskCreateTool.js";
import { taskGetTool } from "./tasks/taskGetTool.js";
import { taskListTool } from "./tasks/taskListTool.js";
import { taskUpdateTool } from "./tasks/taskUpdateTool.js";
import { undoLastChangeTool } from "./files/undoLastChangeTool.js";
import { worktreeCreateTool } from "./worktrees/worktreeCreateTool.js";
import { worktreeEventsTool } from "./worktrees/worktreeEventsTool.js";
import { worktreeGetTool } from "./worktrees/worktreeGetTool.js";
import { worktreeKeepTool } from "./worktrees/worktreeKeepTool.js";
import { worktreeListTool } from "./worktrees/worktreeListTool.js";
import { worktreeRemoveTool } from "./worktrees/worktreeRemoveTool.js";
import { writeDocxTool } from "./documents/writeDocxTool.js";
import { writeFileTool } from "./files/writeFileTool.js";
import {
  WEB_WORKFLOWS,
  documentReadTool,
  readTool,
  stateTool,
  writeTool,
} from "./governancePresets.js";
import type { RegisteredTool, ToolGovernance } from "./types.js";

interface BuiltinCatalogEntry {
  modes: readonly AgentMode[];
  tool: RegisteredTool;
}

const ALL_MODES = ["agent", "read-only"] as const;

const BUILTIN_TOOL_CATALOG: readonly BuiltinCatalogEntry[] = [
  defineBuiltinTool(todoWriteTool, ALL_MODES, stateTool("task")),
  defineBuiltinTool(taskTool, ALL_MODES, stateTool("task", { risk: "medium", changeSignal: "optional", verificationSignal: "optional" })),
  defineBuiltinTool(listFilesTool, ALL_MODES, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(readFileTool, ALL_MODES, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(searchFilesTool, ALL_MODES, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(mineruPdfReadTool, ALL_MODES, documentReadTool("pdf")),
  defineBuiltinTool(mineruImageReadTool, ALL_MODES, documentReadTool("image")),
  defineBuiltinTool(mineruDocReadTool, ALL_MODES, documentReadTool("doc")),
  defineBuiltinTool(mineruPptReadTool, ALL_MODES, documentReadTool("ppt")),
  defineBuiltinTool(readDocxTool, ALL_MODES, documentReadTool("doc")),
  defineBuiltinTool(readSpreadsheetTool, ALL_MODES, documentReadTool("spreadsheet")),
  defineBuiltinTool(httpProbeTool, ALL_MODES, readTool("external", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(loadSkillTool, ALL_MODES, stateTool("task")),
  defineBuiltinTool(worktreeListTool, ALL_MODES, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(worktreeGetTool, ALL_MODES, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(worktreeEventsTool, ALL_MODES, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(taskCreateTool, ["agent"], stateTool("task")),
  defineBuiltinTool(coordinationPolicyTool, ["agent"], stateTool("team", { risk: "medium" })),
  defineBuiltinTool(taskGetTool, ["agent"], readTool("task", { concurrencySafe: true })),
  defineBuiltinTool(taskListTool, ["agent"], readTool("task", { concurrencySafe: true })),
  defineBuiltinTool(taskUpdateTool, ["agent"], stateTool("task")),
  defineBuiltinTool(claimTaskTool, ["agent"], stateTool("task")),
  defineBuiltinTool(worktreeCreateTool, ["agent"], stateTool("worktree", { risk: "medium" })),
  defineBuiltinTool(worktreeKeepTool, ["agent"], stateTool("worktree", { risk: "medium" })),
  defineBuiltinTool(worktreeRemoveTool, ["agent"], stateTool("worktree", { risk: "high", destructive: true })),
  defineBuiltinTool(backgroundRunTool, ["agent"], writeTool("background", { risk: "high", changeSignal: "none", fallbackOnlyInWorkflows: WEB_WORKFLOWS })),
  defineBuiltinTool(backgroundCheckTool, ["agent"], readTool("background", { concurrencySafe: true })),
  defineBuiltinTool(spawnTeammateTool, ["agent"], stateTool("team", { risk: "high" })),
  defineBuiltinTool(listTeammatesTool, ["agent"], readTool("team", { concurrencySafe: true })),
  defineBuiltinTool(sendMessageTool, ["agent"], stateTool("messaging", { risk: "medium" })),
  defineBuiltinTool(readInboxTool, ["agent"], readTool("team", { concurrencySafe: true })),
  defineBuiltinTool(broadcastTool, ["agent"], stateTool("messaging", { risk: "medium" })),
  defineBuiltinTool(shutdownRequestTool, ["agent"], stateTool("team", { risk: "high", destructive: true })),
  defineBuiltinTool(shutdownResponseTool, ["agent"], stateTool("team", { risk: "high" })),
  defineBuiltinTool(planApprovalTool, ["agent"], stateTool("team", { risk: "medium" })),
  defineBuiltinTool(idleTool, ["agent"], stateTool("task")),
  defineBuiltinTool(writeFileTool, ["agent"], writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(writeDocxTool, ["agent"], writeTool("document", { changeSignal: "required" })),
  defineBuiltinTool(editDocxTool, ["agent"], writeTool("document", { changeSignal: "required" })),
  defineBuiltinTool(editFileTool, ["agent"], writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(applyPatchTool, ["agent"], writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(undoLastChangeTool, ["agent"], writeTool("filesystem", { risk: "high", destructive: true, changeSignal: "required" })),
  defineBuiltinTool(downloadUrlTool, ["agent"], writeTool("external", { changeSignal: "required" })),
  defineBuiltinTool(runShellTool, ["agent"], writeTool("shell", { risk: "high", changeSignal: "none", verificationSignal: "optional", fallbackOnlyInWorkflows: WEB_WORKFLOWS })),
] as const;

const BUILTIN_GOVERNANCE_BY_NAME = new Map(
  BUILTIN_TOOL_CATALOG.map((entry) => [entry.tool.definition.function.name, cloneGovernance(entry.tool.governance as ToolGovernance)]),
);

export function getBuiltinToolsForMode(mode: AgentMode): RegisteredTool[] {
  return BUILTIN_TOOL_CATALOG
    .filter((entry) => entry.modes.includes(mode))
    .map((entry) => entry.tool);
}

export function getBuiltinToolGovernance(name: string): ToolGovernance | null {
  const governance = BUILTIN_GOVERNANCE_BY_NAME.get(name);
  return governance ? cloneGovernance(governance) : null;
}

function defineBuiltinTool(
  tool: RegisteredTool,
  modes: readonly AgentMode[],
  governance: ToolGovernance,
): BuiltinCatalogEntry {
  return {
    modes: [...modes],
    tool: {
      ...tool,
      governance: cloneGovernance(governance),
      origin: {
        kind: "builtin",
        sourceId: "builtin:catalog",
      },
    },
  };
}

function cloneGovernance(governance: ToolGovernance): ToolGovernance {
  return {
    ...governance,
    preferredWorkflows: [...governance.preferredWorkflows],
    fallbackOnlyInWorkflows: [...governance.fallbackOnlyInWorkflows],
  };
}
