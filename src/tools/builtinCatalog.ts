import { applyPatchTool } from "./files/applyPatchTool.js";
import { backgroundCheckTool } from "./background/backgroundCheckTool.js";
import { backgroundRunTool } from "./background/backgroundRunTool.js";
import { backgroundTerminateTool } from "./background/backgroundTerminateTool.js";
import { broadcastTool } from "./team/broadcastTool.js";
import { claimTaskTool } from "./tasks/claimTaskTool.js";
import { coordinationPolicyTool } from "./team/coordinationPolicyTool.js";
import { downloadUrlTool } from "./network/downloadUrlTool.js";
import { editDocxTool } from "./documents/editDocxTool.js";
import { editFileTool } from "./files/editFileTool.js";
import { findFilesTool } from "./files/findFilesTool.js";
import { idleTool } from "./team/idleTool.js";
import { httpProbeTool } from "./network/httpProbeTool.js";
import { httpRequestTool } from "./network/httpRequestTool.js";
import { httpSessionTool } from "./network/httpSessionTool.js";
import { httpSuiteTool } from "./network/httpSuiteTool.js";
import { listFilesTool } from "./files/listFilesTool.js";
import { listTeammatesTool } from "./team/listTeammatesTool.js";
import { loadSkillTool } from "./skills/loadSkillTool.js";
import { mineruDocReadTool } from "./documents/mineruDocReadTool.js";
import { mineruImageReadTool } from "./documents/mineruImageReadTool.js";
import { mineruPdfReadTool } from "./documents/mineruPdfReadTool.js";
import { mineruPptReadTool } from "./documents/mineruPptReadTool.js";
import { networkTraceTool } from "./network/networkTraceTool.js";
import { openapiInspectTool } from "./network/openapiInspectTool.js";
import { openapiLintTool } from "./network/openapiLintTool.js";
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

const BUILTIN_TOOL_CATALOG: readonly RegisteredTool[] = [
  defineBuiltinTool(todoWriteTool, stateTool("task")),
  defineBuiltinTool(taskTool, stateTool("task", { risk: "medium", changeSignal: "optional", verificationSignal: "optional" })),
  defineBuiltinTool(listFilesTool, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(findFilesTool, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(readFileTool, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(searchFilesTool, readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(mineruPdfReadTool, documentReadTool("pdf")),
  defineBuiltinTool(mineruImageReadTool, documentReadTool("image")),
  defineBuiltinTool(mineruDocReadTool, documentReadTool("doc")),
  defineBuiltinTool(mineruPptReadTool, documentReadTool("ppt")),
  defineBuiltinTool(readDocxTool, documentReadTool("doc")),
  defineBuiltinTool(readSpreadsheetTool, documentReadTool("spreadsheet")),
  defineBuiltinTool(httpProbeTool, readTool("external", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(httpRequestTool, readTool("external", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(httpSessionTool, stateTool("external", { risk: "medium" })),
  defineBuiltinTool(httpSuiteTool, readTool("external", { verificationSignal: "optional" })),
  defineBuiltinTool(networkTraceTool, writeTool("external", { changeSignal: "required", verificationSignal: "optional" })),
  defineBuiltinTool(openapiInspectTool, readTool("external", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(openapiLintTool, readTool("external", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(loadSkillTool, stateTool("task")),
  defineBuiltinTool(worktreeListTool, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(worktreeGetTool, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(worktreeEventsTool, readTool("worktree", { concurrencySafe: true })),
  defineBuiltinTool(taskCreateTool, stateTool("task")),
  defineBuiltinTool(coordinationPolicyTool, stateTool("team", { risk: "medium" })),
  defineBuiltinTool(taskGetTool, readTool("task", { concurrencySafe: true })),
  defineBuiltinTool(taskListTool, readTool("task", { concurrencySafe: true })),
  defineBuiltinTool(taskUpdateTool, stateTool("task")),
  defineBuiltinTool(claimTaskTool, stateTool("task")),
  defineBuiltinTool(worktreeCreateTool, stateTool("worktree", { risk: "medium" })),
  defineBuiltinTool(worktreeKeepTool, stateTool("worktree", { risk: "medium" })),
  defineBuiltinTool(worktreeRemoveTool, stateTool("worktree", { risk: "high", destructive: true })),
  defineBuiltinTool(backgroundRunTool, writeTool("background", { risk: "high", changeSignal: "none", fallbackOnlyInWorkflows: WEB_WORKFLOWS })),
  defineBuiltinTool(backgroundCheckTool, readTool("background", { concurrencySafe: true, verificationSignal: "optional" })),
  defineBuiltinTool(backgroundTerminateTool, stateTool("background", { risk: "high", destructive: true })),
  defineBuiltinTool(spawnTeammateTool, stateTool("team", { risk: "high" })),
  defineBuiltinTool(listTeammatesTool, readTool("team", { concurrencySafe: true })),
  defineBuiltinTool(sendMessageTool, stateTool("messaging", { risk: "medium" })),
  defineBuiltinTool(readInboxTool, readTool("team", { concurrencySafe: true })),
  defineBuiltinTool(broadcastTool, stateTool("messaging", { risk: "medium" })),
  defineBuiltinTool(shutdownRequestTool, stateTool("team", { risk: "high", destructive: true })),
  defineBuiltinTool(shutdownResponseTool, stateTool("team", { risk: "high" })),
  defineBuiltinTool(planApprovalTool, stateTool("team", { risk: "medium" })),
  defineBuiltinTool(idleTool, stateTool("task")),
  defineBuiltinTool(writeFileTool, writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(writeDocxTool, writeTool("document", { changeSignal: "required" })),
  defineBuiltinTool(editDocxTool, writeTool("document", { changeSignal: "required" })),
  defineBuiltinTool(editFileTool, writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(applyPatchTool, writeTool("filesystem", { changeSignal: "required" })),
  defineBuiltinTool(undoLastChangeTool, writeTool("filesystem", { risk: "high", destructive: true, changeSignal: "required" })),
  defineBuiltinTool(downloadUrlTool, writeTool("external", { changeSignal: "required" })),
  defineBuiltinTool(runShellTool, writeTool("shell", { risk: "high", changeSignal: "none", verificationSignal: "optional", fallbackOnlyInWorkflows: WEB_WORKFLOWS })),
] as const;

const BUILTIN_GOVERNANCE_BY_NAME = new Map(
  BUILTIN_TOOL_CATALOG.map((tool) => [tool.definition.function.name, cloneGovernance(tool.governance as ToolGovernance)]),
);

export function getBuiltinTools(): RegisteredTool[] {
  return [...BUILTIN_TOOL_CATALOG];
}

export function getBuiltinToolGovernance(name: string): ToolGovernance | null {
  const governance = BUILTIN_GOVERNANCE_BY_NAME.get(name);
  return governance ? cloneGovernance(governance) : null;
}

function defineBuiltinTool(
  tool: RegisteredTool,
  governance: ToolGovernance,
): RegisteredTool {
  return {
    ...tool,
    governance: cloneGovernance(governance),
    origin: {
      kind: "builtin",
      sourceId: "builtin:catalog",
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
