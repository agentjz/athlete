import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SPEC_PATH = path.join(ROOT, "spec", "用户审阅", "capability-ecology.json");
const CATALOG_PATH = path.join(ROOT, "src", "capabilities", "tools", "core", "builtinCatalog.ts");
const README_PATHS = {
  en: path.join(ROOT, "README.md"),
  zh: path.join(ROOT, "README.zh.md"),
};

const START = "<!-- capability-ecology:start -->";
const END = "<!-- capability-ecology:end -->";

async function main() {
  const mode = process.argv.includes("--check") ? "check" : "write";
  const spec = JSON.parse(await fs.readFile(SPEC_PATH, "utf8"));
  const registeredTools = await listRegisteredTools();
  validateSpec(spec, registeredTools);

  const nextByLocale = {
    en: renderCapabilityEcology(spec, "en"),
    zh: renderCapabilityEcology(spec, "zh"),
  };

  let changed = false;
  for (const [locale, filePath] of Object.entries(README_PATHS)) {
    const current = await fs.readFile(filePath, "utf8");
    const next = replaceGeneratedBlock(current, nextByLocale[locale]);
    if (next !== current) {
      changed = true;
      if (mode === "write") {
        await fs.writeFile(filePath, next, "utf8");
      }
    }
  }

  if (mode === "check" && changed) {
    throw new Error("README capability ecology is stale. Run `npm.cmd run sync:readme-capabilities`.");
  }

  console.log(`README capability ecology ${mode === "check" ? "checked" : "synced"} (${registeredTools.size} tools).`);
}

function renderCapabilityEcology(spec, locale) {
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

  const lines = [START, "", `## ${labels.profilesTitle}`, ""];
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
    for (const item of category.items) {
      lines.push(`| ${item.name} | ${item[locale]} | ${item.status} |`);
    }
  }

  for (const category of spec.toolCategories) {
    lines.push("", `### ${category.title[locale]}`, "");
    lines.push(`| ${labels.tool} | ${labels.effect} | ${labels.status} |`);
    lines.push("| --- | --- | --- |");
    for (const tool of category.tools) {
      lines.push(`| \`${tool.name}\` | ${tool[locale]} | ${tool.status} |`);
    }
  }

  lines.push("", END);
  return lines.join("\n");
}

function replaceGeneratedBlock(readme, generated) {
  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);
  if (startIndex >= 0 && endIndex > startIndex) {
    return `${readme.slice(0, startIndex)}${generated}${readme.slice(endIndex + END.length)}`;
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

async function listRegisteredTools() {
  const catalog = await fs.readFile(CATALOG_PATH, "utf8");
  const toolVars = [...catalog.matchAll(/defineBuiltinTool\((\w+)/g)].map((match) => match[1]);
  const imports = new Map();
  for (const match of catalog.matchAll(/import\s+\{\s*([^}]+?)\s*\}\s+from\s+"([^"]+)"/gs)) {
    const source = match[2].replace(/\.js$/, ".ts");
    for (const importedName of match[1].split(",").map((item) => item.trim()).filter(Boolean)) {
      imports.set(importedName, source);
    }
  }

  const tools = new Set();
  const catalogDir = path.dirname(CATALOG_PATH);
  for (const toolVar of toolVars) {
    const source = imports.get(toolVar);
    if (!source) {
      throw new Error(`No import found for registered tool variable: ${toolVar}`);
    }

    const sourcePath = path.resolve(catalogDir, source);
    const sourceText = await fs.readFile(sourcePath, "utf8");
    const nameMatch = sourceText.match(new RegExp(`export\\s+const\\s+${escapeRegExp(toolVar)}[\\s\\S]*?name:\\s*"([^"]+)"`));
    if (!nameMatch) {
      throw new Error(`No tool name found for ${toolVar} in ${path.relative(ROOT, sourcePath)}`);
    }
    tools.add(nameMatch[1]);
  }

  return tools;
}

function validateSpec(spec, registeredTools) {
  assertArray(spec.profiles, "profiles");
  assertArray(spec.capabilityCategories, "capabilityCategories");
  assertArray(spec.toolCategories, "toolCategories");

  const mappedTools = new Set();
  for (const category of spec.toolCategories) {
    assertArray(category.tools, `tool category ${JSON.stringify(category.title)}`);
    for (const tool of category.tools) {
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

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an array.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
