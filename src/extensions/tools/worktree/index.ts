import { worktreeCreateTool } from "./tools/worktreeCreate.js";
import { worktreeEventsTool } from "./tools/worktreeEvents.js";
import { worktreeGetTool } from "./tools/worktreeGet.js";
import { worktreeKeepTool } from "./tools/worktreeKeep.js";
import { worktreeListTool } from "./tools/worktreeList.js";
import { worktreeRemoveTool } from "./tools/worktreeRemove.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createWorktreeTools(): RegisteredTool[] {
  return [
    worktreeCreateTool,
    worktreeEventsTool,
    worktreeGetTool,
    worktreeKeepTool,
    worktreeListTool,
    worktreeRemoveTool,
  ];
}
