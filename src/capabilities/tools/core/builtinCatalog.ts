import { applyPatchTool } from "../packages/files/applyPatchTool.js";
import { backgroundCheckTool } from "../packages/background/backgroundCheckTool.js";
import { backgroundRunTool } from "../packages/background/backgroundRunTool.js";
import { backgroundTerminateTool } from "../packages/background/backgroundTerminateTool.js";
import { broadcastTool } from "../packages/team/broadcastTool.js";
import { claimTaskTool } from "../packages/tasks/claimTaskTool.js";
import { coordinationPolicyTool } from "../packages/team/coordinationPolicyTool.js";
import { downloadUrlTool } from "../packages/network/downloadUrlTool.js";
import { editDocxTool } from "../packages/documents/editDocxTool.js";
import { editFileTool } from "../packages/files/editFileTool.js";
import { findFilesTool } from "../packages/files/findFilesTool.js";
import { idleTool } from "../packages/team/idleTool.js";
import { httpProbeTool } from "../packages/network/httpProbeTool.js";
import { httpRequestTool } from "../packages/network/httpRequestTool.js";
import { httpSessionTool } from "../packages/network/httpSessionTool.js";
import { httpSuiteTool } from "../packages/network/httpSuiteTool.js";
import { changeRecordReadTool } from "../packages/history/changeRecordReadTool.js";
import { listFilesTool } from "../packages/files/listFilesTool.js";
import { listTeammatesTool } from "../packages/team/listTeammatesTool.js";
import { loadSkillTool } from "../packages/skills/loadSkillTool.js";
import { mineruDocReadTool } from "../packages/documents/mineruDocReadTool.js";
import { mineruImageReadTool } from "../packages/documents/mineruImageReadTool.js";
import { mineruPdfReadTool } from "../packages/documents/mineruPdfReadTool.js";
import { mineruPptReadTool } from "../packages/documents/mineruPptReadTool.js";
import { networkTraceTool } from "../packages/network/networkTraceTool.js";
import { openapiInspectTool } from "../packages/network/openapiInspectTool.js";
import { openapiLintTool } from "../packages/network/openapiLintTool.js";
import { planApprovalTool } from "../packages/team/planApprovalTool.js";
import { readDocxTool } from "../packages/documents/readDocxTool.js";
import { readFileTool } from "../packages/files/readFileTool.js";
import { readInboxTool } from "../packages/team/readInboxTool.js";
import { readSpreadsheetTool } from "../packages/documents/readSpreadsheetTool.js";
import { runtimeEventSearchTool } from "../packages/history/runtimeEventSearchTool.js";
import { runShellTool } from "../packages/shell/runShellTool.js";
import { searchFilesTool } from "../packages/files/searchFilesTool.js";
import { sendMessageTool } from "../packages/team/sendMessageTool.js";
import { sessionFinalOutputTool } from "../packages/history/sessionFinalOutputTool.js";
import { sessionListTool } from "../packages/history/sessionListTool.js";
import { sessionReadTool } from "../packages/history/sessionReadTool.js";
import { sessionSearchTool } from "../packages/history/sessionSearchTool.js";
import { shutdownRequestTool } from "../packages/team/shutdownRequestTool.js";
import { shutdownResponseTool } from "../packages/team/shutdownResponseTool.js";
import { spawnTeammateTool } from "../packages/team/spawnTeammateTool.js";
import { taskTool } from "../packages/tasks/taskTool.js";
import { todoWriteTool } from "../packages/tasks/todoWriteTool.js";
import { taskCreateTool } from "../packages/tasks/taskCreateTool.js";
import { taskGetTool } from "../packages/tasks/taskGetTool.js";
import { taskListTool } from "../packages/tasks/taskListTool.js";
import { taskUpdateTool } from "../packages/tasks/taskUpdateTool.js";
import { toolArtifactReadTool } from "../packages/history/toolArtifactReadTool.js";
import { undoLastChangeTool } from "../packages/files/undoLastChangeTool.js";
import { worktreeCreateTool } from "../packages/worktrees/worktreeCreateTool.js";
import { worktreeEventsTool } from "../packages/worktrees/worktreeEventsTool.js";
import { worktreeGetTool } from "../packages/worktrees/worktreeGetTool.js";
import { worktreeKeepTool } from "../packages/worktrees/worktreeKeepTool.js";
import { worktreeListTool } from "../packages/worktrees/worktreeListTool.js";
import { worktreeRemoveTool } from "../packages/worktrees/worktreeRemoveTool.js";
import { writeDocxTool } from "../packages/documents/writeDocxTool.js";
import { writeFileTool } from "../packages/files/writeFileTool.js";
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
  defineBuiltinTool(listFilesTool, readTool("filesystem", { secondaryInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(findFilesTool, readTool("filesystem", { secondaryInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(readFileTool, readTool("filesystem", { secondaryInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  defineBuiltinTool(searchFilesTool, readTool("filesystem", { secondaryInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
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
  defineBuiltinTool(sessionListTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(sessionReadTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(sessionSearchTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(sessionFinalOutputTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(toolArtifactReadTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(runtimeEventSearchTool, readTool("history", { concurrencySafe: true })),
  defineBuiltinTool(changeRecordReadTool, readTool("history", { concurrencySafe: true })),
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
  defineBuiltinTool(backgroundRunTool, writeTool("background", { risk: "high", changeSignal: "none", secondaryInWorkflows: WEB_WORKFLOWS })),
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
  defineBuiltinTool(runShellTool, writeTool("shell", { risk: "high", changeSignal: "none", verificationSignal: "optional", secondaryInWorkflows: WEB_WORKFLOWS })),
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
    secondaryInWorkflows: [...governance.secondaryInWorkflows],
  };
}
