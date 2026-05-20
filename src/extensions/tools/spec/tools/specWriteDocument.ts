import { parseArgs, readPossiblyEmptyString, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { readSpecState, renderSpecDocument, writeSpecDocument, writeSpecState } from "../state.js";

export const specWriteDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_write_document",
      description: "Write the current session spec.md document.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          requirements: { type: "string" },
          design: { type: "string" },
          tasks: { type: "string" },
        },
        required: ["title", "requirements", "design", "tasks"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const title = readString(args.title, "title").trim();
    const document = renderSpecDocument({
      title,
      requirements: readPossiblyEmptyString(args.requirements, "requirements"),
      design: readPossiblyEmptyString(args.design, "design"),
      tasks: readPossiblyEmptyString(args.tasks, "tasks"),
    });
    const state = await readSpecState(context.projectContext.stateRootDir, context.sessionId);
    state.title = title;
    const documentPath = await writeSpecDocument(context.projectContext.stateRootDir, context.sessionId, document);
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, state);
    return changedJsonResult({ ok: true, documentPath, statePath, bytes: Buffer.byteLength(document, "utf8") }, [documentPath, statePath]);
  },
};
