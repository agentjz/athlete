import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { readSpecDocument, specDocumentFile } from "../state.js";

export const specReadDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_read_document",
      description: "Read the current session spec.md document.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const documentPath = await specDocumentFile(context.projectContext.stateRootDir, context.sessionId);
    return jsonResult({
      ok: true,
      documentPath,
      document: await readSpecDocument(context.projectContext.stateRootDir, context.sessionId),
    });
  },
};
