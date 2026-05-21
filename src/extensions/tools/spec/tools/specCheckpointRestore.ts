import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecPaths } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";

export const specCheckpointRestoreTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_restore",
      description: "Restore spec state, documents, and isolated worktree from a checkpoint.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          checkpointId: { type: "string" },
        },
        required: ["specId", "checkpointId"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const specId = readString(args.specId, "specId");
    const state = await new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    }).restoreCheckpoint(specId, readString(args.checkpointId, "checkpointId"));
    const paths = getSpecPaths(context.projectContext.stateRootDir, state.id);
    return changedJsonResult({ ok: true, spec: summarizeSpec(state) }, [
      paths.stateFile,
      ...Object.values(paths.documents),
      ...(state.workspace ? [state.workspace.path] : []),
    ]);
  },
};
