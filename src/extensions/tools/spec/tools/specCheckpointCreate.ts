import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecPaths } from "../../../../spec/layout.js";
import { SpecStore } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";

export const specCheckpointCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_create",
      description: "Create a durable recovery checkpoint for spec state, documents, and isolated worktree.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["specId", "label"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const checkpoint = await new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    }).createCheckpoint(
      readString(args.specId, "specId"),
      {
        label: readString(args.label, "label"),
        reason: typeof args.reason === "string" ? args.reason : undefined,
      },
    );
    const paths = getSpecPaths(context.projectContext.stateRootDir, readString(args.specId, "specId"));
    return changedJsonResult({ ok: true, checkpoint }, [
      paths.stateFile,
      paths.checkpointsDir,
      ...(checkpoint.workspace ? [checkpoint.workspace.path] : []),
    ]);
  },
};
