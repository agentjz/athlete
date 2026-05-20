import fs from "node:fs/promises";
import path from "node:path";

import type { RegisteredTool } from "../../../../tools/core/types.js";
import { ensureExtensionDir, jsonResult } from "../../../shared.js";

export const specListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_list",
      description: "List session specs stored by the spec extension.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const root = await ensureExtensionDir(context.projectContext.stateRootDir, "spec");
    const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const specs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const statePath = path.join(root, entry.name, "state.json");
      const state = JSON.parse(await fs.readFile(statePath, "utf8").catch(() => "{}")) as Record<string, unknown>;
      specs.push({
        id: entry.name,
        title: state.title,
        status: state.status,
        updatedAt: state.updatedAt,
        path: path.join(root, entry.name, "spec.md"),
      });
    }
    return jsonResult({ ok: true, specs });
  },
};
