import { appendMessage, appendOrUpdateRuntimeLine, appendOrUpdateStreamMessage, appendRuntimeLine } from "./chat.js";
import { t } from "./i18n.js";

const stream = {
  active: null,
};

export function appendUserMessage(input) {
  resetTurnStream();
  return appendMessage({
    kind: "user",
    title: t("you"),
    body: input,
    markdown: true,
  });
}

export function appendLoadedUserMessage(input) {
  resetTurnStream();
  return appendMessage({
    kind: "user",
    title: t("you"),
    body: input,
    markdown: true,
  });
}

export function appendLoadedAssistantMessage(input) {
  if (!input || !input.body) {
    return null;
  }
  resetTurnStream();
  return appendMessage({
    kind: "assistant",
    title: input.label || "",
    body: input.body,
    markdown: true,
  });
}

export function appendLoadedReasoning(input) {
  if (!input || !input.body) {
    return null;
  }
  resetTurnStream();
  const node = appendRuntimeLine({
    channel: "lead",
    kind: "reasoning",
    label: input.label || "",
    message: input.body,
  });
  collapseReasoning(node);
  return node;
}

export function appendSystemMessage(body) {
  resetTurnStream();
  return appendRuntimeLine({
    channel: "system",
    kind: "status",
    message: body,
  });
}

export function appendErrorMessage(body, title) {
  resetTurnStream();
  return appendRuntimeLine({
    channel: "system",
    kind: "error",
    message: title || t("error"),
    detail: body,
  });
}

export function appendAssistantDelta(delta) {
  appendRuntimeLineEvent({
    channel: "lead",
    kind: "assistant",
    message: delta,
  });
}

export function appendRuntimeLineEvent(event) {
  const normalized = normalizeRuntimeEvent(event);
  if (!normalized.message && !normalized.detail) {
    return;
  }
  if (normalized.kind === "assistant") {
    appendChannelDelta(normalized);
    return;
  }
  if (normalized.kind === "reasoning") {
    appendReasoningDelta(normalized);
    return;
  }
  flushActiveStream();
  appendRuntimeLine(normalized);
}

export function appendExecutionStarted(event) {
  appendRuntimeLineEvent({
    channel: profileToChannel(event.profile),
    kind: "dispatch",
    message: [event.actorName, event.summary || event.executionId].filter(Boolean).join(" "),
    executionId: event.executionId,
  });
}

export function finishAssistantStream() {
  flushActiveStream();
}

export function resetTurnStream() {
  stream.active = null;
}

function appendReasoningDelta(event) {
  if (!event.message) {
    return;
  }
  const streamKey = eventKey(event);
  if (stream.active?.type !== "reasoning" || stream.active.key !== streamKey) {
    flushActiveStream();
    stream.active = {
      type: "reasoning",
      key: streamKey,
      node: appendRuntimeLine(event),
    };
    return;
  }
  appendOrUpdateRuntimeLine(stream.active.node, event.message);
}

function appendChannelDelta(event) {
  if (!event.message) {
    return;
  }
  if (stream.active?.type === "reasoning") {
    collapseReasoning(stream.active.node);
    stream.active = null;
  }
  const streamKey = eventKey(event);
  if (stream.active?.type !== "assistant" || stream.active.key !== streamKey) {
      stream.active = {
        type: "assistant",
        key: streamKey,
        node: appendMessage({
          kind: `assistant ${event.channel}`,
          title: event.label || "",
          body: "",
          markdown: true,
        }),
      };
  }
  appendOrUpdateStreamMessage(stream.active.node, event.message);
}

function flushActiveStream() {
  if (stream.active?.type === "reasoning") {
    collapseReasoning(stream.active.node);
  }
  stream.active = null;
}

function collapseReasoning(node) {
  node.root.classList.add("collapsed");
  if (node.toggle) {
    node.toggle.setAttribute("aria-label", "展开思考");
    node.toggle.setAttribute("aria-expanded", "false");
    node.toggle.innerHTML = '<i class="bi bi-chevron-right"></i>';
  }
}

function normalizeRuntimeEvent(event) {
  return {
    channel: event.channel || "lead",
    kind: event.kind || "status",
    label: event.label,
    message: event.message || event.delta || "",
    detail: event.detail,
    executionId: event.executionId,
  };
}

function eventKey(event) {
  return `${event.channel}:${event.executionId || "lead"}`;
}

function profileToChannel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("dream")) return "dream";
  if (normalized.includes("team") || normalized.includes("teammate")) return "team";
  if (normalized.includes("subagent")) return "subagent";
  if (normalized.includes("background")) return "background";
  return "lead";
}
