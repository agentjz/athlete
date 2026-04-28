import { resolveCurrentObjectiveCheckpoint } from "../checkpoint/state.js";
import type { PendingToolCall, SessionRecord, ToolCallRecord, ToolExecutionProtocolPolicy } from "../../types.js";

export function createPendingToolCalls(
  toolCalls: ToolCallRecord[],
  policy: ToolExecutionProtocolPolicy,
  timestamp = new Date().toISOString(),
): PendingToolCall[] {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    policy,
    preparedAt: timestamp,
  }));
}

export function notePendingToolCalls(
  session: SessionRecord,
  pendingToolCalls: PendingToolCall[],
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  const pendingToolCallCount = pendingToolCalls.length;
  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: {
        ...checkpoint.flow,
        runState: {
          status: pendingToolCallCount > 0 ? "busy" : "idle",
          source: pendingToolCallCount > 0 ? "tool_batch" : "checkpoint",
          pendingToolCallCount,
          updatedAt: timestamp,
        },
        pendingToolCalls,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}

export function clearPendingToolCalls(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: {
        ...checkpoint.flow,
        runState: {
          status: "idle",
          source: "checkpoint",
          pendingToolCallCount: 0,
          updatedAt: timestamp,
        },
        pendingToolCalls: undefined,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}

export function completePendingToolCall(
  session: SessionRecord,
  toolCallId: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
  const remaining = (checkpoint.flow.pendingToolCalls ?? []).filter((pending) => pending.id !== toolCallId);
  const pendingToolCallCount = remaining.length;
  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: {
        ...checkpoint.flow,
        runState: {
          status: pendingToolCallCount > 0 ? "busy" : "idle",
          source: pendingToolCallCount > 0 ? "tool_batch" : "checkpoint",
          pendingToolCallCount,
          updatedAt: timestamp,
        },
        pendingToolCalls: remaining.length > 0 ? remaining : undefined,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}
