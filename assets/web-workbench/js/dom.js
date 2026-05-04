import { state } from "./state.js";
import { t } from "./i18n.js";

const elementIds = [
  "projectName",
  "runtimeMeta",
  "modeMeta",
  "connectionDot",
  "fileTree",
  "changedFiles",
  "newFileButton",
  "newFolderButton",
  "renamePathButton",
  "deletePathButton",
  "refreshTreeButton",
  "editorHost",
  "diffHost",
  "emptyEditor",
  "openTabs",
  "diffTab",
  "activePath",
  "fileState",
  "closeFileButton",
  "saveButton",
  "chatStream",
  "todoStrip",
  "activityLine",
  "activitySpinner",
  "activityText",
  "promptForm",
  "promptInput",
  "sendButton",
  "pathActionModal",
  "pathActionForm",
  "pathActionTitle",
  "pathActionLabel",
  "pathActionInput",
  "pathActionError",
  "pathActionHelp",
  "pathActionSubmit",
  "confirmActionModal",
  "confirmActionTitle",
  "confirmActionBody",
  "confirmActionSubmit",
];

export const elements = {};

export function initializeDom() {
  for (const id of elementIds) {
    elements[id] = requireElement(id);
  }
  return elements;
}

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Kitty web workbench is missing required DOM node: #${id}`);
  }
  return element;
}

export function setConnection(online) {
  elements.connectionDot.className = `connection-dot ${online ? "online" : "offline"}`;
  elements.connectionDot.title = online ? t("online") : t("offline");
}

export function setRunning(running, label) {
  state.running = running;
  elements.sendButton.disabled = false;
  elements.sendButton.className = `btn ${running ? "btn-danger" : "btn-primary"}`;
  elements.sendButton.innerHTML = running
    ? `<i class="bi bi-stop-circle"></i> ${t("stop")}`
    : `<i class="bi bi-send"></i> ${t("send")}`;
}

export function statusLabel(value) {
  if (!value) {
    return "";
  }
  return t(value) || value;
}
