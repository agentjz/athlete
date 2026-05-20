import { parseArgs, readBoolean, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { readWorktreeState, recordWorktreeEvent, writeWorktreeState } from "../state.js";

export const worktreeKeepTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_keep",
      description: "Mark or unmark a worktree path as kept for later inspection.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          kept: { type: "boolean" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const kept = readBoolean(args.kept, true);
    const state = await readWorktreeState(context.projectContext.stateRootDir);
    state.keptPaths = kept
      ? [...new Set([...state.keptPaths, targetPath])]
      : state.keptPaths.filter((entry) => entry !== targetPath);
    const statePath = await writeWorktreeState(context.projectContext.stateRootDir, state);
    await recordWorktreeEvent(context.projectContext.stateRootDir, {
      event: kept ? "keep" : "unkeep",
      path: targetPath,
    });
    return changedJsonResult({ ok: true, path: targetPath, kept }, [statePath]);
  },
};
