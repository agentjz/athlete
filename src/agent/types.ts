import type { SessionStoreLike } from "./sessionStore.js";
import type { ToolRegistry } from "../tools/types.js";
import type { RuntimeConfig, SessionRecord, ToolCallRecord } from "../types.js";

export interface AgentIdentity {
  kind: "lead" | "teammate" | "subagent";
  name: string;
  role?: string;
  teamName?: string;
}

export interface AgentCallbacks {
  onModelWaitStart?: () => void;
  onModelWaitStop?: () => void;
  onStatus?: (text: string) => void;
  onAssistantDelta?: (delta: string) => void;
  onAssistantDone?: (fullText: string) => void;
  onAssistantText?: (text: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (name: string, args: string) => void;
  onToolResult?: (name: string, output: string) => void;
  onToolError?: (name: string, error: string) => void;
}

export interface RunTurnOptions {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  toolRegistry?: ToolRegistry;
  identity?: AgentIdentity;
  yieldAfterToolSteps?: number;
  abortSignal?: AbortSignal;
  callbacks?: AgentCallbacks;
}

export interface AssistantResponse {
  content: string | null;
  reasoningContent?: string;
  streamedAssistantContent?: boolean;
  streamedReasoningContent?: boolean;
  toolCalls: ToolCallRecord[];
}

export interface RunTurnResult {
  session: SessionRecord;
  changedPaths: string[];
  verificationAttempted: boolean;
  verificationPassed?: boolean;
  yielded: boolean;
  yieldReason?: string;
  paused?: boolean;
  pauseReason?: string;
}
