import { elements } from "./dom.js";
import { t } from "./i18n.js";

let currentItems = [];

export function updateTodos(items) {
  currentItems = Array.isArray(items) ? items : [];
  renderTodos();
}

function renderTodos() {
  elements.todoStrip.replaceChildren();
  if (currentItems.length === 0) {
    elements.todoStrip.hidden = true;
    return;
  }

  elements.todoStrip.hidden = false;
  const title = document.createElement("div");
  title.className = "todo-title";
  title.textContent = t("todoTitle");
  elements.todoStrip.appendChild(title);

  for (const item of currentItems) {
    const status = item.status;
    const row = document.createElement("div");
    row.className = `todo-item ${status}`;
    const icon = document.createElement("span");
    icon.className = "todo-icon";
    icon.innerHTML = iconForStatus(status);
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = item.text;
    row.append(icon, text);
    elements.todoStrip.appendChild(row);
  }
}

function iconForStatus(status) {
  if (status === "completed") {
    return '<i class="bi bi-check-circle-fill"></i>';
  }
  if (status === "in_progress") {
    return '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
  }
  return '<i class="bi bi-circle"></i>';
}
