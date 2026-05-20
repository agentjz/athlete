import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { parseWorktreeList, runGit } from "../git.js";
import { readWorktreeState } from "../state.js";

export const worktreeGetTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_get",
      description: "Get facts for one git worktree path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const result = await runGit(context.projectContext.rootDir, ["worktree", "list", "--porcelain"]);
    const state = await readWorktreeState(context.projectContext.stateRootDir);
    const worktree = parseWorktreeList(result.output).find((entry) => entry.path === targetPath) ?? { path: targetPath };
    return jsonResult({
      ok: result.exitCode === 0,
      worktree: {
        ...worktree,
        kept: state.keptPaths.includes(targetPath),
      },
    });
  },
};
