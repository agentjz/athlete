import fs from "node:fs";
import fsp from "node:fs/promises";

import { getErrorMessage } from "../agent/errors.js";
import { normalizeRuntimeUiChannel, type RuntimeUiEvent } from "../runtime-ui/events.js";
import { parseForegroundStreamRuntimeUiEvent } from "../runtime-ui/foregroundEvent.js";
import { formatRuntimeUiRoleLabel } from "../runtime-ui/channelIdentity.js";
import { buildToolCallDisplay, buildToolResultDisplay } from "../runtime-ui/toolDisplay.js";
import { truncateVisiblePreview } from "../runtime-ui/previewPolicy.js";
import type { WorkbenchBroadcaster } from "./broadcaster.js";
import { nowEventTime, type WorkbenchEvent, type WorkbenchRuntimeChannel, type WorkbenchRuntimeLineEvent, type WorkbenchRuntimeLineKind } from "./events.js";

export function sendToolCallLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  args: string;
  cwd: string;
}): void {
  sendRuntimeLineEvent(input.broadcaster, createToolCallRuntimeLine({
    channel: "lead",
    name: input.name,
    args: input.args,
    cwd: input.cwd,
  }));
}

export function sendToolResultLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  output: string;
  cwd: string;
}): void {
  const event = createToolResultRuntimeLine({
    channel: "lead",
    name: input.name,
    output: input.output,
    cwd: input.cwd,
  });
  if (event) {
    sendRuntimeLineEvent(input.broadcaster, event);
    return;
  }
}

export function sendToolErrorLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  error: string;
  cwd: string;
}): void {
  sendRuntimeLineEvent(input.broadcaster, {
    channel: "lead",
    kind: "error",
    message: `${input.name} failed`,
    detail: compactToolFailure(input.name, input.error, input.cwd),
  });
}

export function followWorkbenchForegroundStream(input: {
  broadcaster: WorkbenchBroadcaster;
  executionId: string;
  label: string;
  streamPath: string;
  abortSignal?: AbortSignal;
}): void {
  const channel = normalizeRuntimeUiChannel(input.label);
  let offset = 0;
  let settled = false;
  let watcher: fs.FSWatcher | undefined;

  const flush = async (): Promise<void> => {
    const content = await fsp.readFile(input.streamPath, "utf8").catch(() => "");
    if (content.length <= offset) {
      return;
    }
    const next = content.slice(offset);
    offset = content.length;
    for (const line of next.split(/\r?\n/).filter(Boolean)) {
      sendForegroundRuntimeEvent(input.broadcaster, parseForegroundStreamRuntimeUiEvent(input.label, input.executionId, line));
    }
  };

  const close = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    watcher?.close();
    input.abortSignal?.removeEventListener("abort", close);
  };

  sendRuntimeLineEvent(input.broadcaster, {
    channel,
    kind: "foreground",
    message: `foreground started ${input.executionId}`,
    executionId: input.executionId,
  });
  void flush();
  try {
    watcher = fs.watch(input.streamPath, () => {
      void flush().catch((error) => sendRuntimeLineEvent(input.broadcaster, {
        channel,
        kind: "error",
        message: getErrorMessage(error),
        executionId: input.executionId,
      }));
    });
  } catch {
    const interval = setInterval(() => {
      if (settled) {
        clearInterval(interval);
        return;
      }
      void flush();
    }, 500);
  }
  input.abortSignal?.addEventListener("abort", close, { once: true });
  void waitForStreamTerminal(input.streamPath, input.executionId).then(() => {
    void flush().finally(close);
  }, () => close());
}

function sendForegroundRuntimeEvent(broadcaster: WorkbenchBroadcaster, event: RuntimeUiEvent): void {
  if (event.kind === "assistant_text") {
    sendRuntimeLineEvent(broadcaster, {
      channel: event.channel,
      kind: "assistant",
      message: event.message ?? "",
      executionId: event.executionId,
    });
    return;
  }
  if (event.kind === "reasoning") {
    sendRuntimeLineEvent(broadcaster, {
      channel: event.channel,
      kind: "reasoning",
      message: event.message ?? "",
      executionId: event.executionId,
    });
    return;
  }
  if (event.kind === "dispatch") {
    sendRuntimeLineEvent(broadcaster, {
      channel: event.channel,
      kind: "dispatch",
      message: event.message ?? "",
      executionId: event.executionId,
    });
    return;
  }
  if (event.kind === "tool_call") {
    sendRuntimeLineEvent(broadcaster, createToolCallRuntimeLine({
      channel: event.channel,
      name: event.toolName ?? "tool",
      args: event.payload ?? "{}",
      executionId: event.executionId,
    }));
    return;
  }
  if (event.kind === "tool_result" || event.kind === "tool_error") {
    const name = event.toolName ?? "tool";
    if (event.kind === "tool_result") {
      const line = createToolResultRuntimeLine({
        channel: event.channel,
        name,
        output: event.payload ?? event.message ?? "",
        executionId: event.executionId,
      });
      if (line) {
        sendRuntimeLineEvent(broadcaster, line);
      }
      return;
    }
    sendRuntimeLineEvent(broadcaster, {
      channel: event.channel,
      kind: "error",
      message: `${name} failed`,
      detail: compactToolFailure(name, event.payload ?? event.message ?? ""),
      executionId: event.executionId,
    });
    return;
  }
  if (event.kind === "status") {
    sendRuntimeLineEvent(broadcaster, {
      channel: event.channel,
      kind: "status",
      message: event.message ?? "",
      executionId: event.executionId,
    });
    return;
  }
  sendRuntimeLineEvent(broadcaster, {
    channel: event.channel,
    kind: event.kind === "foreground_message" ? "foreground" : "status",
    message: event.message ?? "",
    executionId: event.executionId,
  });
}

export function createRuntimeLineEvent(
  input: {
    channel: WorkbenchRuntimeChannel;
    kind: WorkbenchRuntimeLineKind;
    label?: string;
    message: string;
    detail?: string;
    executionId?: string;
  },
): WorkbenchEvent | null {
  if (!input.message && !input.detail) {
    return null;
  }
  return {
    type: "runtime.line",
    channel: input.channel,
    kind: input.kind,
    label: input.label ?? runtimeLineLabel(input.channel, input.kind),
    message: input.message,
    detail: input.detail,
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

export function createToolCallRuntimeLine(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  args: string;
  cwd?: string;
  executionId?: string;
}): WorkbenchRuntimeLineEvent {
  const display = buildToolCallDisplay(input.name, input.args, 160, input.cwd);
  return {
    type: "runtime.line",
    channel: input.channel,
    kind: "tool",
    message: display.summary,
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

export function createToolCallRuntimeLineSummary(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  args: string;
  cwd?: string;
  executionId?: string;
}): Pick<WorkbenchRuntimeLineEvent, "channel" | "kind" | "label" | "message" | "detail" | "executionId"> {
  const event = createToolCallRuntimeLine(input);
  return {
    channel: event.channel,
    kind: event.kind,
    label: event.label,
    message: event.message,
    detail: event.detail,
    executionId: event.executionId,
  };
}

export function createToolResultRuntimeLine(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  output: string;
  cwd?: string;
  executionId?: string;
}): WorkbenchRuntimeLineEvent | null {
  if (input.name === "todo_write") {
    return null;
  }

  const display = buildToolResultDisplay(input.name, input.output, input.cwd);
  const ok = display.ok !== false;
  if (ok) {
    return null;
  }

  return {
    type: "runtime.line",
    channel: input.channel,
    kind: "result",
    message: `${display.summary || input.name} failed`,
    detail: compactToolFailure(input.name, input.output, input.cwd),
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

export function extractWorkbenchTodoItems(output: string): Array<{
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}> | undefined {
  const parsed = parseJsonObject(output);
  if (!parsed) {
    return undefined;
  }

  const candidates = [
    parsed.items,
    parseJsonObject(readString(parsed.output))?.items,
    parseJsonObject(readString(parsed.content))?.items,
    parseJsonObject(readString(parsed.preview))?.items,
  ];

  for (const candidate of candidates) {
    const items = normalizeTodoCandidate(candidate);
    if (items) {
      return items;
    }
  }

  return undefined;
}

function sendRuntimeLineEvent(
  broadcaster: WorkbenchBroadcaster,
  input: {
    channel: WorkbenchRuntimeChannel;
    kind: WorkbenchRuntimeLineKind;
    label?: string;
    message: string;
    detail?: string;
    executionId?: string;
  },
): void {
  const event = createRuntimeLineEvent(input);
  if (event) {
    broadcaster.send(event);
  }
}

function runtimeLineLabel(channel: WorkbenchRuntimeChannel, kind: WorkbenchRuntimeLineKind): string | undefined {
  if (kind === "assistant") {
    return formatRuntimeUiRoleLabel(channel, "assistant");
  }
  if (kind === "reasoning") {
    return formatRuntimeUiRoleLabel(channel, "reasoning");
  }
  if (kind === "tool") {
    return "工具";
  }
  if (kind === "result") {
    return "结果";
  }
  if (kind === "error") {
    return "错误";
  }
  if (kind === "dispatch") {
    return "派发";
  }
  if (kind === "foreground") {
    return "前台";
  }
  if (kind === "status") {
    return "状态";
  }
  return undefined;
}

function compactToolFailure(name: string, rawOutput: string, cwd?: string): string {
  const display = buildToolResultDisplay(name, rawOutput, cwd);
  const parsed = parseJsonObject(display.preview ?? rawOutput);
  const error = readString(parsed?.error) ?? readString(parsed?.reason) ?? readString(parsed?.hint);
  if (error) {
    return truncateVisiblePreview(error);
  }

  return truncateVisiblePreview(display.preview ?? rawOutput).replace(/[{}"]/g, "");
}

function normalizeTodoCandidate(value: unknown): Array<{
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const text = String(record.text ?? "").replace(/\s+/g, " ").trim();
    const status = String(record.status ?? "").trim();
    if (!id || !text || !isTodoStatus(status)) {
      return [];
    }
    return [{ id, text, status }];
  });
  return items.length === value.length ? items : undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isTodoStatus(value: string): value is "pending" | "in_progress" | "completed" {
  return value === "pending" || value === "in_progress" || value === "completed";
}

async function waitForStreamTerminal(streamPath: string, executionId: string): Promise<void> {
  for (;;) {
    const content = await fsp.readFile(streamPath, "utf8").catch(() => "");
    if (content.includes(`"executionId":"${executionId}"`) && /"message":"Dreaming (completed|failed|paused)|"message":"Merge proposal written/.test(content)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
