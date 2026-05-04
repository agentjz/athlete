import { requestJson } from "./api.js";
import { appendLoadedAssistantMessage, appendLoadedReasoning, appendLoadedUserMessage, appendRuntimeLineEvent, appendSystemMessage } from "./runtimeStream.js";
import { configureConfirmDialog } from "./confirm.js";
import { elements, initializeDom } from "./dom.js";
import { closeActiveFile, configureMonaco, deleteOpenPath, openFile, renameOpenPath, saveActiveFile, showDiffView, showFileView } from "./editor.js";
import { connectEvents } from "./events.js";
import { configureExplorer, refreshGitStatus, refreshTree, rerenderSelections } from "./explorer.js";
import { applyTranslations, t } from "./i18n.js";
import { configureMarkdown } from "./markdown.js";
import { configurePathActions, deleteSelectedPath, showCreateFileDialog, showCreateFolderDialog, showRenameDialog } from "./pathActions.js";
import { abortTurn, sendPrompt } from "./prompt.js";
import { renderProjectMeta } from "./projectMeta.js";
import { state } from "./state.js";
import { updateTodos } from "./todos.js";

window.addEventListener("DOMContentLoaded", async () => {
  initializeDom();
  await configureMonaco();
  configureMarkdown();
  applyTranslations();
  configureConfirmDialog();
  configureExplorer({
    openFile: (path) => openFile(path, rerenderSelections),
    showDiff: (path) => showDiffView(path, rerenderSelections),
  });
  configurePathActions({
    openFile: (path) => openFile(path, rerenderSelections),
    renameOpenPath: (from, to, type) => renameOpenPath(from, to, type, rerenderSelections),
    deleteOpenPath: (path, type) => deleteOpenPath(path, type, rerenderSelections),
    afterChange: async (options) => {
      await refreshTree(options);
      await refreshGitStatus();
    },
  });
  bindUi();
  await loadProject();
  await refreshTree();
  await refreshGitStatus();
  connectEvents();
  if (!renderSessionMessages()) {
    appendSystemMessage(t("ready"));
  }
});

function bindUi() {
  elements.refreshTreeButton.addEventListener("click", () => {
    void refreshTree();
    void refreshGitStatus();
  });
  elements.newFileButton.addEventListener("click", showCreateFileDialog);
  elements.newFolderButton.addEventListener("click", showCreateFolderDialog);
  elements.renamePathButton.addEventListener("click", showRenameDialog);
  elements.deletePathButton.addEventListener("click", () => void deleteSelectedPath());
  elements.diffTab.addEventListener("click", () => showDiffView(state.activePath, rerenderSelections));
  elements.closeFileButton.addEventListener("click", () => closeActiveFile(rerenderSelections));
  elements.saveButton.addEventListener("click", () => void saveActiveFile(refreshGitStatus));
  elements.promptForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.running) {
      void abortTurn();
      return;
    }
    void sendPrompt();
  });
  elements.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (state.running) {
        void abortTurn();
        return;
      }
      void sendPrompt();
    }
  });
  window.addEventListener("resize", () => {
    state.editor?.layout();
    state.diffEditor?.layout();
  });
}

async function loadProject() {
  state.project = await requestJson("/api/project");
  state.sessionId = state.project.session?.id || null;
  renderProjectMeta();
  updateTodos(state.project.todos || state.project.session?.todos || []);
}

function renderSessionMessages() {
  const messages = state.project?.session?.messages || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }
  for (const message of messages) {
    if (message.role === "user") {
      appendLoadedUserMessage(message.content || "");
      continue;
    }
    if (message.role === "assistant") {
      if (message.reasoningContent) {
        appendLoadedReasoning({
          label: message.reasoningLabel || "",
          body: message.reasoningContent,
        });
      }
      for (const toolCall of message.toolCalls || []) {
        if (toolCall.runtimeLine) {
          appendRuntimeLineEvent(toolCall.runtimeLine);
        }
      }
      appendLoadedAssistantMessage({
        label: message.label || "",
        body: message.content || "",
      });
    }
  }
  return true;
}
