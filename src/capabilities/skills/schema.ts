import path from "node:path";

import {
  SKILL_AGENT_KINDS,
  SKILL_LOAD_MODES,
  SKILL_SCHEMA_VERSION,
} from "./types.js";
import type {
  LoadedSkill,
  SkillAgentKind,
  SkillLoadMode,
  SkillToolConstraints,
  SkillTriggerSet,
} from "./types.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class SkillSchemaError extends Error {
  constructor(
    message: string,
    readonly filePath: string,
  ) {
    super(`${message} (${filePath})`);
    this.name = "SkillSchemaError";
  }
}

export function parseSkillSource(
  text: string,
  options: {
    absolutePath: string;
    rootDir: string;
  },
): LoadedSkill {
  const normalized = text.replace(/^\uFEFF/, "");
  const match = normalized.match(FRONTMATTER_PATTERN);
  const frontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? normalized).trim();
  const metadata = parseSimpleFrontmatter(frontmatter);
  const hasFrontmatter = frontmatter.trim().length > 0;
  const name = readSkillName(metadata, options.absolutePath, hasFrontmatter, options.rootDir);
  const description = readSkillDescription(metadata, body, options.absolutePath);
  const schemaVersion = readSchemaVersion(metadata, options.absolutePath);
  const loadMode = readLoadMode(metadata, options.absolutePath);
  const agentKinds = readAgentKinds(metadata, options.absolutePath);
  const roles = readNormalizedList(metadata.roles);
  const taskTypes = readNormalizedList(metadata.task_types);
  const scenes = readNormalizedList(metadata.scenes);
  const triggers = readTriggers(metadata, options.absolutePath);
  const tools = readToolConstraints(metadata);
  const version = readVersion(metadata.version);

  validateToolConstraints(tools, options.absolutePath);

  return {
    schemaVersion,
    version,
    name,
    description,
    path: path.relative(options.rootDir, options.absolutePath) || "SKILL.md",
    absolutePath: options.absolutePath,
    body,
    loadMode,
    agentKinds,
    roles,
    taskTypes,
    scenes,
    triggers,
    tools,
  };
}

function parseSimpleFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    result[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return result;
}

function readSkillName(
  metadata: Record<string, string>,
  absolutePath: string,
  hasFrontmatter: boolean,
  rootDir: string,
): string {
  const name = metadata.name?.trim();
  if (name) {
    return name;
  }

  if (hasFrontmatter) {
    throw new SkillSchemaError('Skill metadata field "name" is required.', absolutePath);
  }

  const relativeDir = path.relative(rootDir, path.dirname(absolutePath));
  const fallback = relativeDir && relativeDir !== "." ? path.basename(relativeDir) : path.basename(rootDir);
  if (fallback) {
    return fallback;
  }

  throw new SkillSchemaError('Unable to infer skill "name".', absolutePath);
}

function readSkillDescription(
  metadata: Record<string, string>,
  body: string,
  absolutePath: string,
): string {
  const description = metadata.description?.trim() || inferDescription(body);
  if (description) {
    return description;
  }

  throw new SkillSchemaError('Skill metadata field "description" is required.', absolutePath);
}

function readSchemaVersion(metadata: Record<string, string>, absolutePath: string): typeof SKILL_SCHEMA_VERSION {
  const raw = metadata.schema_version?.trim();
  if (!raw || raw === SKILL_SCHEMA_VERSION) {
    return SKILL_SCHEMA_VERSION;
  }

  throw new SkillSchemaError(
    `Unsupported skill schema_version "${raw}". Expected "${SKILL_SCHEMA_VERSION}".`,
    absolutePath,
  );
}

function readLoadMode(metadata: Record<string, string>, absolutePath: string): SkillLoadMode {
  const raw = metadata.load_mode?.trim().toLowerCase();
  if (raw) {
    if ((SKILL_LOAD_MODES as readonly string[]).includes(raw)) {
      return raw as SkillLoadMode;
    }

    throw new SkillSchemaError(`Invalid skill load_mode "${raw}".`, absolutePath);
  }

  if (parseBoolean(metadata.required)) {
    return "required";
  }

  const hasTargetingMetadata = [
    metadata.trigger_keywords,
    metadata.trigger_patterns,
    metadata.triggers,
    metadata.trigger,
    metadata.task_types,
    metadata.scenes,
    metadata.agent_kinds,
    metadata.identity_kinds,
    metadata.roles,
  ].some((value) => typeof value === "string" && value.trim().length > 0);

  return hasTargetingMetadata ? "suggested" : "manual";
}

function readVersion(raw: string | undefined): string {
  const normalized = raw?.trim();
  return normalized && normalized.length > 0 ? normalized : "1.0.0";
}

function readAgentKinds(metadata: Record<string, string>, absolutePath: string): SkillAgentKind[] {
  const values = readNormalizedList(metadata.agent_kinds || metadata.identity_kinds);
  const invalid = values.find(
    (value) => !(SKILL_AGENT_KINDS as readonly string[]).includes(value),
  );
  if (invalid) {
    throw new SkillSchemaError(`Invalid skill agent_kinds value "${invalid}".`, absolutePath);
  }

  return values as SkillAgentKind[];
}

function readTriggers(metadata: Record<string, string>, absolutePath: string): SkillTriggerSet {
  const keywords = readNormalizedList(
    metadata.trigger_keywords || metadata.triggers || metadata.trigger,
  );
  const patterns = readStringList(metadata.trigger_patterns);

  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new SkillSchemaError(`Invalid trigger_patterns entry "${pattern}".`, absolutePath);
    }
  }

  return {
    keywords,
    patterns,
  };
}

function readToolConstraints(metadata: Record<string, string>): SkillToolConstraints {
  return {
    required: readNormalizedList(metadata.required_tools),
    optional: readNormalizedList(metadata.optional_tools),
    incompatible: readNormalizedList(metadata.incompatible_tools),
  };
}

function validateToolConstraints(tools: SkillToolConstraints, absolutePath: string): void {
  const overlaps = [
    { left: "required_tools", right: "optional_tools", values: intersect(tools.required, tools.optional) },
    { left: "required_tools", right: "incompatible_tools", values: intersect(tools.required, tools.incompatible) },
    { left: "optional_tools", right: "incompatible_tools", values: intersect(tools.optional, tools.incompatible) },
  ];

  for (const overlap of overlaps) {
    if (overlap.values.length === 0) {
      continue;
    }

    throw new SkillSchemaError(
      `Skill metadata fields ${overlap.left} and ${overlap.right} cannot overlap: ${overlap.values.join(", ")}`,
      absolutePath,
    );
  }
}

function readStringList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return trimmed
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNormalizedList(raw: string | undefined): string[] {
  return uniqueList(readStringList(raw).map((item) => item.toLowerCase()));
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function inferDescription(body: string): string {
  const firstContentLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  return firstContentLine?.slice(0, 160) ?? "";
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values)];
}
