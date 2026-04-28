import { okResult, parseArgs, readOptionalNumber } from "../../core/shared.js";
import {
  clampMessageChars,
  createSessionStore,
  readOptionalString,
  readProjectStateTextFile,
  resolveToolArtifactPathFromMessage,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const toolArtifactReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "tool_artifact_read",
      description: "Read an externalized tool-result artifact by storage path or by session message reference.",
      parameters: {
        type: "object",
        properties: {
          storage_path: {
            type: "string",
            description: "Path relative to the project state root, such as .deadmouse/tool-results/... .",
          },
          path: {
            type: "string",
            description: "Absolute or project-state-root-relative artifact path.",
          },
          session_id: {
            type: "string",
            description: "Session id containing an externalized tool-result message.",
          },
          message_index: {
            type: "number",
            description: "0-based message index with externalizedToolResult metadata.",
          },
          max_chars: {
            type: "number",
            description: "Maximum characters of artifact content to return.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const requestedPath = await resolveRequestedArtifactPath(args, context);
    const maxChars = clampMessageChars(args.max_chars, context.config.maxReadBytes);
    const artifact = await readProjectStateTextFile(context, requestedPath, maxChars);

    return okResult(
      JSON.stringify(
        {
          ok: true,
          artifactType: "externalized_tool_result",
          ...artifact,
        },
        null,
        2,
      ),
    );
  },
};

async function resolveRequestedArtifactPath(
  args: Record<string, unknown>,
  context: Parameters<RegisteredTool["execute"]>[1],
): Promise<string> {
  const explicitPath = readOptionalString(args.storage_path) ?? readOptionalString(args.path);
  if (explicitPath) {
    return explicitPath;
  }

  const sessionId = readOptionalString(args.session_id) ?? context.sessionId;
  const messageIndex = readOptionalNumber(args.message_index);
  if (messageIndex === undefined) {
    throw new Error('tool_artifact_read requires "storage_path", "path", or "message_index".');
  }

  const session = await createSessionStore(context.config).load(sessionId);
  return resolveToolArtifactPathFromMessage(session, messageIndex);
}
