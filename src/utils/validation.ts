const VALIDATION_PATTERNS: Array<{
  kind: string;
  match: RegExp;
}> = [
  { kind: "node-eval", match: /\bnode(?:\.exe)?\b.*(?:^|\s)(?:-e|--eval)(?:\s|$)/i },
  { kind: "node-test", match: /\bnode(?:\.exe)?\b.*(?:^|\s)--test(?:\s|$)/i },
  { kind: "node-script-check", match: /\bnode(?:\.exe)?\b.*\b[^\s"']*(?:test|spec|verify|verification)[^\s"']*\.(?:[cm]?js|ts)\b/i },
  { kind: "python-inline", match: /\bpython(?:\.exe)?\b.*(?:\s|^)-c\b/i },
  { kind: "typescript", match: /\btsc(?:\.cmd)?\b.*\b--noEmit\b/i },
  { kind: "npm-build", match: /\bnpm(?:\.cmd)?\b.*\brun\s+build\b/i },
  { kind: "npm-test", match: /\bnpm(?:\.cmd)?\b.*\btest\b/i },
  { kind: "pnpm-build", match: /\bpnpm(?:\.cmd)?\b.*\brun\s+build\b/i },
  { kind: "pnpm-test", match: /\bpnpm(?:\.cmd)?\b.*\btest\b/i },
  { kind: "yarn-build", match: /\byarn(?:\.cmd)?\b.*\bbuild\b/i },
  { kind: "yarn-test", match: /\byarn(?:\.cmd)?\b.*\btest\b/i },
  { kind: "pytest", match: /\bpytest\b/i },
  { kind: "go-test", match: /\bgo\b.*\btest\b/i },
  { kind: "cargo-test", match: /\bcargo\b.*\btest\b/i },
];

export function classifyValidationCommand(command: string): string | undefined {
  const normalized = command.trim();
  if (!normalized) {
    return undefined;
  }

  return VALIDATION_PATTERNS.find((entry) => entry.match.test(normalized))?.kind;
}
