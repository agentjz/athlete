import { parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { normalizeSpecStatus, readSpecState, writeSpecState } from "../state.js";

export const specUpdateStateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_update_state",
      description: "Update current session spec title or status.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          status: { type: "string", enum: ["draft", "active", "blocked", "completed"] },
        },
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const state = await readSpecState(context.projectContext.stateRootDir, context.sessionId);
    if (typeof args.title === "string") {
      state.title = args.title.trim();
    }
    if (typeof args.status === "string") {
      state.status = normalizeSpecStatus(args.status);
    }
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, state);
    return changedJsonResult({ ok: true, state }, [statePath]);
  },
};
