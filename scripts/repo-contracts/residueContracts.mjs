import path from "node:path";

import { exists, lineNumberAt, normalizePath } from "./files.mjs";

export async function scanCapabilityEcosystemResidue({ root }) {
  const findings = [];
  for (const directory of ["skills", "tools", "mcp", "team", "subagent", "workflows"]) {
    const fullPath = path.join(root, "src", directory);
    if (await exists(fullPath)) {
      findings.push({
        file: normalizePath(path.join("src", directory)),
        message: `concrete ecosystem directory must be removed from src/${directory}; use src/capabilities/${directory}.`,
      });
    }
  }
  return findings;
}

export async function scanLegacyPackageResidue({ contents }) {
  const findings = [];
  const patterns = [
    {
      pattern: /\bimplicit (?:capability )?package\b/i,
      message: "implicit capability package wording preserves a deleted path.",
    },
    {
      pattern: /\blegacy (?:capability|package|manifest|port|runner|workflow|tool|runtime-ui)\b/i,
      message: "legacy compatibility wording found in formal source; delete or rewrite as current truth.",
    },
    {
      pattern: /\bcompat(?:ibility|ible)? (?:adapter|alias|branch|fallback|layer|mode|path|shim|wrapper)\b/i,
      message: "compatibility shim wording found in formal source; Kitty does not keep old paths alive.",
    },
  ];
  for (const [file, content] of contents) {
    if (file.startsWith("scripts/repo-contracts/")) {
      continue;
    }
    for (const item of patterns) {
      const match = item.pattern.exec(content);
      if (match) {
        findings.push({
          file,
          line: lineNumberAt(content, match.index),
          message: item.message,
        });
      }
    }
  }
  return findings;
}
