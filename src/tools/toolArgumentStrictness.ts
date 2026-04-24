import type { FunctionToolDefinition, ToolGovernance } from "./types.js";

export type ToolArgumentStrictnessTier = "L0" | "L1" | "L2";

export interface ToolArgumentStrictnessOutcome {
  tier: ToolArgumentStrictnessTier;
  args: Record<string, unknown>;
  rawArgs: string;
  strippedUnknownPaths: string[];
}

export function applyToolArgumentStrictness(input: {
  definition: Pick<FunctionToolDefinition, "function">;
  governance: Pick<ToolGovernance, "mutation" | "risk" | "destructive">;
  args: Record<string, unknown>;
}): ToolArgumentStrictnessOutcome {
  const tier = resolveToolArgumentStrictnessTier(input.governance);
  const schema = readSchema(input.definition);
  if (tier !== "L0" || !schema) {
    return {
      tier,
      args: input.args,
      rawArgs: JSON.stringify(input.args),
      strippedUnknownPaths: [],
    };
  }

  const strippedUnknownPaths: string[] = [];
  const sanitized = sanitizeValue(input.args, schema, "$", strippedUnknownPaths);
  const normalizedArgs = isRecord(sanitized) ? sanitized : input.args;
  return {
    tier,
    args: normalizedArgs,
    rawArgs: JSON.stringify(normalizedArgs),
    strippedUnknownPaths,
  };
}

export function resolveToolArgumentStrictnessTier(
  governance: Pick<ToolGovernance, "mutation" | "risk" | "destructive">,
): ToolArgumentStrictnessTier {
  if (governance.mutation === "write" || governance.risk === "high" || governance.destructive) {
    return "L2";
  }

  if (governance.mutation === "state" && governance.risk === "medium" && governance.destructive === false) {
    return "L1";
  }

  return "L0";
}

function readSchema(
  definition: Pick<FunctionToolDefinition, "function">,
): Record<string, unknown> | null {
  const schema = definition.function.parameters;
  return isRecord(schema) ? schema : null;
}

function sanitizeValue(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
  strippedUnknownPaths: string[],
): unknown {
  if (Array.isArray(value)) {
    if (!isRecord(schema.items)) {
      return value;
    }

    return value.map((item, index) => sanitizeValue(item, schema.items as Record<string, unknown>, `${pointer}[${index}]`, strippedUnknownPaths));
  }

  if (!isRecord(value)) {
    return value;
  }

  return sanitizeObject(value, schema, pointer, strippedUnknownPaths);
}

function sanitizeObject(
  value: Record<string, unknown>,
  schema: Record<string, unknown>,
  pointer: string,
  strippedUnknownPaths: string[],
): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const allowAdditionalProperties = schema.additionalProperties !== false;
  const sanitized: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    const childSchema = properties[key];
    const childPointer = toChildPointer(pointer, key);
    if (!childSchema) {
      if (!allowAdditionalProperties) {
        strippedUnknownPaths.push(childPointer);
        continue;
      }

      sanitized[key] = childValue;
      continue;
    }

    if (!isRecord(childSchema)) {
      sanitized[key] = childValue;
      continue;
    }

    sanitized[key] = sanitizeValue(childValue, childSchema, childPointer, strippedUnknownPaths);
  }

  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toChildPointer(pointer: string, child: string): string {
  return pointer === "$" ? `$.${child}` : `${pointer}.${child}`;
}
