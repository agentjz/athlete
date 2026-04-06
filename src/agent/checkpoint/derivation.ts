import { isVerificationRequired } from "../verificationState.js";
import type { ExternalizedToolResultReference, SessionCheckpoint, SessionCheckpointArtifact, SessionCheckpointToolBatch, SessionRecord, StoredMessage } from "../../types.js";
import { displayPath, MAX_ARTIFACTS, MAX_BATCH_PATHS, MAX_BATCH_TOOLS, MAX_COMPLETED_STEPS, MAX_LABEL_CHARS, MAX_PREVIEW_CHARS, MAX_SUMMARY_CHARS, normalizeArtifacts, normalizeText, normalizeTimestamp, oneLine, readString, safeParseObject, takeLastUnique, truncate } from "./shared.js";

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

export function deriveCurrentStep(
  session: SessionRecord,
  checkpoint: Pick<SessionCheckpoint, "status" | "recentToolBatch" | "flow" | "nextStep">,
): string | undefined {
  if (checkpoint.status === "completed") {
    return undefined;
  }

  const inProgressTodo = (session.todoItems ?? []).find((item) => item.status === "in_progress");
  if (inProgressTodo?.text) {
    return normalizeText(inProgressTodo.text) || undefined;
  }
  if (checkpoint.flow.phase === "recovery") {
    return checkpoint.nextStep ?? "Recover the next unresolved step from the latest checkpoint.";
  }
  if (checkpoint.recentToolBatch?.summary) {
    return checkpoint.recentToolBatch.summary;
  }
  const firstPlannedAction = session.taskState?.plannedActions?.[0];
  return normalizeText(firstPlannedAction) || undefined;
}

export function deriveNextStep(
  session: SessionRecord,
  checkpoint: Pick<SessionCheckpoint, "status" | "recentToolBatch" | "completedSteps">,
): string | undefined {
  if (checkpoint.status === "completed") {
    return undefined;
  }

  const pendingTodo = (session.todoItems ?? []).find((item) => item.status === "pending");
  if (pendingTodo?.text) {
    return normalizeText(pendingTodo.text) || undefined;
  }
  if (isVerificationRequired(session.verificationState) && (session.verificationState?.pendingPaths?.length ?? 0) > 0) {
    return `Run targeted verification for ${session.verificationState?.pendingPaths?.slice(0, 3).join(" | ")}`;
  }

  const completedSet = new Set((checkpoint.completedSteps ?? []).map((step) => step.toLowerCase()));
  const firstPlannedAction = (session.taskState?.plannedActions ?? []).find((action) => {
    const normalized = normalizeText(action);
    return normalized && !completedSet.has(normalized.toLowerCase());
  });
  if (firstPlannedAction) {
    return normalizeText(firstPlannedAction) || undefined;
  }
  if ((checkpoint.recentToolBatch?.artifacts.length ?? 0) > 0) {
    return "Use the stored artifact previews from the recent tool batch before rereading full outputs.";
  }
  if ((checkpoint.recentToolBatch?.tools.length ?? 0) > 0) {
    return `Continue from the recent tool batch without repeating ${checkpoint.recentToolBatch?.tools.join(", ")}.`;
  }
  return undefined;
}

export function derivePendingPathArtifacts(session: SessionRecord): SessionCheckpointArtifact[] {
  return takeLastUnique(session.verificationState?.pendingPaths ?? [], MAX_ARTIFACTS).map((pendingPath) => ({
    kind: "pending_path",
    label: truncate(displayPath(session.cwd, pendingPath), MAX_LABEL_CHARS)!,
    path: pendingPath,
  }));
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
