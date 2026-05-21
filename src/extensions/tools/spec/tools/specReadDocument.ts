import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore } from "../../../../spec/store.js";
import { readSpecDocumentName, SPEC_DOCUMENT_NAMES, specJsonResult } from "../shared.js";

export const specReadDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_read_document",
      description: "Read one spec document or all documents from a durable spec.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          document: { type: "string", enum: [...SPEC_DOCUMENT_NAMES] },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir);
    const specId = readString(args.specId, "specId");
    if (typeof args.document === "string") {
      const document = readSpecDocumentName(args.document);
      return specJsonResult({ specId, document, content: await store.readDocument(specId, document) });
    }
    return specJsonResult({ specId, documents: await store.readAllDocuments(specId) });
  },
};
