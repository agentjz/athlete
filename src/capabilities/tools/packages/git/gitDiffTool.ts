import fs from "node:fs/promises";

import { truncateText } from "../../../../utils/fs.js";
import { clampNumber, normalizeDiffPath, okResult, parseArgs, readBoolean } from "../../core/shared.js";
import { readGitStatusSnapshot, resolveGitRoot, runGit } from "./gitShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const gitDiffTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "git_diff",
      description: "Read Git diff facts for the current worktree or one path. Use this after edits to verify the actual patch before testing or final response.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional file or directory path to diff. Relative paths resolve from the current working directory.",
          },
          staged: {
            type: "boolean",
            description: "Whether to diff staged changes instead of unstaged worktree changes.",
          },
          stat: {
            type: "boolean",
            description: "Whether to include numstat file statistics.",
          },
          include_untracked: {
            type: "boolean",
            description: "Whether to include untracked text files as new-file diff facts. Ignored when staged=true.",
          },
          max_chars: {
            type: "number",
            description: "Maximum diff characters to return.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const root = await resolveGitRoot(context, typeof args.path === "string" ? args.path : undefined);
    const staged = readBoolean(args.staged, false);
    const includeStat = readBoolean(args.stat, true);
    const includeUntracked = readBoolean(args.include_untracked, false);
    const maxChars = clampNumber(args.max_chars, 1_000, 200_000, 40_000);
    const pathFilter = typeof args.path === "string" && args.path.trim() ? args.path.trim() : undefined;
    const diffArgs = ["diff", "--no-ext-diff", "--", ...(pathFilter ? [pathFilter] : [])];
    if (staged) {
      diffArgs.splice(1, 0, "--cached");
    }
    const diffResult = await runGit(context, diffArgs, { cwd: root });
    const stats = includeStat
      ? parseNumstat((await runGit(context, ["diff", staged ? "--cached" : "--no-ext-diff", "--numstat", "--", ...(pathFilter ? [pathFilter] : [])], { cwd: root })).stdout)
      : undefined;
    const untracked = !staged && includeUntracked
      ? await readUntrackedDiffs(context, root, pathFilter)
      : {
          diff: "",
          stats: emptyNumstat(),
        };
    const fullDiff = [diffResult.stdout, untracked.diff].filter((value) => value.trim().length > 0).join("\n");
    const diff = truncateText(fullDiff, maxChars);
    const mergedStats = stats ? mergeNumstat(stats, untracked.stats) : undefined;

    return okResult(
      JSON.stringify(
        {
          root,
          path: pathFilter,
          staged,
          includeUntracked,
          diff,
          truncated: diff.length < fullDiff.length,
          stats: mergedStats,
        },
        null,
        2,
      ),
    );
  },
};

type NumstatSummary = {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: Array<{
    path: string;
    insertions: number | null;
    deletions: number | null;
  }>;
};

async function readUntrackedDiffs(
  context: Parameters<typeof readGitStatusSnapshot>[0],
  root: string,
  pathFilter: string | undefined,
): Promise<{
  diff: string;
  stats: NumstatSummary;
}> {
  const snapshot = await readGitStatusSnapshot(context, {
    path: pathFilter,
    includeUntracked: true,
  });
  const normalizedFilter = pathFilter?.replace(/\\/g, "/").replace(/\/$/, "");
  const files = snapshot.files
    .filter((file) => file.untracked)
    .filter((file) => !normalizedFilter || file.path === normalizedFilter || file.path.startsWith(`${normalizedFilter}/`));
  const stats = emptyNumstat();
  const chunks: string[] = [];

  for (const file of files) {
    const content = await tryReadUntrackedText(`${root}/${file.path}`);
    if (content === null) {
      continue;
    }

    const lines = content.split(/\r?\n/);
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    stats.files.push({
      path: file.path,
      insertions: lines.length,
      deletions: 0,
    });
    stats.filesChanged += 1;
    stats.insertions += lines.length;
    chunks.push([
      `diff --git a/${file.path} b/${file.path}`,
      "new file mode 100644",
      "index 0000000..0000000",
      "--- /dev/null",
      `+++ b/${file.path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
    ].join("\n"));
  }

  return {
    diff: chunks.join("\n"),
    stats,
  };
}

async function tryReadUntrackedText(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    if (buffer.includes(0)) {
      return null;
    }
    return buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  } catch {
    return null;
  }
}

function parseNumstat(stdout: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: Array<{
    path: string;
    insertions: number | null;
    deletions: number | null;
  }>;
} {
  const files = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [insertionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      return {
        path: normalizeDiffPath(pathParts.join("\t")) ?? pathParts.join("\t"),
        insertions: parseNumstatCount(insertionsRaw),
        deletions: parseNumstatCount(deletionsRaw),
      };
    });

  return {
    filesChanged: files.length,
    insertions: files.reduce((total, file) => total + (file.insertions ?? 0), 0),
    deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
    files,
  };
}

function emptyNumstat(): NumstatSummary {
  return {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    files: [],
  };
}

function mergeNumstat(left: NumstatSummary, right: NumstatSummary): NumstatSummary {
  return {
    filesChanged: left.filesChanged + right.filesChanged,
    insertions: left.insertions + right.insertions,
    deletions: left.deletions + right.deletions,
    files: [...left.files, ...right.files],
  };
}

function parseNumstatCount(value: string | undefined): number | null {
  if (!value || value === "-") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
