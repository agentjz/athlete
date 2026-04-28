const PRIMARY_PREVIEW_KEYS = ["preview", "markdownPreview", "content", "output"] as const;

export function compactToolPayload(toolName: string | undefined, raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fragments: string[] = [];

      pushFragment(fragments, "ok", readScalar(parsed.ok));
      pushFragment(fragments, "tool", readScalar(parsed.tool));
      pushFragment(fragments, "externalized", readBooleanFlag(parsed.externalized));
      pushFragment(fragments, "storagePath", readScalar(parsed.storagePath));
      pushFragment(fragments, "path", readScalar(parsed.path));
      pushFragment(fragments, "requestedPath", readScalar(parsed.requestedPath));
      pushFragment(fragments, "format", readScalar(parsed.format));
      pushFragment(fragments, "title", readScalar(parsed.title));
      pushFragment(fragments, "readable", readScalar(parsed.readable));
      pushFragment(fragments, "reason", readScalar(parsed.reason));
      pushFragment(fragments, "action", readScalar(parsed.action));
      pushFragment(fragments, "suggestedTool", readScalar(parsed.suggestedTool));
      pushFragment(fragments, "suggestedPath", readScalar(parsed.suggestedPath));
      pushFragment(fragments, "code", readScalar(parsed.code));
      pushFragment(fragments, "error", readScalar(parsed.error));
      pushFragment(fragments, "hint", readScalar(parsed.hint));
      pushFragment(fragments, "entries", readCollectionCount(parsed.entries) ?? readScalar(parsed.entriesCount));
      pushFragment(fragments, "matches", readCollectionCount(parsed.matches) ?? readScalar(parsed.matchesCount));
      pushFragment(fragments, "sheets", readCollectionCount(parsed.sheets) ?? readScalar(parsed.sheetsCount));
      pushFragment(fragments, "searched", readScalar(parsed.searched));
      pushFragment(fragments, "total", readScalar(parsed.total));
      pushFragment(fragments, "bytes", readScalar(parsed.bytes) ?? readScalar(parsed.byteLength));
      pushFragment(fragments, "chars", readScalar(parsed.chars) ?? readScalar(parsed.charLength));
      pushFragment(fragments, "changeId", readScalar(parsed.changeId));
      pushFragment(fragments, "undoneChangeId", readScalar(parsed.undoneChangeId));
      pushFragment(fragments, "changeHistoryWarning", readScalar(parsed.changeHistoryWarning));
      pushFragment(fragments, "exitCode", readScalar(parsed.exitCode));
      pushFragment(fragments, "jobId", readScalar(parsed.jobId));
      pushFragment(fragments, "jobStatus", readScalar(parsed.jobStatus));
      pushFragment(fragments, "taskId", readScalar(parsed.taskId));
      pushFragment(fragments, "task", readScalar(parsed.task));
      pushFragment(fragments, "member", readScalar(parsed.member));
      pushFragment(fragments, "worktree", readScalar(parsed.worktree));
      pushFragment(fragments, "tasks", readCollectionCount(parsed.tasks));
      pushFragment(fragments, "members", readCollectionCount(parsed.members));
      pushFragment(fragments, "messages", readCollectionCount(parsed.messages));
      pushFragment(fragments, "jobs", readCollectionCount(parsed.jobs));
      pushFragment(fragments, "events", readCollectionCount(parsed.events));
      pushFragment(fragments, "worktrees", readCollectionCount(parsed.worktrees));
      pushFragment(fragments, "summary", truncate(oneLine(readScalar(parsed.summary) ?? ""), 120));
      pushFragment(fragments, "preview", truncate(oneLine(readScalar(parsed.preview) ?? ""), 120));
      pushFragment(fragments, "content", truncate(oneLine(readScalar(parsed.content) ?? ""), 120));
      pushFragment(fragments, "restoredPaths", readCollectionCount(parsed.restoredPaths));

      const summary = fragments.filter(Boolean).join("; ");
      if (summary.length > 0) {
        return truncate(summary, maxChars);
      }
    }
  } catch {
    if (toolName && raw.trim().startsWith("[")) {
      return truncate(`${toolName} returned structured array data`, maxChars);
    }
  }

  return truncate(oneLine(raw), maxChars);
}

export function buildToolPayloadPreview(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return truncate(parsed.slice(0, 6).map((item) => oneLine(JSON.stringify(item))).join("\n"), maxChars);
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;

      const matchesPreview = formatMatchesPreview(record.matches);
      if (matchesPreview) {
        return truncate(matchesPreview, maxChars);
      }

      const entriesPreview = formatEntriesPreview(record.entries);
      if (entriesPreview) {
        return truncate(entriesPreview, maxChars);
      }

      for (const key of PRIMARY_PREVIEW_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return truncate(normalizeBlock(value), maxChars);
        }
      }

      const objectPreview = oneLine(JSON.stringify(record));
      if (objectPreview.length > 0) {
        return truncate(objectPreview, maxChars);
      }
    }
  } catch {
    // fall through
  }

  return truncate(normalizeBlock(raw), maxChars);
}

export function compactToolPayloadForTransport(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.storagePath === "string") {
      const compacted: Record<string, unknown> = {};

      copyScalar(compacted, parsed, "externalized");
      copyScalar(compacted, parsed, "tool");
      copyScalar(compacted, parsed, "storagePath");
      copyScalar(compacted, parsed, "byteLength");
      copyScalar(compacted, parsed, "charLength");
      copyScalar(compacted, parsed, "ok");
      copyScalar(compacted, parsed, "path");
      copyScalar(compacted, parsed, "requestedPath");
      copyScalar(compacted, parsed, "format");
      copyScalar(compacted, parsed, "title");
      copyScalar(compacted, parsed, "entriesCount");
      copyScalar(compacted, parsed, "matchesCount");
      copyScalar(compacted, parsed, "sheetsCount");
      copyScalar(compacted, parsed, "searched");
      copyScalar(compacted, parsed, "total");
      copyScalar(compacted, parsed, "jobId");
      copyScalar(compacted, parsed, "jobStatus");
      copyScalar(compacted, parsed, "taskId");
      copyScalar(compacted, parsed, "task");
      copyScalar(compacted, parsed, "member");
      copyScalar(compacted, parsed, "worktree");
      copyScalar(compacted, parsed, "sha256");

      const summary = readScalar(parsed.summary);
      if (summary) {
        compacted.summary = truncate(oneLine(summary), Math.max(120, Math.floor(maxChars * 0.35)));
      }

      const preview = readScalar(parsed.preview);
      if (preview) {
        compacted.preview = truncate(normalizeBlock(preview), Math.max(80, Math.floor(maxChars * 0.35)));
      }

      let compactedJson = JSON.stringify(compacted, null, 2);
      if (compactedJson.length <= maxChars) {
        return compactedJson;
      }

      delete compacted.preview;
      compactedJson = JSON.stringify(compacted, null, 2);
      if (compactedJson.length <= maxChars) {
        return compactedJson;
      }

      delete compacted.summary;
      compactedJson = JSON.stringify(compacted, null, 2);
      if (compactedJson.length <= maxChars) {
        return compactedJson;
      }

      return JSON.stringify(
        {
          externalized: parsed.externalized === true,
          storagePath: parsed.storagePath,
          summary: truncate(oneLine(readScalar(parsed.summary) ?? ""), Math.max(48, maxChars - 80)),
        },
        null,
        2,
      );
    }
  } catch {
    // fall back to a plain-text summary
  }

  return compactToolPayload(undefined, raw, maxChars);
}

function formatMatchesPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 6)
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const targetPath = readScalar(record.path);
      const line = typeof record.line === "number" ? Math.trunc(record.line) : undefined;
      const text = readScalar(record.text);
      if (!targetPath && !text) {
        return null;
      }

      return `${targetPath ?? "(match)"}${line ? `:${line}` : ""} ${text ?? ""}`.trim();
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatEntriesPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 10)
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const targetPath = readScalar(record.path);
      const type = readScalar(record.type);
      if (!targetPath) {
        return null;
      }

      return type ? `${type} ${targetPath}` : targetPath;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function normalizeBlock(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

function readScalar(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function readBooleanFlag(value: unknown): string | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }

  return value ? "true" : "false";
}

function readCollectionCount(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return String(value.length);
}

function pushFragment(fragments: string[], key: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  fragments.push(`${key}=${value}`);
}

function copyScalar(target: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  const value = source[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    target[key] = value;
  }
}
