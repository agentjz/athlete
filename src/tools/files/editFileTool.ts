import fs from "node:fs/promises";

import { assertPathAllowed, truncateText } from "../../utils/fs.js";
import { recordToolChange } from "../changeTracking.js";
import { buildDiffPreview, countOccurrences, okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const editFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing text. Prefer this over write_file for small surgical changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit.",
          },
          old_string: {
            type: "string",
            description: "Exact text to replace.",
          },
          new_string: {
            type: "string",
            description: "Replacement text.",
          },
          replace_all: {
            type: "boolean",
            description: "Whether to replace every occurrence.",
          },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const oldString = readString(args.old_string, "old_string");
    const newString = readString(args.new_string, "new_string");
    const replaceAll = readBoolean(args.replace_all, false);
    const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
    const before = await fs.readFile(resolved, "utf8");
    const occurrences = countOccurrences(before, oldString);

    if (occurrences === 0) {
      throw new Error(`Text not found in file: ${resolved}`);
    }

    const after = replaceAll
      ? before.split(oldString).join(newString)
      : before.replace(oldString, newString);
    const preview = buildDiffPreview(before, after);

    await fs.writeFile(resolved, after, "utf8");
    const changeRecord = await recordToolChange(context, {
      toolName: "edit_file",
      summary: `edit_file ${resolved}`,
      preview,
      operations: [
        {
          path: resolved,
          kind: "update",
          binary: false,
          preview,
          beforeText: before,
          afterText: after,
        },
      ],
    });

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          occurrencesFound: occurrences,
          occurrencesChanged: replaceAll ? occurrences : 1,
          changeId: changeRecord.change?.id,
          changeHistoryWarning: changeRecord.warning,
          preview: truncateText(preview, 6_000),
        },
        null,
        2,
      ),
      {
        changedPaths: [resolved],
        changeId: changeRecord.change?.id,
      },
    );
  },
};
