import path from "node:path";

import { parseArgs, readPossiblyEmptyString, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";
import { readSpecDocumentName, SPEC_DOCUMENT_NAMES } from "../shared.js";

export const specWriteDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_write_document",
      description: "Write one durable spec document. The model owns the content; the tool only persists it.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          document: { type: "string", enum: [...SPEC_DOCUMENT_NAMES] },
          content: { type: "string" },
        },
        required: ["specId", "document", "content"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir);
    const specId = readString(args.specId, "specId");
    const document = readSpecDocumentName(args.document);
    const result = await store.writeDocument(
      specId,
      document,
      readPossiblyEmptyString(args.content, "content"),
    );
    return changedJsonResult({
      ok: true,
      spec: summarizeSpec(result.state),
      document,
      path: path.relative(context.projectContext.rootDir, result.path),
    }, [result.path]);
  },
};
