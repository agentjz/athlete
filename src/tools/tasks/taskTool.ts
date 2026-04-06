import { buildSubagentTypeSummary, listSubagentTypes } from "../../subagent/profiles.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

const SUBAGENT_TYPES = listSubagentTypes();

export const taskTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task",
      description:
        "Spawn a focused subagent with fresh context. The child shares the filesystem but not the current conversation history.\n\nAvailable agent types:\n" +
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
    if (context.identity.kind === "subagent") {
      throw new Error("Subagents cannot spawn additional subagents.");
    }

    const args = parseArgs(rawArgs);
    const description = readString(args.description, "description");
    const prompt = readString(args.prompt, "prompt");
    const agentType = readString(args.agent_type, "agent_type");
    const { runSubagentTask } = await import("../../subagent/run.js");
    const result = await runSubagentTask({
      description,
      prompt,
      agentType,
      cwd: context.cwd,
      config: context.config,
      createToolRegistry: context.createToolRegistry,
      callbacks: context.callbacks,
    });
    const payload: Record<string, unknown> = {
      ok: true,
      description,
      agentType,
      content: result.content,
    };

    if (result.metadata?.changedPaths?.length) {
      payload.changedPaths = result.metadata.changedPaths;
    }

    if (result.metadata?.verification?.attempted) {
      payload.verification = result.metadata.verification;
    }

    return okResult(JSON.stringify(payload, null, 2), result.metadata);
  },
};
