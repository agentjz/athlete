import type { ToolExecutionResult } from "../../../types.js";
import { parseArgs } from "./shared.js";
import { validateToolArgumentsContract } from "./toolArgumentContract.js";
import { applyToolArgumentStrictness } from "./toolArgumentStrictness.js";
import { runToolGuards } from "./toolGuards.js";
import { resolveToolExecutionPolicy } from "./toolExecutionPolicy.js";
import type { ToolContext, ToolRegistryEntry } from "./types.js";

export interface PreparedToolExecution {
  policy: ReturnType<typeof resolveToolExecutionPolicy>;
  rawArgs: string;
  argumentStrictness: {
    tier: "L0" | "L1" | "L2";
    unknownArgsStripped: string[];
    warning: boolean;
  };
}

export type ToolPreparation =
  | {
      ok: true;
      prepared: PreparedToolExecution;
    }
  | {
      ok: false;
      prepared: PreparedToolExecution;
      result: ToolExecutionResult;
    };

export async function prepareToolExecution(
  entry: Pick<ToolRegistryEntry, "name" | "governance" | "definition">,
  rawArgs: string,
  context: ToolContext,
): Promise<ToolPreparation> {
  const prepared: PreparedToolExecution = {
    policy: resolveToolExecutionPolicy(entry),
    rawArgs,
    argumentStrictness: {
      tier: "L2",
      unknownArgsStripped: [],
      warning: false,
    },
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = parseArgs(rawArgs);
  } catch (error) {
    return buildInvalidArgumentResult(entry.name, prepared, error);
  }

  const strictness = applyToolArgumentStrictness({
    definition: entry.definition,
    governance: entry.governance,
    args: parsed,
  });
  prepared.rawArgs = strictness.rawArgs;
  prepared.argumentStrictness = {
    tier: strictness.tier,
    unknownArgsStripped: strictness.strippedUnknownPaths,
    warning: strictness.strippedUnknownPaths.length > 0,
  };

  const argumentContract = validateToolArgumentsContract(entry.definition, strictness.args);
  if (!argumentContract.ok) {
    return buildInvalidArgumentResult(entry.name, prepared, argumentContract);
  }

  const blocked = await runToolGuards(entry, strictness.args, context);
  if (blocked) {
    return {
      ok: false,
      prepared,
      result: blocked,
    };
  }

  return {
    ok: true,
    prepared,
  };
}

function buildInvalidArgumentResult(
  toolName: string,
  prepared: PreparedToolExecution,
  error: unknown,
): ToolPreparation {
  const normalized = normalizeArgumentError(error);
  return {
    ok: false,
    prepared,
    result: {
      ok: false,
      output: JSON.stringify(
        {
          ok: false,
          error: normalized.message,
          code: "INVALID_TOOL_ARGUMENTS",
          details: normalized.details,
          hint: `The arguments for ${toolName} were malformed. The tool schema is the active argument contract.`,
        },
        null,
        2,
      ),
    },
  };
}

function normalizeArgumentError(error: unknown): {
  message: string;
  details?: {
    kind: string;
    path?: string;
  };
} {
  if (!error || typeof error !== "object") {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const message = typeof (error as { error?: unknown }).error === "string"
    ? (error as { error: string }).error
    : error instanceof Error
      ? error.message
      : String(error);
  const kind = typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
  const path = typeof (error as { path?: unknown }).path === "string"
    ? (error as { path: string }).path
    : undefined;

  return {
    message,
    details: kind
      ? {
          kind,
          path,
        }
      : undefined,
  };
}
