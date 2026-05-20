import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { parseWorktreeList, runGit } from "../git.js";
import { readWorktreeState } from "../state.js";

export const worktreeListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_list",
      description: "List git worktrees for the current repository.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const result = await runGit(context.projectContext.rootDir, ["worktree", "list", "--porcelain"]);
    const state = await readWorktreeState(context.projectContext.stateRootDir);
    return jsonResult({
      ok: result.exitCode === 0,
      output: result.output,
      worktrees: parseWorktreeList(result.output).map((worktree) => ({
        ...worktree,
        kept: state.keptPaths.includes(worktree.path),
      })),
    });
  },
};
