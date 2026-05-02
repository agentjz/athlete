import { lineNumberAt } from "./files.mjs";

export async function scanCapabilityManifestFixtures({ contents }) {
  const findings = [];
  for (const [file, content] of contents) {
    const matches = findManifestObjectLiterals(content);
    for (const match of matches) {
      if (!/\bport\s*:/.test(match.text)) {
        findings.push({
          file,
          line: lineNumberAt(content, match.start),
          message: "capability manifest fixture is missing port; old implicit package entry is forbidden.",
        });
        continue;
      }
      for (const required of ["runner", "permissionBoundary", "foregroundOutput", "artifacts", "closeout", "wake"]) {
        if (!new RegExp(`\\b${required}\\s*:`).test(match.text)) {
          findings.push({
            file,
            line: lineNumberAt(content, match.start),
            message: `capability manifest port is missing ${required}.`,
          });
        }
      }
      if (!/sink\s*:\s*["']runtime-ui["']/.test(match.text)) {
        findings.push({
          file,
          line: lineNumberAt(content, match.start),
          message: "capability manifest foreground output must dock through runtime-ui.",
        });
      }
    }
  }
  return findings;
}

function findManifestObjectLiterals(content) {
  const matches = [];
  const protocolPattern = /protocol\s*:\s*["']kitty\.capability-manifest["']/g;
  for (const match of content.matchAll(protocolPattern)) {
    const protocolIndex = match.index ?? 0;
    const start = content.lastIndexOf("{", protocolIndex);
    if (start < 0) {
      continue;
    }
    const end = findBalancedObjectEnd(content, start);
    if (end >= 0) {
      matches.push({ start, text: content.slice(start, end + 1) });
    }
  }
  return matches;
}

function findBalancedObjectEnd(content, start) {
  let depth = 0;
  let quote;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}
