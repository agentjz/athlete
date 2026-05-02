import { lineNumberAt, normalizePath } from "./files.mjs";

const RUNTIME_UI_ALLOWED_RAW_TAG_FILES = new Set([
  normalizePath("src/runtime-ui/terminalRenderer.ts"),
  normalizePath("src/runtime-ui/theme.ts"),
  normalizePath("tests/runtime-ui/runtime-ui.test.ts"),
  normalizePath("src/observability/terminalLog.ts"),
  normalizePath("spec/技术实现/T05-宿主与产品面/02-命令行产品面.md"),
]);

export async function scanRuntimeUiStringResidue({ contents }) {
  const findings = [];
  const rawTagPattern = /["'`]\[(?:tool|dispatch|result|preview|content|决策主脑|做梦|工作流|子代理|队友|后台|系统)\]/g;
  for (const [file, content] of contents) {
    if (RUNTIME_UI_ALLOWED_RAW_TAG_FILES.has(file)) {
      continue;
    }
    for (const match of content.matchAll(rawTagPattern)) {
      findings.push({
        file,
        line: lineNumberAt(content, match.index ?? 0),
        message: "raw terminal/runtime UI tag found outside runtime-ui ownership.",
      });
    }
  }
  return findings;
}
