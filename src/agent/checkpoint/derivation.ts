import type { ExternalizedToolResultReference, SessionCheckpointArtifact, SessionCheckpointToolBatch, SessionRecord, StoredMessage } from "../../types.js";
import { MAX_BATCH_PATHS, MAX_BATCH_TOOLS, MAX_COMPLETED_STEPS, MAX_LABEL_CHARS, MAX_PREVIEW_CHARS, MAX_SUMMARY_CHARS, normalizeArtifacts, normalizeText, normalizeTimestamp, oneLine, readString, safeParseObject, takeLastUnique, truncate } from "./shared.js";

export function deriveCompletedSteps(session: SessionRecord): string[] {
  const completedTodos = (session.todoItems ?? [])
    .filter((item) => item.status === "completed")
    .map((item) => normalizeText(item.text))
    .filter(Boolean) as string[];
  if (completedTodos.length > 0) {
    return takeLastUnique(completedTodos, MAX_COMPLETED_STEPS);
  }
  const completedActions = session.taskState?.completedActions ?? [];
  return takeLastUnique(completedActions, MAX_COMPLETED_STEPS);
}

export function deriveRecentToolBatchFromMessages(
  messages: StoredMessage[],
  timestamp: string,
): SessionCheckpointToolBatch | undefined {
  let lastToolIndex = messages.length - 1;
  while (lastToolIndex >= 0 && messages[lastToolIndex]?.role !== "tool") {
    lastToolIndex -= 1;
  }

  if (lastToolIndex < 0) {
    return undefined;
  }
  let startIndex = lastToolIndex;
  while (startIndex >= 0 && messages[startIndex]?.role === "tool") {
    startIndex -= 1;
  }

  const toolMessages = messages
    .slice(startIndex + 1, lastToolIndex + 1)
    .filter((message) => message.role === "tool");
  const toolNames = toolMessages
    .map((message) => normalizeText(message.name))
    .filter(Boolean) as string[];

  return buildToolBatch(toolNames, toolMessages, undefined, timestamp);
}

export function buildToolBatch(
  toolNames: string[],
  toolMessages: StoredMessage[],
  changedPaths: string[] | undefined,
  timestamp: string,
): SessionCheckpointToolBatch | undefined {
  const tools = takeLastUnique(toolNames, MAX_BATCH_TOOLS);
  if (tools.length === 0) {
    return undefined;
  }
  const artifacts = normalizeArtifacts(
    toolMessages.flatMap((message) => createArtifactsFromMessage(message)),
  );
  const batchChangedPaths = takeLastUnique(
    [
      ...(changedPaths ?? []),
      ...toolMessages
        .map((message) => readPathFromMessage(message))
        .filter(Boolean) as string[],
    ],
    MAX_BATCH_PATHS,
  );
  const recordedAt = normalizeTimestamp(
    toolMessages[toolMessages.length - 1]?.createdAt,
    timestamp,
  );

  return {
    tools,
    summary: buildToolBatchSummary(tools, batchChangedPaths, artifacts),
    changedPaths: batchChangedPaths,
    artifacts,
    recordedAt,
  };
}

function createArtifactsFromMessage(message: StoredMessage): SessionCheckpointArtifact[] {
  const payload = safeParseObject(message.content);
  const artifacts: SessionCheckpointArtifact[] = [];

  const externalized = message.externalizedToolResult ?? readExternalizedResult(payload);
  if (externalized) {
    artifacts.push({
      kind: "externalized_tool_result",
      label: buildArtifactLabel(message.name, payload, externalized.storagePath),
      toolName: normalizeText(message.name) || undefined,
      path: readString(payload?.path),
      storagePath: externalized.storagePath,
      preview: truncate(readString(payload?.preview) ?? externalized.preview, MAX_PREVIEW_CHARS),
      summary: truncate(readString(payload?.summary), MAX_SUMMARY_CHARS),
      sha256: externalized.sha256,
    });
  } else if (payload && (readString(payload.preview) || readString(payload.path))) {
    artifacts.push({
      kind: "tool_preview",
      label: buildArtifactLabel(message.name, payload, readString(payload.path)),
      toolName: normalizeText(message.name) || undefined,
      path: readString(payload.path),
      preview: truncate(readString(payload.preview), MAX_PREVIEW_CHARS),
      summary: truncate(readString(payload.summary), MAX_SUMMARY_CHARS),
    });
  }

  return artifacts;
}

function readPathFromMessage(message: StoredMessage): string | undefined {
  const payload = safeParseObject(message.content);
  return readString(payload?.path) ?? readString(payload?.requestedPath);
}

function buildToolBatchSummary(
  toolNames: string[],
  changedPaths: string[],
  artifacts: SessionCheckpointArtifact[],
): string {
  const fragments = [`Ran ${toolNames.join(", ")}`];

  if (changedPaths.length > 0) {
    fragments.push(`changed ${changedPaths.join(" | ")}`);
  }
  if (artifacts.length > 0) {
    fragments.push(`artifacts ${artifacts.map((artifact) => artifact.label).join(" | ")}`);
  }
  return truncate(fragments.join("; "), MAX_SUMMARY_CHARS)!;
}

function buildArtifactLabel(
  toolName: string | undefined,
  payload: Record<string, unknown> | null,
  fallbackPath: string | undefined,
): string {
  const primary =
    readString(payload?.path) ??
    readString(payload?.title) ??
    readString(payload?.summary) ??
    fallbackPath ??
    toolName ??
    "tool artifact";

  return truncate(oneLine(primary), MAX_LABEL_CHARS)!;
}

function readExternalizedResult(
  payload: Record<string, unknown> | null,
): ExternalizedToolResultReference | undefined {
  if (!payload) {
    return undefined;
  }
  const storagePath = readString(payload.storagePath);
  if (!storagePath) {
    return undefined;
  }

  return {
    scope: "project_state_root",
    storagePath,
    byteLength:
      typeof payload.byteLength === "number" && Number.isFinite(payload.byteLength)
        ? Math.trunc(payload.byteLength)
        : 0,
    charLength:
      typeof payload.charLength === "number" && Number.isFinite(payload.charLength)
        ? Math.trunc(payload.charLength)
        : 0,
    preview: readString(payload.preview) ?? "",
    sha256: readString(payload.sha256) ?? "",
  };
}
