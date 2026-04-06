import type { ChangeRecord } from "../types.js";
import type { RecordChangeInput, RecordChangeOperation } from "../changes/store.js";
import type { ToolContext } from "./types.js";

export interface PendingChangeOperation {
  path: string;
  kind: "create" | "update" | "delete";
  binary: boolean;
  preview?: string;
  beforeText?: string;
  afterText?: string;
  beforeData?: Buffer;
  afterData?: Buffer;
}

export interface RecordedToolChange {
  change: ChangeRecord | null;
  warning?: string;
}

export async function recordToolChange(
  context: ToolContext,
  input: {
    toolName: string;
    summary: string;
    preview?: string;
    operations: PendingChangeOperation[];
  },
): Promise<RecordedToolChange> {
  const payload: RecordChangeInput = {
    sessionId: context.sessionId,
    cwd: context.cwd,
    toolName: input.toolName,
    summary: input.summary,
    preview: input.preview,
    operations: input.operations.map((operation) => toRecordOperation(operation)),
  };

  try {
    return {
      change: await context.changeStore.record(payload),
    };
  } catch (error) {
    return {
      change: null,
      warning: `Change history unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function toRecordOperation(operation: PendingChangeOperation): RecordChangeOperation {
  return {
    path: operation.path,
    kind: operation.kind,
    binary: operation.binary,
    preview: operation.preview,
    beforeData: operation.beforeData ?? encodeUtf8(operation.beforeText),
    afterData: operation.afterData ?? encodeUtf8(operation.afterText),
  };
}

function encodeUtf8(value: string | undefined): Buffer | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return Buffer.from(value, "utf8");
}
