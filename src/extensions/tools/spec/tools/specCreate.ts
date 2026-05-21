import path from "node:path";

import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { getSpecPaths } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";

export const specCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_create",
      description: "Create a durable spec with documents, state, checkpoints, and an isolated worktree.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Human-readable spec title." },
          summary: { type: "string", description: "Short factual summary if already known." },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    });
    const state = await store.create({
      title: readString(args.title, "title"),
      summary: typeof args.summary === "string" ? args.summary : undefined,
      sessionId: context.sessionId,
    });
    const specDir = getSpecPaths(context.projectContext.stateRootDir, state.id).specDir;
    return changedJsonResult({
      ok: true,
      spec: summarizeSpec(state),
      directory: path.relative(context.projectContext.rootDir, specDir),
      workspace: state.workspace,
    }, [specDir, state.workspace?.path].filter((item): item is string => Boolean(item)));
  },
};
