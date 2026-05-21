import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecSessionBindingFile } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";

export const specOpenTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_open",
      description: "Open an existing durable spec and bind it to the current session.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string", description: "Spec id to open." },
        },
        required: ["specId"],
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
    const specId = readString(args.specId, "specId");
    const state = await store.load(specId);
    await store.bindSession(context.sessionId, specId);
    return changedJsonResult({
      ok: true,
      spec: summarizeSpec(state),
      workspace: state.workspace,
      documents: await store.readAllDocuments(specId),
    }, [getSpecSessionBindingFile(context.projectContext.stateRootDir, context.sessionId)]);
  },
};
