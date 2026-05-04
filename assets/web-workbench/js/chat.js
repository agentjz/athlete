import { elements } from "./dom.js";
import { t } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";

export function appendMessage(input) {
  const root = document.createElement("article");
  root.className = `message ${input.kind}`;
  const title = document.createElement("div");
  title.className = "message-title";
  title.textContent = input.title;
  const body = document.createElement("div");
  body.className = "message-body";
  root.append(title, body);
  elements.chatStream.appendChild(root);
  const message = {
    root,
    body,
    raw: input.body || "",
    markdown: input.markdown === true,
  };
  renderMessageBody(message);
  scrollToBottom(root);
  return message;
}

export function appendOrUpdateStreamMessage(message, delta) {
  message.raw += delta;
  renderMessageBody(message);
  scrollToBottom(message.root);
  return message;
}

export function appendRuntimeLine(input) {
  const kind = input.kind || "status";
  const channel = input.channel || "lead";
  const row = document.createElement("div");
  row.className = `runtime-line ${kind} ${channel}`;
  let toggle = null;
  if (kind === "reasoning") {
    toggle = document.createElement("button");
    toggle.className = "runtime-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "展开思考");
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML = '<i class="bi bi-chevron-down"></i>';
    toggle.addEventListener("click", () => toggleReasoning(row, toggle));
  }
  const label = document.createElement("span");
  label.className = "runtime-label";
  label.textContent = input.label || "";
  const text = document.createElement("span");
  text.className = "runtime-text";
  text.textContent = formatRuntimeText(input);
  row.append(label, text);
  if (toggle) {
    row.append(toggle);
  }
  elements.chatStream.appendChild(row);
  scrollToBottom(row);
  return {
    root: row,
    toggle,
    text,
    raw: formatRuntimeText(input),
    kind,
    channel,
    executionId: input.executionId,
  };
}

export function appendOrUpdateRuntimeLine(line, delta) {
  line.raw += delta;
  line.text.textContent = line.raw;
  scrollToBottom(line.root);
  return line;
}

function renderMessageBody(message) {
  if (message.markdown) {
    message.body.innerHTML = renderMarkdown(message.raw);
    return;
  }
  message.body.textContent = message.raw;
}

function formatRuntimeText(input) {
  const message = String(input.message || "").trim();
  const detail = String(input.detail || "").trim();
  if (message && detail) {
    return `${message}: ${detail}`;
  }
  return message || detail;
}

function scrollToBottom(node) {
  node.scrollIntoView({ block: "end" });
}

function toggleReasoning(row, toggle) {
  const collapsed = row.classList.toggle("collapsed");
  toggle.setAttribute("aria-label", collapsed ? "展开思考" : "折叠思考");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.innerHTML = collapsed
    ? '<i class="bi bi-chevron-right"></i>'
    : '<i class="bi bi-chevron-down"></i>';
}
