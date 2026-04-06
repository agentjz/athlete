export interface TemplateRenderResult {
  content: string;
  usedKeys: string[];
  missingKeys: string[];
}

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function extractTemplateVariables(content: string): string[] {
  const variables = new Set<string>();

  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const key = (match[1] ?? "").trim();
    if (key) {
      variables.add(key);
    }
  }

  return [...variables];
}

export function applyTemplateVariables(
  content: string,
  variables: Record<string, unknown>,
): TemplateRenderResult {
  const usedKeys = new Set<string>();
  const missingKeys = new Set<string>();

  const rendered = content.replace(PLACEHOLDER_PATTERN, (placeholder, rawKey: string) => {
    const key = rawKey.trim();
    const value = resolveVariableValue(variables, key);

    if (value === undefined) {
      missingKeys.add(key);
      return placeholder;
    }

    usedKeys.add(key);
    return value;
  });

  return {
    content: rendered,
    usedKeys: [...usedKeys],
    missingKeys: [...missingKeys],
  };
}

function resolveVariableValue(variables: Record<string, unknown>, key: string): string | undefined {
  const direct = normalizeScalar(variables[key]);
  if (direct !== undefined) {
    return direct;
  }

  const path = key.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (path.length === 0) {
    return undefined;
  }

  let current: unknown = variables;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return normalizeScalar(current);
}

function normalizeScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}
