import { okResult, parseArgs, readBoolean } from "../../core/shared.js";
import { readGitStatusSnapshot } from "./gitShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const gitStatusTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "git_status",
      description: "Read the current Git worktree status as structured facts. Use this before reasoning about changed, untracked, ignored, deleted, or renamed files instead of shelling out to git status.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional directory inside the Git worktree. Relative paths resolve from the current working directory.",
          },
          include_ignored: {
            type: "boolean",
            description: "Whether to include ignored files.",
          },
          include_untracked: {
            type: "boolean",
            description: "Whether to include untracked files.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const snapshot = await readGitStatusSnapshot(context, {
      path: typeof args.path === "string" ? args.path : undefined,
      includeIgnored: readBoolean(args.include_ignored, false),
      includeUntracked: readBoolean(args.include_untracked, true),
    });

    return okResult(JSON.stringify(snapshot, null, 2));
  },
};
