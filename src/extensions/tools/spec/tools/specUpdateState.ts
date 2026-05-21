import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecPaths, getSpecSessionBindingFile } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";
import {
  readSpecStage,
  readSpecStatus,
  SPEC_STAGES,
  SPEC_STATUSES,
} from "../shared.js";

export const specUpdateStateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_update_state",
      description: "Persist factual spec state: stage, status, confirmation flags, title, or short summary.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          stage: { type: "string", enum: [...SPEC_STAGES] },
          status: { type: "string", enum: [...SPEC_STATUSES] },
          requirementsConfirmed: { type: "boolean" },
          designConfirmed: { type: "boolean" },
          tasksConfirmed: { type: "boolean" },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const confirmed = {
      ...(typeof args.requirementsConfirmed === "boolean" ? { requirements: args.requirementsConfirmed } : {}),
      ...(typeof args.designConfirmed === "boolean" ? { design: args.designConfirmed } : {}),
      ...(typeof args.tasksConfirmed === "boolean" ? { tasks: args.tasksConfirmed } : {}),
    };
    const state = await new SpecStore(context.projectContext.stateRootDir).updateState(
      readString(args.specId, "specId"),
      {
        title: typeof args.title === "string" ? args.title : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        stage: typeof args.stage === "string" ? readSpecStage(args.stage) : undefined,
        status: typeof args.status === "string" ? readSpecStatus(args.status) : undefined,
        confirmed,
        sessionId: context.sessionId,
      },
    );
    return changedJsonResult(
      { ok: true, spec: summarizeSpec(state), confirmed: state.confirmed },
      [
        getSpecPaths(context.projectContext.stateRootDir, state.id).stateFile,
        getSpecSessionBindingFile(context.projectContext.stateRootDir, context.sessionId),
      ],
    );
  },
};
