import { launchSubagentWorkerExecution } from "../../subagent/launch.js";
import { buildSubagentTypeSummary, listSubagentTypes } from "../../subagent/profiles.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import type { ToolExecutionMetadata } from "../../types.js";

const SUBAGENT_TYPES = listSubagentTypes();

export const taskTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task",
      description:
        "Lead-only: launch a focused subagent execution with fresh context. The tool returns an execution_id immediately; the Lead must wait for execution closeout before judging completion.\n\nAvailable agent types:\n" +
        buildSubagentTypeSummary(),
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Short task name for progress tracking.",
          },
          prompt: {
            type: "string",
            description: "Detailed instructions for the delegated subagent.",
          },
          agent_type: {
            type: "string",
            enum: SUBAGENT_TYPES,
            description: "Subagent capability profile to use.",
          },
        },
        required: ["description", "prompt", "agent_type"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    if (context.identity.kind !== "lead") {
      throw new Error("Only the lead can launch subagent executions.");
    }

    const args = parseArgs(rawArgs);
    const description = readString(args.description, "description");
    const prompt = readString(args.prompt, "prompt");
    const agentType = readString(args.agent_type, "agent_type");
    const { execution, pid } = await launchSubagentWorkerExecution({
      rootDir: context.projectContext.stateRootDir,
      cwd: context.cwd,
      config: context.config,
      description,
      prompt,
      agentType,
      requestedBy: "lead",
      objectiveKey: context.currentObjective?.key,
      objectiveText: context.currentObjective?.text,
      worktreePolicy: agentType === "code" ? "task" : "none",
    });

    const metadata: ToolExecutionMetadata = {
      collaboration: {
        action: "spawn",
        actor: description,
        executionId: execution.id,
        yieldLeadUntilCloseout: true,
      },
    };

    return okResult(JSON.stringify({
      ok: true,
      status: "launched",
      description,
      agentType,
      executionId: execution.id,
      pid,
      nextAction: "Lead must monitor the execution closeout/inbox and reconcile the result before declaring completion.",
      boundary: execution.boundary,
      preview: `Launched subagent execution '${execution.id}' (${agentType}) pid=${pid}.`,
    }, null, 2), metadata);
  },
};
