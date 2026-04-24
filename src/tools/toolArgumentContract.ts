import type { FunctionToolDefinition } from "./types.js";

interface ValidationSuccess {
  ok: true;
}

interface ValidationFailure {
  ok: false;
  code: "required" | "type" | "enum" | "unknown";
  path: string;
  error: string;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateToolArgumentsContract(
  definition: Pick<FunctionToolDefinition, "function">,
  args: Record<string, unknown>,
): ValidationResult {
  const schema = definition.function.parameters;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { ok: true };
  }

  return validateValue(args, schema as Record<string, unknown>, "$");
}

function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
): ValidationResult {
  const declaredType = schema.type;
  if (Array.isArray(declaredType)) {
    return validateUnionType(value, schema, pointer, declaredType);
  }

  if (typeof declaredType === "string") {
    const typeResult = validateDeclaredType(value, schema, pointer, declaredType);
    if (!typeResult.ok) {
      return typeResult;
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const matches = schema.enum.some((candidate) => Object.is(candidate, value));
    if (!matches) {
      return {
        ok: false,
        code: "enum",
        path: pointer,
        error: `${pointer} must be one of ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(", ")}.`,
      };
    }
  }

  return { ok: true };
}

function validateUnionType(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
  declaredType: unknown[],
): ValidationResult {
  if (declaredType.length === 0) {
    return { ok: true };
  }

  const branchErrors: string[] = [];
  for (const candidate of declaredType) {
    if (typeof candidate !== "string" || !candidate) {
      continue;
    }

    const branchResult = validateDeclaredType(value, schema, pointer, candidate);
    if (branchResult.ok) {
      return { ok: true };
    }

    branchErrors.push(branchResult.error);
  }

  return {
    ok: false,
    code: "type",
    path: pointer,
    error: branchErrors[0] ?? `${pointer} does not match any allowed type.`,
  };
}

function validateDeclaredType(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
  declaredType: string,
): ValidationResult {
  switch (declaredType) {
    case "object":
      return validateObject(value, schema, pointer);
    case "array":
      return validateArray(value, schema, pointer);
    case "string":
      return typeof value === "string"
        ? { ok: true }
        : { ok: false, code: "type", path: pointer, error: `${pointer} must be a string.` };
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? { ok: true }
        : { ok: false, code: "type", path: pointer, error: `${pointer} must be a finite number.` };
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? { ok: true }
        : { ok: false, code: "type", path: pointer, error: `${pointer} must be an integer.` };
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, code: "type", path: pointer, error: `${pointer} must be a boolean.` };
    case "null":
      return value === null
        ? { ok: true }
        : { ok: false, code: "type", path: pointer, error: `${pointer} must be null.` };
    default:
      return { ok: true };
  }
}

function validateObject(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "type",
      path: pointer,
      error: `${pointer} must be an object.`,
    };
  }

  const objectValue = value as Record<string, unknown>;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  for (const field of required) {
    if (!Object.hasOwn(objectValue, field) || objectValue[field] === undefined) {
      return {
        ok: false,
        code: "required",
        path: toChildPointer(pointer, field),
        error: `${toChildPointer(pointer, field)} is required.`,
      };
    }
  }

  const allowAdditionalProperties = schema.additionalProperties !== false;
  for (const [key, childValue] of Object.entries(objectValue)) {
    const childSchema = properties[key];
    if (!childSchema) {
      if (!allowAdditionalProperties) {
        const allowed = Object.keys(properties).sort();
        return {
          ok: false,
          code: "unknown",
          path: toChildPointer(pointer, key),
          error: `${toChildPointer(pointer, key)} is not allowed. Allowed fields: ${allowed.join(", ") || "(none)"}.`,
        };
      }

      continue;
    }

    if (!isRecord(childSchema)) {
      continue;
    }

    const childResult = validateValue(childValue, childSchema, toChildPointer(pointer, key));
    if (!childResult.ok) {
      return childResult;
    }
  }

  return { ok: true };
}

function validateArray(
  value: unknown,
  schema: Record<string, unknown>,
  pointer: string,
): ValidationResult {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      code: "type",
      path: pointer,
      error: `${pointer} must be an array.`,
    };
  }

  if (!isRecord(schema.items)) {
    return { ok: true };
  }

  for (let index = 0; index < value.length; index += 1) {
    const childResult = validateValue(value[index], schema.items, `${pointer}[${index}]`);
    if (!childResult.ok) {
      return childResult;
    }
  }

  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toChildPointer(pointer: string, child: string): string {
  return pointer === "$" ? `$.${child}` : `${pointer}.${child}`;
}
