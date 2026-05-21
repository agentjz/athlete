import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { getSpecPaths } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { changedJsonResult } from "../../../shared.js";
import { readSpecTaskStatus, SPEC_TASK_STATUSES } from "../shared.js";

export const specTaskUpdateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_task_update",
      description: "Persist factual task progress for a durable spec.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          taskId: { type: "string" },
          title: { type: "string" },
          status: { type: "string", enum: [...SPEC_TASK_STATUSES] },
          evidence: { type: "string" },
          checkpointLabel: { type: "string", description: "Optional checkpoint label to create after this task update." },
        },
        required: ["specId", "taskId", "status"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    });
    const specId = readString(args.specId, "specId");
    const taskId = readString(args.taskId, "taskId");
    const state = await store.updateTask(specId, taskId, {
      title: typeof args.title === "string" ? args.title : undefined,
      status: readSpecTaskStatus(readString(args.status, "status")),
      evidence: typeof args.evidence === "string" ? args.evidence : undefined,
    });
    let checkpoint;
    if (typeof args.checkpointLabel === "string" && args.checkpointLabel.trim()) {
      checkpoint = await store.createCheckpoint(state.id, { label: args.checkpointLabel });
    }
    const paths = getSpecPaths(context.projectContext.stateRootDir, state.id);
    const changedPaths = [paths.stateFile];
    if (checkpoint) {
      changedPaths.push(paths.checkpointsDir);
    }
    return changedJsonResult({ ok: true, spec: summarizeSpec(state), task: state.tasks[taskId], checkpoint }, changedPaths);
  },
};
