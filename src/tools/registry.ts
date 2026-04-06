import { applyPatchTool } from "./files/applyPatchTool.js";
import { backgroundCheckTool } from "./background/backgroundCheckTool.js";
import { backgroundRunTool } from "./background/backgroundRunTool.js";
import { broadcastTool } from "./team/broadcastTool.js";
import { claimTaskTool } from "./tasks/claimTaskTool.js";
import { coordinationPolicyTool } from "./team/coordinationPolicyTool.js";
import { editDocxTool } from "./documents/editDocxTool.js";
import { editFileTool } from "./files/editFileTool.js";
import { idleTool } from "./team/idleTool.js";
import { listFilesTool } from "./files/listFilesTool.js";
import { listTeammatesTool } from "./team/listTeammatesTool.js";
import { loadSkillTool } from "./skills/loadSkillTool.js";
import { planApprovalTool } from "./team/planApprovalTool.js";
import { readDocxTool } from "./documents/readDocxTool.js";
import { readPdfTool } from "./documents/readPdfTool.js";
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
import { register } from "./shared.js";
import type { RegisteredTool, ToolRegistry, ToolRegistryOptions } from "./types.js";
import type { AgentMode } from "../types.js";
import { writeDocxTool } from "./documents/writeDocxTool.js";
import { writeFileTool } from "./files/writeFileTool.js";
import { sortRegisteredToolsForExposure } from "./order.js";

const READ_ONLY_TOOLS: readonly RegisteredTool[] = [
  todoWriteTool,
  taskTool,
  listFilesTool,
  readFileTool,
  readPdfTool,
  readDocxTool,
  readSpreadsheetTool,
  searchFilesTool,
  loadSkillTool,
  worktreeListTool,
  worktreeGetTool,
  worktreeEventsTool,
] as const;

const AGENT_TOOLS: readonly RegisteredTool[] = [
  ...READ_ONLY_TOOLS,
  taskCreateTool,
  coordinationPolicyTool,
  taskGetTool,
  taskListTool,
  taskUpdateTool,
  claimTaskTool,
  worktreeCreateTool,
  worktreeKeepTool,
  worktreeRemoveTool,
  backgroundRunTool,
  backgroundCheckTool,
  spawnTeammateTool,
  listTeammatesTool,
  sendMessageTool,
  readInboxTool,
  broadcastTool,
  shutdownRequestTool,
  shutdownResponseTool,
  planApprovalTool,
  idleTool,
  writeFileTool,
  writeDocxTool,
  editDocxTool,
  editFileTool,
  applyPatchTool,
  undoLastChangeTool,
  runShellTool,
] as const;

export function createToolRegistry(mode: AgentMode, options: ToolRegistryOptions = {}): ToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  for (const tool of selectTools(mode, options)) {
    register(tools, tool);
  }

  return {
    definitions: [...tools.values()].map((tool) => tool.definition),
    async execute(name, rawArgs, context) {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return tool.execute(rawArgs, context);
    },
    async close() {
      return;
    },
  };
}

function selectTools(mode: AgentMode, options: ToolRegistryOptions): RegisteredTool[] {
  const availableTools = mode === "agent" ? AGENT_TOOLS : READ_ONLY_TOOLS;
  const onlyNames = options.onlyNames ? new Set(options.onlyNames) : null;
  const excludeNames = new Set(options.excludeNames ?? []);

  return sortRegisteredToolsForExposure(
    [...availableTools, ...(options.includeTools ?? [])].filter((tool) => {
      const name = tool.definition.function.name;
      if (onlyNames && !onlyNames.has(name)) {
        return false;
      }

      return !excludeNames.has(name);
    }),
  );
}
