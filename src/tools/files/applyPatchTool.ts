import fs from "node:fs/promises";

import { assertPathAllowed, ensureParentDirectory, fileExists, truncateText } from "../../utils/fs.js";
import { recordToolChange } from "../changeTracking.js";
import { buildDiffPreview, normalizeDiffPath, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

interface PatchLike {
  oldFileName?: string;
  newFileName?: string;
  hunks: Array<{
    oldStart: number;
    newStart: number;
    lines: string[];
  }>;
}

export const applyPatchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a unified diff patch. Prefer this for precise multi-line or multi-file edits.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "string",
            description: "Unified diff patch text.",
          },
        },
        required: ["patch"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const patchText = readString(args.patch, "patch");
    const parsedPatches = parseUnifiedPatchLoosely(patchText);

    if (parsedPatches.length === 0) {
      throw new Error("No valid file patch was found.");
    }

    const operations: Array<{
      path: string;
      type: "create" | "update" | "delete";
      before: string;
      content?: string;
      preview: string;
    }> = [];

    for (const patch of parsedPatches) {
      const oldPath = normalizeDiffPath(patch.oldFileName);
      const newPath = normalizeDiffPath(patch.newFileName);

      if (oldPath && newPath && oldPath !== newPath) {
        throw new Error(`Rename patches are not supported yet: ${oldPath} -> ${newPath}`);
      }

      const targetPath = newPath ?? oldPath;
      if (!targetPath) {
        throw new Error("Patch target path is missing.");
      }

      const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
      const exists = await fileExists(resolved);
      const before = exists ? await fs.readFile(resolved, "utf8") : "";
      const source = oldPath === null ? "" : before;
      const after = applyPatchLoosely(source, patch);

      if (after === false) {
        throw new Error(`Failed to apply patch for ${targetPath}`);
      }

      operations.push({
        path: resolved,
        type: newPath === null ? "delete" : exists ? "update" : "create",
        before,
        content: newPath === null ? undefined : after,
        preview: buildDiffPreview(before, newPath === null ? "" : after),
      });
    }

    for (const operation of operations) {
      if (operation.type === "delete") {
        await fs.rm(operation.path, { force: true });
        continue;
      }

      await ensureParentDirectory(operation.path);
      await fs.writeFile(operation.path, operation.content ?? "", "utf8");
    }
    const changeRecord = await recordToolChange(context, {
      toolName: "apply_patch",
      summary: `apply_patch ${operations.length} file(s)`,
      preview: truncateText(patchText, 8_000),
      operations: operations.map((operation) => ({
        path: operation.path,
        kind: operation.type,
        binary: false,
        preview: operation.preview,
        beforeText: operation.type === "create" ? undefined : operation.before,
        afterText: operation.type === "delete" ? undefined : operation.content ?? "",
      })),
    });

    return okResult(
      JSON.stringify(
        {
          applied: operations.map((operation) => ({
            path: operation.path,
            type: operation.type,
          })),
          changeId: changeRecord.change?.id,
          changeHistoryWarning: changeRecord.warning,
          preview: truncateText(patchText, 8_000),
        },
        null,
        2,
      ),
      {
        changedPaths: operations.map((operation) => operation.path),
        changeId: changeRecord.change?.id,
      },
    );
  },
};

function parseUnifiedPatchLoosely(patchText: string): PatchLike[] {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const patches: PatchLike[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index]?.startsWith("--- ")) {
      index += 1;
    }

    if (index >= lines.length) {
      break;
    }

    const oldFileName = lines[index]?.slice(4).trim();
    index += 1;

    if (!lines[index]?.startsWith("+++ ")) {
      throw new Error("Patch is missing the +++ file header.");
    }

    const newFileName = lines[index]?.slice(4).trim();
    index += 1;

    const hunks: PatchLike["hunks"] = [];

    while (index < lines.length && !lines[index]?.startsWith("--- ")) {
      const header = lines[index];
      if (!header) {
        index += 1;
        continue;
      }

      if (!header.startsWith("@@ ")) {
        index += 1;
        continue;
      }

      const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        throw new Error(`Invalid hunk header: ${header}`);
      }

      const oldStart = Number.parseInt(match[1] ?? "1", 10);
      const newStart = Number.parseInt(match[3] ?? "1", 10);
      index += 1;

      const hunkLines: string[] = [];
      while (index < lines.length) {
        const line = lines[index] ?? "";
        if (line.startsWith("@@ ") || line.startsWith("--- ")) {
          break;
        }

        if (line.length === 0) {
          index += 1;
          continue;
        }

        const marker = line[0];
        if (marker !== " " && marker !== "+" && marker !== "-" && marker !== "\\") {
          throw new Error(`Hunk at line ${index + 1} contained invalid line ${line}`);
        }

        hunkLines.push(line);
        index += 1;
      }

      hunks.push({
        oldStart,
        newStart,
        lines: hunkLines,
      });
    }

    patches.push({
      oldFileName,
      newFileName,
      hunks,
    });
  }

  return patches;
}

function applyPatchLoosely(source: string, patch: PatchLike): string | false {
  const hasBom = source.startsWith("\uFEFF");
  const normalizedSource = hasBom ? source.slice(1) : source;
  const lineEnding = normalizedSource.includes("\r\n") ? "\r\n" : "\n";
  const sourceLines = normalizedSource.length > 0 ? normalizedSource.split(/\r?\n/) : [];
  let offset = 0;

  for (const hunk of patch.hunks) {
    let cursor = Math.max(0, hunk.oldStart - 1 + offset);
    cursor = normalizeCursor(sourceLines, cursor, hunk);

    for (const rawLine of hunk.lines) {
      const marker = rawLine[0];
      const lineText = rawLine.slice(1);

      if (marker === "\\") {
        continue;
      }

      if (marker === " ") {
        if ((sourceLines[cursor] ?? "") !== lineText) {
          return false;
        }

        cursor += 1;
        continue;
      }

      if (marker === "-") {
        if ((sourceLines[cursor] ?? "") !== lineText) {
          return false;
        }

        sourceLines.splice(cursor, 1);
        offset -= 1;
        continue;
      }

      if (marker === "+") {
        sourceLines.splice(cursor, 0, lineText);
        cursor += 1;
        offset += 1;
      }
    }
  }

  const result = sourceLines.join(lineEnding);
  return hasBom ? `\uFEFF${result}` : result;
}

function normalizeCursor(
  sourceLines: string[],
  cursor: number,
  hunk: PatchLike["hunks"][number],
): number {
  const firstAnchor = hunk.lines.find((line) => line.startsWith(" ") || line.startsWith("-"));
  if (!firstAnchor) {
    return cursor;
  }

  const expected = firstAnchor.slice(1);
  if ((sourceLines[cursor] ?? "") === expected) {
    return cursor;
  }

  const nearby = findNearbyLine(sourceLines, cursor, expected);
  return nearby === -1 ? cursor : nearby;
}

function findNearbyLine(lines: string[], start: number, expected: string): number {
  const searchWindow = 4;

  for (
    let index = Math.max(0, start - searchWindow);
    index <= Math.min(lines.length - 1, start + searchWindow);
    index += 1
  ) {
    if ((lines[index] ?? "") === expected) {
      return index;
    }
  }

  return -1;
}
