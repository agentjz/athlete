import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { readSpecState, writeSpecState } from "../state.js";

export const specAppendNoteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_append_note",
      description: "Append one note to the current session spec state.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const state = await readSpecState(context.projectContext.stateRootDir, context.sessionId);
    state.notes.push({
      at: new Date().toISOString(),
      text: readString(args.text, "text"),
    });
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, state);
    return changedJsonResult({ ok: true, state }, [statePath]);
  },
};
