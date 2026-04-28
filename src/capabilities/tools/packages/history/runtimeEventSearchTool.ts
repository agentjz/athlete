import fs from "node:fs/promises";

import { okResult, parseArgs } from "../../core/shared.js";
import {
  buildMatchPreview,
  clampLimit,
  listObservabilityEventFiles,
  readOptionalString,
} from "./historyShared.js";
import type { ObservabilityEventRecord } from "../../../../observability/schema.js";
import type { RegisteredTool } from "../../core/types.js";

export const runtimeEventSearchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "runtime_event_search",
      description: "Search project runtime observability events. Returns recorded facts only.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional literal text to search in event JSON.",
          },
          event: {
            type: "string",
            description: "Optional exact event type filter.",
          },
          status: {
            type: "string",
            description: "Optional exact status filter.",
          },
          session_id: {
            type: "string",
            description: "Optional session id filter.",
          },
          execution_id: {
            type: "string",
            description: "Optional execution id filter.",
          },
          tool_name: {
            type: "string",
            description: "Optional tool name filter.",
          },
          limit: {
            type: "number",
            description: "Maximum number of newest matching events to return.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const query = readOptionalString(args.query);
    const filters = {
      event: readOptionalString(args.event),
      status: readOptionalString(args.status),
      sessionId: readOptionalString(args.session_id),
      executionId: readOptionalString(args.execution_id),
      toolName: readOptionalString(args.tool_name),
    };
    const limit = clampLimit(args.limit, 40);
    const files = await listObservabilityEventFiles(context);
    const matches: Array<Record<string, unknown>> = [];

    for (const filePath of files.reverse()) {
      const raw = await fs.readFile(filePath, "utf8").catch(() => "");
      const lines = raw.split(/\r?\n/).filter(Boolean).reverse();
      for (const line of lines) {
        const event = parseEvent(line);
        if (!event || !matchesFilters(event, filters)) {
          continue;
        }
        if (query && !line.toLowerCase().includes(query.toLowerCase())) {
          continue;
        }

        matches.push({
          event,
          sourceFile: filePath,
          preview: query ? buildMatchPreview(line, query, false) : undefined,
        });

        if (matches.length >= limit) {
          return okResult(JSON.stringify({ ok: true, matches, truncated: true }, null, 2));
        }
      }
    }

    return okResult(JSON.stringify({ ok: true, matches, truncated: false }, null, 2));
  },
};

function parseEvent(line: string): ObservabilityEventRecord | undefined {
  try {
    return JSON.parse(line) as ObservabilityEventRecord;
  } catch {
    return undefined;
  }
}

function matchesFilters(
  event: ObservabilityEventRecord,
  filters: {
    event?: string;
    status?: string;
    sessionId?: string;
    executionId?: string;
    toolName?: string;
  },
): boolean {
  return (
    (!filters.event || event.event === filters.event) &&
    (!filters.status || event.status === filters.status) &&
    (!filters.sessionId || event.sessionId === filters.sessionId) &&
    (!filters.executionId || event.executionId === filters.executionId) &&
    (!filters.toolName || event.toolName === filters.toolName)
  );
}
