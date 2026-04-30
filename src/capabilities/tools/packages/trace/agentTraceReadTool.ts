import fs from "node:fs/promises";
import path from "node:path";

import { readAgentTraceEvents } from "../../../../trace/store.js";
import { okResult, parseArgs } from "../../core/shared.js";
import { clampLimit, clampMessageChars, readBoolean, readOptionalString, truncate } from "../history/historyShared.js";
import type { AgentTraceEventKind } from "../../../../trace/schema.js";
import type { RegisteredTool } from "../../core/types.js";

export const agentTraceReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "agent_trace_read",
      description: "Read a structured agent trace dossier by session id. Returns recorded facts only.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Session id whose trace dossier should be read.",
          },
          turn_id: {
            type: "string",
            description: "Optional turn id filter.",
          },
          kind: {
            type: "string",
            description: "Optional trace event kind filter.",
          },
          include_artifacts: {
            type: "boolean",
            description: "When true, include small trace artifact contents.",
          },
          max_artifact_chars: {
            type: "number",
            description: "Maximum characters per included artifact.",
          },
          limit: {
            type: "number",
            description: "Maximum number of events to return.",
          },
        },
        required: ["session_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const sessionId = readOptionalString(args.session_id);
    if (!sessionId) {
      throw new Error("agent_trace_read.session_id is required.");
    }

    const turnId = readOptionalString(args.turn_id);
    const kind = readOptionalString(args.kind) as AgentTraceEventKind | undefined;
    const includeArtifacts = readBoolean(args.include_artifacts, false);
    const maxArtifactChars = clampMessageChars(args.max_artifact_chars, 4_000);
    const limit = clampLimit(args.limit, 80);
    const events = (await readAgentTraceEvents(context.projectContext.stateRootDir, sessionId))
      .filter((event) => !turnId || event.turnId === turnId)
      .filter((event) => !kind || event.kind === kind);
    const selected = events.slice(-limit);
    const artifactContents = includeArtifacts
      ? await readTraceArtifacts(context.projectContext.stateRootDir, selected, maxArtifactChars)
      : undefined;

    return okResult(JSON.stringify({
      ok: true,
      sessionId,
      count: selected.length,
      totalMatchingEvents: events.length,
      truncated: events.length > selected.length,
      events: selected,
      artifactContents,
    }, null, 2));
  },
};

async function readTraceArtifacts(
  stateRootDir: string,
  events: Array<{ artifacts?: Array<{ storagePath: string }> }>,
  maxChars: number,
): Promise<Array<{
  storagePath: string;
  content: string;
  truncated: boolean;
}> | undefined> {
  const stateRoot = path.resolve(stateRootDir);
  const artifacts = events.flatMap((event) => event.artifacts ?? []);
  const uniquePaths = [...new Set(artifacts.map((artifact) => artifact.storagePath))];
  const contents = [];

  for (const storagePath of uniquePaths) {
    const absolutePath = resolveInside(stateRoot, storagePath);
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    contents.push({
      storagePath,
      content: truncate(raw, maxChars),
      truncated: raw.length > maxChars,
    });
  }

  return contents.length > 0 ? contents : undefined;
}

function resolveInside(baseDir: string, requestedPath: string): string {
  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(baseDir, requestedPath);
  if (absolutePath !== baseDir && !absolutePath.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error(`Trace artifact path is outside the project state root: ${requestedPath}`);
  }

  return absolutePath;
}
