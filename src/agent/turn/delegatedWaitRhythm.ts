import type { SessionRecord, ToolCallRecord, ToolExecutionResult } from "../../types.js";

const ACTIVE_DELEGATED_WORK_MARKER = "[internal] Active delegated work is still running";

const DELEGATED_POLL_TOOLS = new Set([
  "background_check",
  "list_teammates",
  "read_inbox",
]);

const NEUTRAL_STATE_TOOLS = new Set([
  "task_get",
  "task_list",
  "worktree_events",
  "worktree_get",
  "worktree_list",
]);

const NON_WORK_TOOLS = new Set(["todo_write"]);

export class DelegatedWaitRhythmGuard {
  private needsLeadWorkBeforePoll: boolean;

  constructor(session: SessionRecord) {
    this.needsLeadWorkBeforePoll = needsLeadWorkBeforeNextPoll(session);
  }

  getPreflightBlockedResult(toolCall: ToolCallRecord): ToolExecutionResult | null {
    if (!isDelegatedPollTool(toolCall.function.name) || !this.needsLeadWorkBeforePoll) {
      return null;
    }

    return {
      ok: false,
      output: JSON.stringify(
        {
          ok: false,
          error: "Delegated work was already polled and is still unresolved.",
          code: "DELEGATED_WAIT_LEAD_WORK_REQUIRED",
          hint:
            "Do one concrete non-conflicting lead-side work item before polling delegated work again.",
          next_step:
            "Inspect existing evidence, read or verify an unaffected file, prepare a merge note, or run a small check that does not depend on the delegated result. Then poll again.",
        },
        null,
        2,
      ),
    };
  }

  noteAcceptedToolBatch(toolCalls: ToolCallRecord[]): void {
    let sawDelegatedPoll = false;
    let sawLeadSideWork = false;
    for (const toolCall of toolCalls) {
      if (isDelegatedPollTool(toolCall.function.name)) {
        sawDelegatedPoll = true;
      } else if (isLeadSideWorkTool(toolCall.function.name)) {
        sawLeadSideWork = true;
      }
    }

    if (sawLeadSideWork) {
      this.needsLeadWorkBeforePoll = false;
      return;
    }

    if (sawDelegatedPoll) {
      this.needsLeadWorkBeforePoll = true;
    }
  }
}

function needsLeadWorkBeforeNextPoll(session: SessionRecord): boolean {
  const messages = session.messages ?? [];
  const markerIndex = findLatestDelegatedWaitMarker(messages);
  if (markerIndex < 0) {
    return false;
  }

  let needsLeadWork = false;
  for (const message of messages.slice(markerIndex + 1)) {
    if (message.role !== "tool" || typeof message.name !== "string") {
      continue;
    }

    if (isDelegatedPollTool(message.name)) {
      needsLeadWork = true;
    } else if (isLeadSideWorkTool(message.name)) {
      needsLeadWork = false;
    }
  }

  return needsLeadWork;
}

function findLatestDelegatedWaitMarker(messages: SessionRecord["messages"]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.startsWith(ACTIVE_DELEGATED_WORK_MARKER)
    ) {
      return index;
    }
  }

  return -1;
}

function isDelegatedPollTool(toolName: string): boolean {
  return DELEGATED_POLL_TOOLS.has(toolName);
}

function isLeadSideWorkTool(toolName: string): boolean {
  return !DELEGATED_POLL_TOOLS.has(toolName)
    && !NEUTRAL_STATE_TOOLS.has(toolName)
    && !NON_WORK_TOOLS.has(toolName);
}
