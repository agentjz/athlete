import { parseArgs, readBoolean, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { runGit } from "../git.js";
import { recordWorktreeEvent } from "../state.js";

export const worktreeCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_create",
      description: "Create a git worktree on a new or existing branch.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          branch: { type: "string" },
          create_branch: { type: "boolean" },
        },
        required: ["path", "branch"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const branch = readString(args.branch, "branch");
    const createBranch = readBoolean(args.create_branch, true);
    const gitArgs = createBranch
      ? ["worktree", "add", "-b", branch, targetPath, "HEAD"]
      : ["worktree", "add", targetPath, branch];
    const result = await runGit(context.projectContext.rootDir, gitArgs);
    const statePath = await recordWorktreeEvent(context.projectContext.stateRootDir, {
      event: "create",
      path: targetPath,
      details: { branch, exitCode: result.exitCode },
    });
    return changedJsonResult({ ok: result.exitCode === 0, path: targetPath, branch, output: result.output }, [statePath]);
  },
};
