import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import { recordAgentTraceEvent } from "./store.js";
import type { AgentIdentity } from "../agent/types.js";
import type { BuiltRequestContext } from "../agent/context/builder.js";
import type { FunctionToolDefinition } from "../capabilities/tools/index.js";
import type { AssistantResponse } from "../agent/types.js";
import type { ExternalizedToolResultReference, ToolCallRecord, ToolExecutionResult } from "../types.js";

export interface TraceRuntimeScope {
  rootDir: string;
  sessionId: string;
  turnId: string;
  identity: AgentIdentity;
}

export function createTraceTurnId(): string {
  return `turn-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function traceTurnStarted(scope: TraceRuntimeScope, input: {
  cwd: string;
  userInput: string;
  objective?: string;
}): Promise<void> {
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: "turn_started",
    summary: "Agent turn started.",
    data: {
      cwd: input.cwd,
      objective: input.objective,
      userInputPreview: truncateOneLine(input.userInput, 500),
      userInputChars: input.userInput.length,
    },
  });
}

export async function traceModelRequest(scope: TraceRuntimeScope, input: {
  provider: string;
  configuredModel: string;
  requestModel: string;
  requestContext: BuiltRequestContext;
  toolDefinitions: FunctionToolDefinition[];
}): Promise<void> {
  const artifact = await tryWriteTraceArtifact(scope, "model-request", {
    messages: input.requestContext.messages,
    toolDefinitions: input.toolDefinitions,
  });
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: "model_request",
    summary: "Model request prepared.",
    data: {
      provider: input.provider,
      configuredModel: input.configuredModel,
      requestModel: input.requestModel,
      messageCount: input.requestContext.messages.length,
      toolDefinitionCount: input.toolDefinitions.length,
      compressed: input.requestContext.compressed,
      estimatedChars: input.requestContext.estimatedChars,
      contextDiagnostics: input.requestContext.contextDiagnostics,
      promptMetrics: input.requestContext.promptMetrics,
      summaryChars: input.requestContext.summary?.length ?? 0,
      toolNames: input.toolDefinitions.map((tool) => tool.function.name),
    },
    artifacts: artifact ? [artifact] : undefined,
  });
}

export async function traceModelResponse(scope: TraceRuntimeScope, input: {
  response: AssistantResponse;
}): Promise<void> {
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: "model_response",
    summary: input.response.toolCalls.length > 0
      ? `Model returned ${input.response.toolCalls.length} tool call(s).`
      : "Model returned assistant text.",
    data: {
      contentPreview: truncateOneLine(input.response.content ?? "", 600),
      contentChars: input.response.content?.length ?? 0,
      reasoningChars: input.response.reasoningContent?.length ?? 0,
      toolCalls: input.response.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        argsPreview: truncateOneLine(toolCall.function.arguments, 800),
        argsChars: toolCall.function.arguments.length,
      })),
    },
  });
}

export async function traceToolCall(scope: TraceRuntimeScope, toolCall: ToolCallRecord): Promise<void> {
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: "tool_call",
    summary: `Tool call requested: ${toolCall.function.name}.`,
    data: {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      arguments: parseJsonObject(toolCall.function.arguments) ?? toolCall.function.arguments,
      argsChars: toolCall.function.arguments.length,
    },
  });
}

export async function traceToolResult(scope: TraceRuntimeScope, input: {
  toolCall: ToolCallRecord;
  result: ToolExecutionResult;
  durationMs: number;
  externalizedToolResult?: ExternalizedToolResultReference;
}): Promise<void> {
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: "tool_result",
    summary: `Tool ${input.toolCall.function.name} ${input.result.ok ? "completed" : "failed"}.`,
    data: {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.function.name,
      ok: input.result.ok,
      durationMs: input.durationMs,
      outputPreview: truncateOneLine(input.result.output, 900),
      outputChars: input.result.output.length,
      metadata: input.result.metadata,
      externalized: Boolean(input.externalizedToolResult),
    },
    artifacts: input.externalizedToolResult
      ? [{
          scope: "project_state_root",
          storagePath: input.externalizedToolResult.storagePath,
          byteLength: input.externalizedToolResult.byteLength,
          charLength: input.externalizedToolResult.charLength,
          sha256: input.externalizedToolResult.sha256,
        }]
      : undefined,
  });
}

export async function traceTurnTerminal(scope: TraceRuntimeScope, input: {
  kind: "turn_finalized" | "turn_yielded" | "turn_paused" | "turn_recovered" | "turn_failed";
  summary: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await recordAgentTraceEvent(scope.rootDir, {
    ...baseTraceInput(scope),
    kind: input.kind,
    summary: input.summary,
    data: input.data,
  });
}

async function writeTraceArtifact(
  scope: TraceRuntimeScope,
  label: string,
  content: unknown,
): Promise<{
  scope: "project_state_root";
  storagePath: string;
  byteLength: number;
  charLength: number;
  sha256: string;
}> {
  const statePaths = getProjectStatePaths(scope.rootDir);
  const dir = path.join(statePaths.tracesDir, scope.sessionId, scope.turnId);
  const raw = JSON.stringify(content, null, 2);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const filePath = path.join(dir, `${label}-${hash.slice(0, 12)}.json`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, raw, "utf8");
  return {
    scope: "project_state_root",
    storagePath: path.relative(scope.rootDir, filePath),
    byteLength: Buffer.byteLength(raw, "utf8"),
    charLength: raw.length,
    sha256: hash,
  };
}

async function tryWriteTraceArtifact(
  scope: TraceRuntimeScope,
  label: string,
  content: unknown,
): Promise<Awaited<ReturnType<typeof writeTraceArtifact>> | undefined> {
  try {
    return await writeTraceArtifact(scope, label, content);
  } catch {
    return undefined;
  }
}

function baseTraceInput(scope: TraceRuntimeScope) {
  return {
    sessionId: scope.sessionId,
    turnId: scope.turnId,
    identityKind: scope.identity.kind,
    identityName: scope.identity.name,
  };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function truncateOneLine(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars)}...`;
}
