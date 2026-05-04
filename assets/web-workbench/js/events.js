import {
  appendErrorMessage,
  appendExecutionStarted,
  appendRuntimeLineEvent,
  finishAssistantStream,
} from "./runtimeStream.js";
import { requestJson } from "./api.js";
import { setActivityLabel, showChangeSummary, startReplying, startThinking, stopActivity } from "./activity.js";
import { setConnection, setRunning } from "./dom.js";
import { showDiffView, syncChangedFiles } from "./editor.js";
import { refreshGitStatus, refreshTree, rerenderSelections } from "./explorer.js";
import { renderProjectMeta } from "./projectMeta.js";
import { state } from "./state.js";
import { updateTodos } from "./todos.js";

export function connectEvents() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket.addEventListener("open", () => setConnection(true));
  socket.addEventListener("close", () => {
    setConnection(false);
    setTimeout(connectEvents, 1500);
  });
  socket.addEventListener("message", (message) => {
    handleWorkbenchEvent(JSON.parse(message.data));
  });
}

function handleWorkbenchEvent(event) {
  if (event.type === "server.ready") {
    setConnection(true);
    return;
  }
  if (event.type === "project.updated") {
    state.project = {
      ...(state.project || {}),
      cwd: event.cwd,
      projectName: event.projectName,
      mode: event.mode,
      activeSpec: event.activeSpec,
    };
    renderProjectMeta();
    return;
  }
  if (event.type === "session.status") {
    setRunning(event.status === "running", event.message || event.status);
    if (event.status === "running") {
      if (event.message === "streaming") {
        startReplying("streaming");
      } else {
        startThinking(event.message || "running");
      }
    } else {
      stopActivity(event.message || "idle");
      void renderChangeSummary();
    }
    if (event.status === "error" && event.message) {
      appendErrorMessage(event.message, "runtime");
    }
    return;
  }
  if (event.type === "assistant.done") {
    finishAssistantStream();
    return;
  }
  if (event.type === "runtime.line") {
    setReplying();
    appendRuntimeLineEvent(event);
    return;
  }
  if (event.type === "tool.call") {
    return;
  }
  if (event.type === "tool.result") {
    return;
  }
  if (event.type === "tool.error") {
    return;
  }
  if (event.type === "execution.started") {
    setReplying();
    appendExecutionStarted(event);
    return;
  }
  if (event.type === "execution.foreground") {
    return;
  }
  if (event.type === "file.changed") {
    void refreshTree();
    void syncChangedFiles(event.paths, refreshGitStatus);
    return;
  }
  if (event.type === "git.status") {
    state.gitFiles = event.files;
    rerenderSelections();
    return;
  }
  if (event.type === "todo.updated") {
    updateTodos(event.items || []);
    return;
  }
  if (event.type === "runtime.error") {
    appendErrorMessage(event.message, "runtime");
  }
}

function setReplying() {
  if (state.running) {
    startReplying("streaming");
  }
}

async function renderChangeSummary() {
  const summary = await requestJson("/api/git/summary").catch(() => null);
  if (!summary) {
    return;
  }
  showChangeSummary(summary, () => {
    void showDiffView(state.activePath, rerenderSelections);
  });
}
