import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CURRENT_SOURCE_ROOTS = [
  "src/agent",
  "src/context",
  "src/config",
  "src/extensions",
  "src/host",
  "src/interaction",
  "src/observability",
  "src/project",
  "src/provider",
  "src/runtime-ui",
  "src/session",
  "src/shell",
  "src/telegram",
  "src/tools",
  "src/types",
  "src/utils",
  "src/web",
];

const FOUNDATION_TOOLS = ["read", "edit", "write", "bash"];

const CURRENT_TEST_ROOTS = [
  "tests/core",
  "tests/production-line",
];

async function main(): Promise<void> {
  const root = process.cwd();
  const findings: string[] = [];

  for (const sourceRoot of CURRENT_SOURCE_ROOTS) {
    if (!await isDirectory(path.join(root, sourceRoot))) {
      findings.push(`${sourceRoot}: expected source root is missing`);
    }
  }

  for (const testRoot of CURRENT_TEST_ROOTS) {
    if (!await isDirectory(path.join(root, testRoot))) {
      findings.push(`${testRoot}: expected test root is missing`);
    }
  }

  for (const tool of FOUNDATION_TOOLS) {
    const toolFile = `src/tools/${tool}.ts`;
    if (!await isFile(path.join(root, toolFile))) {
      findings.push(`${toolFile}: expected foundation tool file is missing`);
    }
  }

  const toolNames = await readAgentCoreToolNames(root).catch((error: unknown) => {
    findings.push(`src/tools/index.ts: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  });
  if (toolNames.join(",") !== FOUNDATION_TOOLS.join(",")) {
    findings.push(`src/tools/index.ts: foundation tool tuple must be ${FOUNDATION_TOOLS.join(", ")}`);
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
  };

  if (packageJson.bin?.kitty !== "dist/cli.js") {
    findings.push("package.json: kitty binary must point to dist/cli.js");
  }

  const files = packageJson.files ?? [];
  for (const expectedFile of ["dist", "assets/web-workbench", "README.md"]) {
    if (!files.includes(expectedFile)) {
      findings.push(`package.json: published files must include ${expectedFile}`);
    }
  }

  const scripts = packageJson.scripts ?? {};
  for (const expectedScript of ["build", "typecheck", "test:core", "verify:repo-contracts", "verify"]) {
    if (!scripts[expectedScript]) {
      findings.push(`package.json: expected script ${expectedScript} is missing`);
    }
  }

  if (findings.length > 0) {
    console.error("repository contracts: failed");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("repository contracts: passed");
}

async function readAgentCoreToolNames(root: string): Promise<string[]> {
  const content = await fs.readFile(path.join(root, "src/tools/index.ts"), "utf8");
  const match = content.match(/AGENT_CORE_TOOL_NAMES\s*=\s*\[([^\]]+)\]\s*as const/);
  if (!match) {
    throw new Error("AGENT_CORE_TOOL_NAMES must be declared as a literal tuple");
  }
  const tupleBody = match[1] ?? "";
  return [...tupleBody.matchAll(/"([^"]+)"/g)]
    .map((item) => item[1])
    .filter((name): name is string => typeof name === "string");
}

async function isDirectory(target: string): Promise<boolean> {
  return await fs.stat(target).then((stat) => stat.isDirectory(), () => false);
}

async function isFile(target: string): Promise<boolean> {
  return await fs.stat(target).then((stat) => stat.isFile(), () => false);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
