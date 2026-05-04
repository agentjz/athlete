import fs from "node:fs/promises";
import path from "node:path";

export const CAPABILITY_ECOLOGY_START = "<!-- capability-ecology:start -->";
export const CAPABILITY_ECOLOGY_END = "<!-- capability-ecology:end -->";

type Locale = "en" | "zh";

interface LocalizedText {
  en: string;
  zh: string;
}

interface CapabilityEcologyProfile extends LocalizedText {
  id: string;
  status: string;
}

interface CapabilityEcologyItem extends LocalizedText {
  name: string;
  status: string;
}

interface CapabilityEcologyTool extends LocalizedText {
  name: string;
  status: string;
  live?: {
    group?: string;
    enabled?: boolean;
    skipReason?: string;
  };
}

interface CapabilityEcologyCategory<T> {
  title: LocalizedText;
  items?: T[];
  tools?: T[];
}

interface CapabilityEcologySpec {
  profiles: CapabilityEcologyProfile[];
  capabilityCategories: Array<CapabilityEcologyCategory<CapabilityEcologyItem>>;
  toolCategories: Array<CapabilityEcologyCategory<CapabilityEcologyTool>>;
}

interface SyncReadmeCapabilitiesOptions {
  check?: boolean;
}

interface SyncReadmeCapabilitiesResult {
  mode: "check" | "write";
  registeredToolCount: number;
  staleFiles: string[];
}

const README_FILES: Record<Locale, string> = {
  en: "README.en.md",
  zh: "README.md",
};

export async function syncReadmeCapabilities(
  root: string,
  options: SyncReadmeCapabilitiesOptions = {},
): Promise<SyncReadmeCapabilitiesResult> {
  const mode = options.check ? "check" : "write";
  const spec = await readCapabilityEcologySpec(root);
  const registeredTools = await listRegisteredTools(root);
  validateCapabilityEcologySpec(spec, registeredTools);

  const generatedByLocale: Record<Locale, string> = {
    en: renderCapabilityEcology(spec, "en"),
    zh: renderCapabilityEcology(spec, "zh"),
  };

  const staleFiles: string[] = [];
  for (const [locale, relativePath] of Object.entries(README_FILES)) {
    const filePath = path.join(root, relativePath);
    const current = await fs.readFile(filePath, "utf8");
    const next = replaceGeneratedBlock(current, generatedByLocale[locale as Locale]);
    if (next !== current) {
      staleFiles.push(relativePath);
      if (mode === "write") {
        await fs.writeFile(filePath, next, "utf8");
      }
    }
  }

  return {
    mode,
    registeredToolCount: registeredTools.size,
    staleFiles,
  };
}

export async function readCapabilityEcologySpec(root: string): Promise<CapabilityEcologySpec> {
  const specPath = path.join(root, "spec", "capability-ecology.json");
  return parseCapabilityEcologySpec(JSON.parse(await fs.readFile(specPath, "utf8")));
}

export async function listRegisteredTools(root: string): Promise<Set<string>> {
  const catalogPath = path.join(root, "src", "capabilities", "tools", "core", "builtinCatalog.ts");
  const catalog = await fs.readFile(catalogPath, "utf8");
  const toolVars = [...catalog.matchAll(/defineBuiltinTool\((\w+)/g)]
    .map((match) => match[1])
    .filter((value): value is string => typeof value === "string");
  const imports = new Map<string, string>();

  for (const match of catalog.matchAll(/import\s+\{\s*([^}]+?)\s*\}\s+from\s+"([^"]+)"/gs)) {
    const importedNames = match[1];
    const importedSource = match[2];
    if (!importedNames || !importedSource) {
      continue;
    }

    const source = importedSource.replace(/\.js$/, ".ts");
    for (const importedName of importedNames.split(",").map((item) => item.trim()).filter(Boolean)) {
      imports.set(importedName, source);
    }
  }

  const tools = new Set<string>();
  const catalogDir = path.dirname(catalogPath);
  for (const toolVar of toolVars) {
    const source = imports.get(toolVar);
    if (!source) {
      throw new Error(`No import found for registered tool variable: ${toolVar}`);
    }

    const sourcePath = path.resolve(catalogDir, source);
    const sourceText = await fs.readFile(sourcePath, "utf8");
    const nameMatch = sourceText.match(new RegExp(`export\\s+const\\s+${escapeRegExp(toolVar)}[\\s\\S]*?name:\\s*"([^"]+)"`));
    const toolName = nameMatch?.[1];
    if (!toolName) {
      throw new Error(`No tool name found for ${toolVar} in ${path.relative(root, sourcePath)}`);
    }

    tools.add(toolName);
  }

  return tools;
}

export function validateCapabilityEcologySpec(spec: CapabilityEcologySpec, registeredTools: Set<string>): void {
  assertArray(spec.profiles, "profiles");
  assertArray(spec.capabilityCategories, "capabilityCategories");
  assertArray(spec.toolCategories, "toolCategories");

  const mappedTools = new Set<string>();
  for (const category of spec.toolCategories) {
    assertArray(category.tools, `tool category ${JSON.stringify(category.title)}`);
    for (const tool of category.tools ?? []) {
      if (mappedTools.has(tool.name)) {
        throw new Error(`Duplicate README tool mapping: ${tool.name}`);
      }
      mappedTools.add(tool.name);
    }
  }

  const missingFromSpec = [...registeredTools].filter((tool) => !mappedTools.has(tool)).sort();
  const unknownInSpec = [...mappedTools].filter((tool) => !registeredTools.has(tool)).sort();
  if (missingFromSpec.length > 0 || unknownInSpec.length > 0) {
    const details = [
      missingFromSpec.length > 0 ? `missing from spec: ${missingFromSpec.join(", ")}` : "",
      unknownInSpec.length > 0 ? `unknown in runtime catalog: ${unknownInSpec.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    throw new Error(`Capability ecology tool mapping is out of sync.\n${details}`);
  }
}

function renderCapabilityEcology(spec: CapabilityEcologySpec, locale: Locale): string {
  const labels = locale === "zh"
    ? {
        profilesTitle: "内置人格",
        profile: "Profile",
        effect: "作用",
        status: "状态",
        ecologyTitle: "能力生态",
        capability: "能力",
        tool: "工具",
      }
    : {
        profilesTitle: "Built-in Profiles",
        profile: "Profile",
        effect: "What it does",
        status: "Status",
        ecologyTitle: "Capability Ecology",
        capability: "Capability",
        tool: "Tool",
      };

  const lines = [CAPABILITY_ECOLOGY_START, "", `## ${labels.profilesTitle}`, ""];
  lines.push(`| ${labels.profile} | ${labels.effect} | ${labels.status} |`);
  lines.push("| --- | --- | --- |");
  for (const profile of spec.profiles) {
    lines.push(`| \`${profile.id}\` | ${profile[locale]} | ${profile.status} |`);
  }

  lines.push("", `## ${labels.ecologyTitle}`);
  for (const category of spec.capabilityCategories) {
    lines.push("", `### ${category.title[locale]}`, "");
    lines.push(`| ${labels.capability} | ${labels.effect} | ${labels.status} |`);
    lines.push("| --- | --- | --- |");
    for (const item of category.items ?? []) {
      lines.push(`| ${item.name} | ${item[locale]} | ${item.status} |`);
    }
  }

  for (const category of spec.toolCategories) {
    lines.push("", `### ${category.title[locale]}`, "");
    lines.push(`| ${labels.tool} | ${labels.effect} | ${labels.status} |`);
    lines.push("| --- | --- | --- |");
    for (const tool of category.tools ?? []) {
      lines.push(`| \`${tool.name}\` | ${tool[locale]} | ${tool.status} |`);
    }
  }

  lines.push("", CAPABILITY_ECOLOGY_END);
  return lines.join("\n");
}

function replaceGeneratedBlock(readme: string, generated: string): string {
  const startIndex = readme.indexOf(CAPABILITY_ECOLOGY_START);
  const endIndex = readme.indexOf(CAPABILITY_ECOLOGY_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    return `${readme.slice(0, startIndex)}${generated}${readme.slice(endIndex + CAPABILITY_ECOLOGY_END.length)}`;
  }

  const releaseHeading = readme.match(/\n## (Release Guide|发布指引)\n/);
  if (!releaseHeading?.index) {
    throw new Error("README release guide heading not found.");
  }

  const generatedSectionMatch = readme.match(/\n## (Built-in Profiles|内置人格)\n/);
  if (generatedSectionMatch?.index !== undefined) {
    const frontMatter = readme.slice(0, generatedSectionMatch.index).trimEnd();
    const release = readme.slice(releaseHeading.index).trimStart();
    return `${frontMatter}\n\n${generated}\n\n${release}`;
  }

  const frontMatter = readme.slice(0, releaseHeading.index).trimEnd();
  const release = readme.slice(releaseHeading.index).trimStart();
  return `${frontMatter}\n\n${generated}\n\n${release}`;
}

function parseCapabilityEcologySpec(value: unknown): CapabilityEcologySpec {
  if (!value || typeof value !== "object") {
    throw new Error("Capability ecology spec must be an object.");
  }

  const spec = value as Partial<CapabilityEcologySpec>;
  assertArray(spec.profiles, "profiles");
  assertArray(spec.capabilityCategories, "capabilityCategories");
  assertArray(spec.toolCategories, "toolCategories");
  return {
    profiles: spec.profiles as CapabilityEcologyProfile[],
    capabilityCategories: spec.capabilityCategories as Array<CapabilityEcologyCategory<CapabilityEcologyItem>>,
    toolCategories: spec.toolCategories as Array<CapabilityEcologyCategory<CapabilityEcologyTool>>,
  };
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an array.`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
