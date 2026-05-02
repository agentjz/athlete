import { lineNumberAt } from "./files.mjs";

const FORMER_PRIMARY_NAME_PATTERN = new RegExp(
  [
    ["dead", "mouse"].join(""),
    ["Dead", "mouse"].join(""),
    ["DEAD", "MOUSE"].join(""),
    `.${["dead", "mouse"].join("")}`,
  ]
    .map(escapeRegex)
    .join("|"),
  "g",
);

const FORMER_SHORT_NAME_PATTERN = new RegExp(
  [
    "@jun133/" + "w" + "a",
    "\\." + "w" + "a" + "(?![A-Za-z0-9_])",
    "\\b" + "w" + "a" + "\\.",
    "\\b" + "W" + "A" + "_",
    "\\b" + "W" + "A" + "\\b",
    "\\b" + "W" + "a" + "\\b",
    "\\b" + "w" + "a" + "\\b",
  ].join("|"),
  "g",
);

export async function scanKittyNamingResidue({ contents }) {
  const findings = [];
  for (const [file, content] of contents) {
    if (file.startsWith("scripts/repo-contracts/")) {
      continue;
    }
    for (const match of content.matchAll(FORMER_PRIMARY_NAME_PATTERN)) {
      findings.push({
        file,
        line: lineNumberAt(content, match.index ?? 0),
        message: "former primary project name residue found; formal runtime name is kitty.",
      });
    }
    for (const match of content.matchAll(FORMER_SHORT_NAME_PATTERN)) {
      findings.push({
        file,
        line: lineNumberAt(content, match.index ?? 0),
        message: "former short project name residue found; formal runtime name is kitty.",
      });
    }
  }
  return findings;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
