import path from "node:path";

import { parseArgs, readPossiblyEmptyString, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";

export const specAppendNoteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_append_note",
      description: "Append a factual note to notes.md for a durable spec. Keep user wording, confirmed facts, model proposals, assumptions, unresolved questions, and actual decisions separate.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          heading: { type: "string", description: "Short factual heading for this note entry." },
          content: { type: "string", description: "Factual note content. Separate user wording, confirmed facts, model proposals, assumptions, and unresolved questions when relevant." },
        },
        required: ["specId", "content"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const result = await new SpecStore(context.projectContext.stateRootDir).appendNote(
      readString(args.specId, "specId"),
      {
        heading: typeof args.heading === "string" ? args.heading : undefined,
        content: readPossiblyEmptyString(args.content, "content"),
      },
    );
    return changedJsonResult({
      ok: true,
      spec: summarizeSpec(result.state),
      document: "notes",
      path: path.relative(context.projectContext.rootDir, result.path),
    }, [result.path]);
  },
};
