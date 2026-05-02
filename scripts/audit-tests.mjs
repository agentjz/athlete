import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TEST_ROOT = path.join(ROOT, "tests");
const LARGE_FILE_LINES = 450;
const VERY_LARGE_FILE_LINES = 650;
const DETAIL_PATTERNS = [
  {
    id: "exact-output-string",
    pattern: /assert\.(?:equal|strictEqual)\([^,\n]+,\s*["'`][^"'`]{24,}["'`]/g,
    meaning: "exact long string assertion",
  },
  {
    id: "full-object-deep-equal",
    pattern: /assert\.deepEqual\(/g,
    meaning: "full object or ordered collection assertion",
  },
  {
    id: "ui-text-match",
    pattern: /assert\.match\([^,\n]+,\s*\/(?:\[|#|\/help|Runtime Facts|Wake lead|Pending checks|foreground|thinking|tool|result)/gi,
    meaning: "visible text assertion",
  },
  {
    id: "negative-visible-text",
    pattern: /assert\.doesNotMatch\([^,\n]+,\s*\/(?:Objective|Next step|strategy|large body|tool|result|foreground)/gi,
    meaning: "negative visible text assertion",
  },
];

async function main() {
  const files = await listTestFiles(TEST_ROOT);
  const reports = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(ROOT, filePath));
    const lines = content.split(/\r?\n/).length;
    const tests = [...content.matchAll(/\btest\(/g)].length;
    const signals = DETAIL_PATTERNS.map((item) => ({
      id: item.id,
      meaning: item.meaning,
      count: [...content.matchAll(item.pattern)].length,
    })).filter((item) => item.count > 0);

    reports.push({
      path: relativePath,
      lines,
      tests,
      detailSignals: signals,
    });
  }

  const largeFiles = reports
    .filter((item) => item.lines >= LARGE_FILE_LINES)
    .sort((a, b) => b.lines - a.lines);
  const detailHeavy = reports
    .map((item) => ({
      ...item,
      detailCount: item.detailSignals.reduce((sum, signal) => sum + signal.count, 0),
    }))
    .filter((item) => item.detailCount > 0)
    .sort((a, b) => b.detailCount - a.detailCount)
    .slice(0, 20);

  console.log("test audit: completed");
  console.log(`files=${reports.length}`);
  console.log(`large_files=${largeFiles.length}`);
  console.log(`very_large_files=${largeFiles.filter((item) => item.lines >= VERY_LARGE_FILE_LINES).length}`);
  console.log("");
  console.log("largest test files:");
  for (const item of largeFiles.slice(0, 20)) {
    const marker = item.lines >= VERY_LARGE_FILE_LINES ? "review" : "watch";
    console.log(`- ${marker} ${item.lines} lines ${item.path}`);
  }
  console.log("");
  console.log("detail-heavy test files:");
  for (const item of detailHeavy) {
    const summary = item.detailSignals.map((signal) => `${signal.id}=${signal.count}`).join(" ");
    console.log(`- ${item.detailCount} signals ${item.path} (${summary})`);
  }
  console.log("");
  console.log("policy: this is an audit, not a gate. Split or relax tests only when detail locks implementation instead of protecting protocol, state, or visible product structure.");
}

async function listTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
