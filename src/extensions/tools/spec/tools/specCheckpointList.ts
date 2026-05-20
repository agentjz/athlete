import fs from "node:fs/promises";
import path from "node:path";

import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { checkpointsDir } from "../state.js";

export const specCheckpointListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_list",
      description: "List checkpoints for the current session spec.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const dir = await checkpointsDir(context.projectContext.stateRootDir, context.sessionId);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const checkpoints = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(dir, entry.name);
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
      checkpoints.push({
        id: parsed.id,
        label: parsed.label,
        createdAt: parsed.createdAt,
        path: filePath,
      });
    }
    checkpoints.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    return jsonResult({ ok: true, checkpoints });
  },
};
