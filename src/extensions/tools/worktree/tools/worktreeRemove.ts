import { parseArgs, readBoolean, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { runGit } from "../git.js";
import { recordWorktreeEvent } from "../state.js";

export const worktreeRemoveTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_remove",
      description: "Remove a git worktree by path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          force: { type: "boolean" },
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
    const force = readBoolean(args.force, false);
    const gitArgs = force ? ["worktree", "remove", "--force", targetPath] : ["worktree", "remove", targetPath];
    const result = await runGit(context.projectContext.rootDir, gitArgs);
    const statePath = await recordWorktreeEvent(context.projectContext.stateRootDir, {
      event: "remove",
      path: targetPath,
      details: { force, exitCode: result.exitCode },
    });
    return changedJsonResult({ ok: result.exitCode === 0, path: targetPath, output: result.output }, [statePath]);
  },
};
