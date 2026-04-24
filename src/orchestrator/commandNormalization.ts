export function normalizeBackgroundCommand(command: string | undefined): string | undefined {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const nodeEvalMatch = normalized.match(/^node\s+-e\s+(.+)$/i);
  if (!nodeEvalMatch?.[1]) {
    return normalized;
  }

  const script = nodeEvalMatch[1].trim();
  if (!script || /^(["']).*\1$/.test(script)) {
    return normalized;
  }

  return `node -e "${script.replace(/"/g, '\\"')}"`;
}
