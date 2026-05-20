import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult, sanitizeStateSegment } from "../../../shared.js";
import { checkpointsDir, readSpecDocument, readSpecState } from "../state.js";

export const specCheckpointCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_create",
      description: "Create a checkpoint for current session spec document and state.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const label = typeof args.label === "string" && args.label.trim() ? args.label.trim() : "checkpoint";
    const createdAt = new Date().toISOString();
    const checkpoint = {
      id: `${createdAt.replace(/[:.]/g, "-")}-${sanitizeStateSegment(label)}`,
      label,
      createdAt,
      document: await readSpecDocument(context.projectContext.stateRootDir, context.sessionId),
      state: await readSpecState(context.projectContext.stateRootDir, context.sessionId),
    };
    const filePath = path.join(await checkpointsDir(context.projectContext.stateRootDir, context.sessionId), `${checkpoint.id}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return changedJsonResult({ ok: true, checkpoint: { id: checkpoint.id, label, createdAt }, path: filePath }, [filePath]);
  },
};
