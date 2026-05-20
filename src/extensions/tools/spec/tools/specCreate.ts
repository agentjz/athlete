import { parseArgs, readPossiblyEmptyString, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { createEmptySpecState, renderSpecDocument, writeSpecDocument, writeSpecState } from "../state.js";

export const specCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_create",
      description: "Create or replace the current session spec.md and initial spec state.",
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
    const state = createEmptySpecState(context.sessionId);
    state.title = title;
    state.status = "active";
    const documentPath = await writeSpecDocument(context.projectContext.stateRootDir, context.sessionId, document);
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, state);
    return changedJsonResult({ ok: true, documentPath, statePath, state }, [documentPath, statePath]);
  },
};
