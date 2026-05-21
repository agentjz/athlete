import { getBuiltinTools } from "../toolCatalog.js";
import { validateToolChangeSignal } from "./changeSignal.js";
import { ToolExecutionError } from "./errors.js";
import { sortToolRegistryEntriesForExposure } from "./order.js";
import { register } from "./shared.js";
import { validateToolArgumentsContract } from "./toolArgumentContract.js";
import { createToolSource } from "./sources.js";
import type { ToolExecutionResult } from "../../types.js";
import type {
  RegisteredTool,
  ToolContext,
  ToolRegistry,
  ToolRegistryEntry,
  ToolRegistryOptions,
  ToolRegistrySource,
} from "./types.js";

export { createToolSource } from "./sources.js";

export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const selectedTools = collectSelectedTools(options);
  assertNoDuplicateToolNames(selectedTools);
  const entries = sortToolRegistryEntriesForExposure(
    selectedTools.map(({ source, tool }) => ({
      name: tool.definition.function.name,
      definition: tool.definition,
      changeSignal: tool.changeSignal,
      origin: tool.origin ?? { kind: source.kind, sourceId: source.id },
      tool,
    })),
  );
  const tools = new Map<string, RegisteredTool>();
  const entryByName = new Map<string, ToolRegistryEntry>();

  for (const entry of entries) {
    register(tools, entry.tool);
    entryByName.set(entry.name, entry);
  }

  async function execute(name: string, rawArgs: string, context: ToolContext): Promise<ToolExecutionResult> {
    const tool = tools.get(name);
    const entry = entryByName.get(name);
    if (!tool || !entry) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const parsed = parseToolArgs(rawArgs);
    const argumentContract = validateToolArgumentsContract(entry.definition, parsed);
    if (!argumentContract.ok) {
      return {
        ok: false,
        output: JSON.stringify(
          {
            ok: false,
            code: "INVALID_TOOL_ARGUMENTS",
            error: argumentContract.error,
            details: {
              kind: argumentContract.code,
              path: argumentContract.path,
            },
          },
          null,
          2,
        ),
      };
    }

    try {
      return validateToolChangeSignal(entry, await tool.execute(rawArgs, context));
    } catch (error) {
      return buildFailedToolResult(error);
    }
  }

  return {
    definitions: entries.map((entry) => entry.definition),
    entries,
    execute,
    async close() {
      return;
    },
  };
}

function buildFailedToolResult(error: unknown): ToolExecutionResult {
  const payload: Record<string, unknown> = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    hint: "Use the error facts to choose the next tool call.",
  };

  if (error instanceof ToolExecutionError) {
    payload.code = error.code;
    payload.hint = buildToolErrorHint(error);
    if (error.details) {
      payload.details = error.details;
    }
  }

  return {
    ok: false,
    output: JSON.stringify(payload, null, 2),
  };
}

function buildToolErrorHint(error: ToolExecutionError): string {
  if (error.code === "EDIT_NOT_FOUND" || error.code === "EDIT_AMBIGUOUS" || error.code === "EDIT_OVERLAP") {
    return "Read the target area, then retry edit with current oldText/newText and a line hint when useful.";
  }

  if (error.code === "EDIT_UNREADABLE_TEXT") {
    return "The target is not editable text. Use bash to inspect file type or choose a text source.";
  }

  return "Use the error facts to choose the next tool call.";
}

function collectSelectedTools(options: ToolRegistryOptions): Array<{
  source: ToolRegistrySource;
  tool: RegisteredTool;
}> {
  const builtinSource = createToolSource(
    "builtin",
    "builtin:catalog",
    getBuiltinTools().filter(options.builtinToolFilter ?? (() => true)),
  );
  const allSources = [builtinSource, ...(options.sources ?? [])];
  const onlyNames = options.onlyNames ? new Set(options.onlyNames) : null;
  const excludeNames = new Set(options.excludeNames ?? []);
  assertRequestedToolNamesResolved(allSources, onlyNames);

  return allSources.flatMap((source) =>
    source.tools
      .map((tool) => ({
        source,
        tool: applySourceDefaults(source, tool),
      }))
      .filter(({ tool }) => {
        const name = tool.definition.function.name;
        if (onlyNames && !onlyNames.has(name)) {
          return false;
        }

        return !excludeNames.has(name);
      }),
  );
}

function assertRequestedToolNamesResolved(
  sources: readonly ToolRegistrySource[],
  onlyNames: ReadonlySet<string> | null,
): void {
  if (!onlyNames || onlyNames.size === 0) {
    return;
  }

  const available = new Set<string>();
  for (const source of sources) {
    for (const tool of source.tools) {
      available.add(tool.definition.function.name);
    }
  }

  const unresolved = [...onlyNames].filter((name) => !available.has(name)).sort();
  if (unresolved.length > 0) {
    throw new Error(`Requested onlyNames include unregistered tools: ${unresolved.join(", ")}.`);
  }
}

function assertNoDuplicateToolNames(selectedTools: readonly { tool: RegisteredTool }[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const { tool } of selectedTools) {
    const name = tool.definition.function.name;
    if (seen.has(name)) {
      duplicates.add(name);
      continue;
    }
    seen.add(name);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate tools are not allowed: ${[...duplicates].sort().join(", ")}.`);
  }
}

function applySourceDefaults(source: ToolRegistrySource, tool: RegisteredTool): RegisteredTool {
  return {
    ...tool,
    origin: {
      kind: tool.origin?.kind ?? source.kind,
      sourceId: tool.origin?.sourceId ?? source.id,
    },
  };
}

function parseToolArgs(rawArgs: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
