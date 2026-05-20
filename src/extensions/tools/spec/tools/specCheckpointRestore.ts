import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import {
  type SpecCheckpointRecord,
  checkpointsDir,
  writeSpecDocument,
  writeSpecState,
} from "../state.js";

export const specCheckpointRestoreTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_restore",
      description: "Restore current session spec document and state from a checkpoint.",
      parameters: {
        type: "object",
        properties: {
          checkpoint_id: { type: "string" },
        },
        required: ["checkpoint_id"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const checkpointId = readString(args.checkpoint_id, "checkpoint_id");
    const checkpointPath = path.join(
      await checkpointsDir(context.projectContext.stateRootDir, context.sessionId),
      `${checkpointId}.json`,
    );
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8")) as SpecCheckpointRecord;
    const documentPath = await writeSpecDocument(context.projectContext.stateRootDir, context.sessionId, checkpoint.document);
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, checkpoint.state);
    return changedJsonResult({
      ok: true,
      checkpoint: {
        id: checkpoint.id,
        label: checkpoint.label,
        createdAt: checkpoint.createdAt,
      },
      documentPath,
      statePath,
    }, [documentPath, statePath]);
  },
};
