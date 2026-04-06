import fs from "node:fs/promises";

import { assertPathAllowed, ensureParentDirectory, fileExists, truncateText } from "../../utils/fs.js";
import { recordToolChange } from "../changeTracking.js";
import { buildDiffPreview, okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const writeFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with new content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to write.",
          },
          content: {
            type: "string",
            description: "The full target content.",
          },
          create_directories: {
            type: "boolean",
            description: "Whether to create parent directories if they do not exist.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const content = readString(args.content, "content");
    const createDirectories = readBoolean(args.create_directories, true);
    const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
    const existed = await fileExists(resolved);
    const before = existed ? await fs.readFile(resolved, "utf8") : "";
    const preview = buildDiffPreview(before, content);

    if (createDirectories) {
      await ensureParentDirectory(resolved);
    }

    await fs.writeFile(resolved, content, "utf8");
    const changeRecord = await recordToolChange(context, {
      toolName: "write_file",
      summary: `write_file ${resolved}`,
      preview,
      operations: [
        {
          path: resolved,
          kind: existed ? "update" : "create",
          binary: false,
          preview,
          beforeText: existed ? before : undefined,
          afterText: content,
        },
      ],
    });

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          existed,
          bytes: Buffer.byteLength(content, "utf8"),
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
