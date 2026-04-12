import type { AgentMode } from "../types.js";
import { getBuiltinToolsForMode } from "./builtinCatalog.js";
import { resolveToolRegistryEntries, validateToolExecutionResult } from "./governance.js";
import { sortToolRegistryEntriesForExposure } from "./order.js";
import { register } from "./shared.js";
import { createToolSource } from "./sources.js";
import type {
  RegisteredTool,
  ToolRegistry,
  ToolRegistryOptions,
  ToolRegistrySource,
} from "./types.js";

export { createToolSource } from "./sources.js";

export function createToolRegistry(mode: AgentMode, options: ToolRegistryOptions = {}): ToolRegistry {
  const selectedTools = collectSelectedTools(mode, options);
  assertNoDuplicateToolNames(selectedTools);
  const { entries: rawEntries, blocked } = resolveToolRegistryEntries(selectedTools.map((entry) => entry.tool));
  const resolved = sortToolRegistryEntriesForExposure(rawEntries);
  const tools = new Map<string, RegisteredTool>();
  const entries = new Map<string, (typeof resolved)[number]>();

  for (const entry of resolved) {
    register(tools, entry.tool);
    entries.set(entry.name, entry);
  }

  return {
    definitions: [...entries.values()].map((entry) => entry.definition),
    entries: [...entries.values()],
    blocked,
    async execute(name, rawArgs, context) {
      const tool = tools.get(name);
      const entry = entries.get(name);
      if (!tool || !entry) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = await tool.execute(rawArgs, context);
      return validateToolExecutionResult(entry, result);
    },
    async close() {
      return;
    },
  };
}

function collectSelectedTools(
  mode: AgentMode,
  options: ToolRegistryOptions,
): Array<{
  source: ToolRegistrySource;
  tool: RegisteredTool;
}> {
  const builtinSource = createToolSource("builtin", "builtin:catalog", getBuiltinToolsForMode(mode));
  const allSources = [builtinSource, ...(options.sources ?? [])];
  const onlyNames = options.onlyNames ? new Set(options.onlyNames) : null;
  const excludeNames = new Set(options.excludeNames ?? []);

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

function applySourceDefaults(source: ToolRegistrySource, tool: RegisteredTool): RegisteredTool {
  return {
    ...tool,
    governance: tool.governance
      ? {
          ...tool.governance,
          source: tool.governance.source ?? source.kind,
        }
      : undefined,
    origin: {
      kind: tool.origin?.kind ?? source.kind,
      sourceId: tool.origin?.sourceId ?? source.id,
      serverName: tool.origin?.serverName,
      toolName: tool.origin?.toolName,
      readOnlyHint: tool.origin?.readOnlyHint,
    },
  };
}

function assertNoDuplicateToolNames(
  tools: Array<{
    source: ToolRegistrySource;
    tool: RegisteredTool;
  }>,
): void {
  const seen = new Map<string, string>();

  for (const entry of tools) {
    const name = entry.tool.definition.function.name;
    const sourceLabel = `${entry.source.kind}:${entry.source.id}`;
    const existing = seen.get(name);
    if (existing) {
      throw new Error(`Duplicate tool registration detected for ${name}: ${existing} and ${sourceLabel}.`);
    }

    seen.set(name, sourceLabel);
  }
}
