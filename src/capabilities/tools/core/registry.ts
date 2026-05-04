import { getBuiltinTools } from "./builtinCatalog.js";
import { resolveToolRegistryEntries } from "./governance.js";
import { sortToolRegistryEntriesForExposure } from "./order.js";
import { register } from "./shared.js";
import { createToolSource } from "./sources.js";
import { finalizeToolExecution, attachToolExecutionProtocol } from "./toolFinalize.js";
import { prepareToolExecution } from "./toolPrepare.js";
import type { ToolExecutionResult } from "../../../types.js";
import type {
  PreparedToolRegistryCall,
  RegisteredTool,
  ToolContext,
  ToolRegistry,
  ToolRegistryOptions,
  ToolRegistryPreparation,
  ToolRegistrySource,
} from "./types.js";
import type { PreparedToolExecution } from "./toolPrepare.js";

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

  async function prepare(name: string, rawArgs: string, context: ToolContext): Promise<ToolRegistryPreparation> {
    const tool = tools.get(name);
    const entry = entries.get(name);
    if (!tool || !entry) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const preparation = await prepareToolExecution(entry, rawArgs, context);
    const preparedCall: PreparedToolRegistryCall = {
      name,
      rawArgs: preparation.prepared.rawArgs,
      entry,
      execute: tool.execute,
      prepared: preparation.prepared,
    };

    return preparation.ok
      ? { ok: true, preparedCall }
      : { ok: false, preparedCall, result: preparation.result };
  }

  async function runPrepared(preparedCall: PreparedToolRegistryCall, context: ToolContext): Promise<ToolExecutionResult> {
    return preparedCall.execute(preparedCall.rawArgs, context);
  }

  function finalize(
    preparedCall: PreparedToolRegistryCall,
    result: ToolExecutionResult,
    options?: Parameters<typeof finalizeToolExecution>[3],
  ): ToolExecutionResult {
    return finalizeToolExecution(preparedCall.entry, result, preparedCall.prepared as PreparedToolExecution, options);
  }

  async function execute(name: string, rawArgs: string, context: ToolContext): Promise<ToolExecutionResult> {
    const preparation = await prepare(name, rawArgs, context);

    if (!preparation.ok) {
      return finalize(preparation.preparedCall, preparation.result, {
        status: "blocked",
        blockedIn: "prepare",
      });
    }

    try {
      const result = await runPrepared(preparation.preparedCall, context);
      return finalize(preparation.preparedCall, result, {
        status: result.ok ? "completed" : "failed",
        blockedIn: result.ok ? undefined : "execute",
      });
    } catch (error) {
      return attachToolExecutionProtocol(error, preparation.preparedCall.prepared as PreparedToolExecution, {
        status: "failed",
        blockedIn: "execute",
      });
    }
  }

  return {
    definitions: [...entries.values()].map((entry) => entry.definition),
    entries: [...entries.values()],
    blocked,
    prepare,
    runPrepared,
    finalize,
    execute,
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
