import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { readSpecDocument, readSpecState, specDocumentFile, specStateFile } from "../state.js";

export const specOpenTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_open",
      description: "Open the current session spec document and state.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const state = await readSpecState(context.projectContext.stateRootDir, context.sessionId);
    const document = await readSpecDocument(context.projectContext.stateRootDir, context.sessionId);
    return jsonResult({
      ok: true,
      documentPath: await specDocumentFile(context.projectContext.stateRootDir, context.sessionId),
      statePath: await specStateFile(context.projectContext.stateRootDir, context.sessionId),
      state,
      document,
    });
  },
};
