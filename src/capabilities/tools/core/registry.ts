import { getBuiltinTools } from "./builtinCatalog.js";
import { resolveToolRegistryEntries } from "./governance.js";
import { sortToolRegistryEntriesForExposure } from "./order.js";
import { register } from "./shared.js";
import { createToolSource } from "./sources.js";
import { finalizeToolExecution, attachToolExecutionProtocol } from "./toolFinalize.js";
import { prepareToolExecution } from "./toolPrepare.js";
import type { ToolExecutionResult } from "../../../types.js";
import type {
  RegisteredTool,
  ToolRegistry,
  ToolRegistryOptions,
  ToolRegistrySource,
} from "./types.js";

export { createToolSource } from "./sources.js";

export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const selectedTools = collectSelectedTools(options);
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
    async prepare(name, rawArgs, context) {
      const tool = tools.get(name);
      const entry = entries.get(name);
      if (!tool || !entry) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const preparation = await prepareToolExecution(entry, rawArgs, context);
      const preparedCall = {
        name,
        rawArgs: preparation.prepared.rawArgs,
        entry,
        execute: tool.execute,
        prepared: preparation.prepared,
      };

      if (!preparation.ok) {
        return {
          ok: false,
          preparedCall,
          result: preparation.result,
        };
      }

      return {
        ok: true,
        preparedCall,
      };
    },
    async runPrepared(preparedCall, context) {
      return preparedCall.execute(preparedCall.rawArgs, context);
    },
    finalize(preparedCall, result, options) {
      return finalizeToolExecution(preparedCall.entry, result, preparedCall.prepared as never, options);
    },
    async execute(name, rawArgs, context) {
      const preparation = await this.prepare?.(name, rawArgs, context);
      if (!preparation) {
        throw new Error(`Tool preparation is unavailable for ${name}.`);
      }

      if (!preparation.ok) {
        return this.finalize?.(preparation.preparedCall, preparation.result, {
          status: "blocked",
          blockedIn: "prepare",
        }) as ToolExecutionResult;
      }

      try {
        const result = await this.runPrepared?.(preparation.preparedCall, context);
        if (!result) {
          throw new Error(`Prepared tool execution is unavailable for ${name}.`);
        }
        return this.finalize?.(preparation.preparedCall, result, {
          status: result.ok ? "completed" : "failed",
          blockedIn: result.ok ? undefined : "execute",
        }) as ToolExecutionResult;
      } catch (error) {
        return attachToolExecutionProtocol(error, preparation.preparedCall.prepared as never, {
          status: "failed",
          blockedIn: "execute",
        });
      }
    },
    async close() {
      return;
    },
  };
}

function collectSelectedTools(options: ToolRegistryOptions): Array<{
  source: ToolRegistrySource;
  tool: RegisteredTool;
}> {
  const builtinSource = createToolSource("builtin", "builtin:catalog", getBuiltinTools());
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
