import { requestJson } from "./api.js";
import { confirmAction } from "./confirm.js";
import { elements } from "./dom.js";
import { t } from "./i18n.js";
import { isSameOrChildPath } from "./paths.js";
import { state } from "./state.js";
import { formatBytes, languageForPath } from "./utils.js";

export async function configureMonaco() {
  await new Promise((resolve) => {
    if (!window.require) {
      throw new Error("Monaco loader failed to initialize.");
    }
    window.require.config({ paths: { vs: "/vendor/monaco/vs" } });
    window.require(["vs/editor/editor.main"], resolve);
  });
  if (!window.monaco?.editor) {
    throw new Error("Monaco editor failed to initialize.");
  }

  monaco.editor.defineTheme("kitty-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#fbfcfe",
      "editorLineNumber.foreground": "#9aa4b2",
      "editorGutter.background": "#fbfcfe",
    },
  });
}

export async function openFile(path, rerenderSelections) {
  const existing = findTab(path);
  if (existing) {
    activateTab(existing.path, rerenderSelections);
    return;
  }

  const file = await requestJson(`/api/files/read?path=${encodeURIComponent(path)}`);
  const model = monaco.editor.createModel(file.content, languageForPath(file.path));
  state.openTabs.push({
    path: file.path,
    model,
    dirty: false,
    saved: false,
    size: file.size,
    truncated: file.truncated,
  });
  if (!state.editor) {
    state.editor = monaco.editor.create(elements.editorHost, {
      model,
      theme: "kitty-light",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
    });
    state.editor.onDidChangeModelContent(() => {
      if (state.syncingEditor) {
        return;
      }
      const tab = activeTab();
      if (state.activeView === "file" && tab) {
        tab.dirty = true;
        tab.saved = false;
        updateSaveState();
        renderTabs(rerenderSelections);
      }
    });
  }
  activateTab(file.path, rerenderSelections);
}

export function activateTab(path, rerenderSelections) {
  const tab = findTab(path);
  if (!tab) {
    return;
  }
  state.activePath = tab.path;
  state.activeView = "file";
  elements.emptyEditor.hidden = true;
  elements.activePath.textContent = tab.path;
  elements.fileState.textContent = fileStateLabel(tab);
  state.editor?.setModel(tab.model);
  showFileView();
  updateSaveState();
  renderTabs(rerenderSelections);
  rerenderSelections();
}

export function closeActiveFile(rerenderSelections) {
  void closeTab(state.activePath, rerenderSelections);
}

export async function closeTab(path, rerenderSelections) {
  const index = state.openTabs.findIndex((tab) => tab.path === path);
  if (index < 0) {
    return;
  }
  if (state.openTabs[index]?.dirty && !await confirmAction({
    title: t("closeFile"),
    body: t("unsavedCloseConfirm"),
  })) {
    return;
  }
  const [tab] = state.openTabs.splice(index, 1);
  tab?.model.dispose();
  if (state.activePath === path) {
    const next = state.openTabs[index] || state.openTabs[index - 1] || null;
    if (next) {
      activateTab(next.path, rerenderSelections);
      return;
    }
    clearEditor();
  }
  renderTabs(rerenderSelections);
  rerenderSelections();
}

export function renameOpenPath(fromPath, toPath, type, rerenderSelections) {
  for (const tab of state.openTabs) {
    if (isRenamedPath(tab.path, fromPath, type)) {
      tab.path = tab.path === fromPath ? toPath : `${toPath}${tab.path.slice(fromPath.length)}`;
    }
  }
  if (state.activePath === fromPath) {
    state.activePath = toPath;
  } else if (type === "directory" && isSameOrChildPath(fromPath, state.activePath)) {
    state.activePath = `${toPath}${state.activePath.slice(fromPath.length)}`;
  }
  if (state.activePath) {
    elements.activePath.textContent = state.activePath;
  }
  renderTabs(rerenderSelections);
  updateSaveState();
}

export function deleteOpenPath(deletedPath, type, rerenderSelections) {
  const affectedTabs = state.openTabs.filter((tab) => isRenamedPath(tab.path, deletedPath, type));
  for (const tab of affectedTabs) {
    const index = state.openTabs.indexOf(tab);
    if (index >= 0) {
      state.openTabs.splice(index, 1);
    }
    tab.model.dispose();
  }
  if (isRenamedPath(state.activePath, deletedPath, type)) {
    const next = state.openTabs[0] || null;
    if (next) {
      activateTab(next.path, rerenderSelections || (() => undefined));
      return;
    }
    clearEditor();
  }
  renderTabs(rerenderSelections);
  updateSaveState();
  rerenderSelections?.();
}

function isRenamedPath(path, targetPath, type) {
  return type === "directory" ? isSameOrChildPath(targetPath, path) : path === targetPath;
}

function clearEditor() {
  state.activePath = "";
  state.activeView = "file";
  state.originalModel?.dispose();
  state.modifiedModel?.dispose();
  state.originalModel = null;
  state.modifiedModel = null;
  state.editor?.setModel(null);
  if (state.diffEditor) {
    state.diffEditor.setModel(null);
  }
  elements.diffHost.hidden = true;
  elements.editorHost.style.display = "";
  elements.activePath.textContent = t("noFileOpen");
  elements.fileState.textContent = "";
  elements.emptyEditor.hidden = false;
  elements.diffTab.classList.remove("active");
  updateSaveState();
}

export function showFileView() {
  if (!state.activePath) {
    return;
  }
  const tab = activeTab();
  if (tab) {
    state.editor?.setModel(tab.model);
  }
  state.activeView = "file";
  elements.diffTab.classList.remove("active");
  if (state.diffEditor) {
    elements.diffHost.hidden = true;
  }
  if (state.editor) {
    elements.editorHost.style.display = "";
    state.editor.layout();
  }
  updateSaveState();
  renderTabs();
}

export async function showDiffView(path, rerenderSelections) {
  const targetPath = path || state.activePath || "";
  const result = await requestJson(`/api/git/diff?path=${encodeURIComponent(targetPath)}`);
  state.activePath = targetPath;
  state.activeView = "diff";
  elements.activePath.textContent = targetPath || t("diff");
  elements.emptyEditor.hidden = true;
  elements.diffTab.classList.add("active");
  elements.fileState.textContent = t("diff");

  if (state.editor) {
    elements.editorHost.style.display = "none";
  }
  elements.diffHost.hidden = false;
  if (!state.diffEditor) {
    state.diffEditor = monaco.editor.createDiffEditor(elements.diffHost, {
      theme: "kitty-light",
      automaticLayout: true,
      minimap: { enabled: false },
      renderSideBySide: false,
      readOnly: true,
    });
  }

  state.originalModel?.dispose();
  state.modifiedModel?.dispose();
  state.originalModel = monaco.editor.createModel("", "diff");
  state.modifiedModel = monaco.editor.createModel(result.diff || "No diff.", "diff");
  state.diffEditor.setModel({ original: state.originalModel, modified: state.modifiedModel });
  layoutDiffEditor();
  updateSaveState();
  rerenderSelections();
}

export async function saveActiveFile(refreshGitStatus) {
  const tab = activeTab();
  if (!state.activePath || !state.editor || !tab) {
    return;
  }
  const content = tab.model.getValue();
  const result = await requestJson("/api/files/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: state.activePath, content }),
  });
  tab.dirty = false;
  tab.saved = true;
  tab.size = result.size;
  tab.truncated = false;
  updateSaveState();
  renderTabs();
  await refreshGitStatus();
}

export async function syncChangedFiles(paths, refreshGitStatus) {
  const changedPaths = Array.isArray(paths) ? paths : [];
  for (const path of changedPaths) {
    const tab = findTab(path);
    if (!tab || tab.dirty) {
      continue;
    }
    try {
      const file = await requestJson(`/api/files/read?path=${encodeURIComponent(path)}`);
      if (tab.model.getValue() === file.content) {
        tab.size = file.size;
        tab.truncated = file.truncated;
        tab.missing = false;
        continue;
      }
      try {
        state.syncingEditor = true;
        tab.model.setValue(file.content);
      } finally {
        state.syncingEditor = false;
      }
      tab.dirty = false;
      tab.saved = false;
      tab.missing = false;
      tab.size = file.size;
      tab.truncated = file.truncated;
    } catch {
      tab.missing = true;
      tab.saved = false;
    }
  }
  updateSaveState();
  renderTabs();
  await refreshGitStatus();
}

export function updateSaveState() {
  const tab = activeTab();
  elements.saveButton.disabled = state.activeView !== "file" || !tab || !state.activePath;
  elements.closeFileButton.disabled = !state.activePath;
  if (state.activeView === "file" && tab) {
    elements.fileState.textContent = tab.dirty ? t("modified") : fileStateLabel(tab);
  }
}

export function renderTabs(rerenderSelections) {
  elements.openTabs.replaceChildren();
  for (const tab of state.openTabs) {
    const root = document.createElement("div");
    root.className = `editor-tab ${tab.path === state.activePath && state.activeView === "file" ? "active" : ""}`;
    const activate = document.createElement("button");
    activate.type = "button";
    activate.className = "tab-activate";
    activate.title = tab.path;
    activate.innerHTML = '<i class="bi bi-file-earmark-code"></i><span></span>';
    activate.querySelector("span").textContent = `${tab.dirty ? "* " : ""}${tab.path.split(/[\\/]/).pop() || tab.path}`;
    activate.addEventListener("click", () => activateTab(tab.path, rerenderSelections || (() => undefined)));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close btn-close";
    close.title = t("closeFile");
    close.setAttribute("aria-label", t("closeFile"));
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      void closeTab(tab.path, rerenderSelections || (() => undefined));
    });
    root.append(activate, close);
    elements.openTabs.appendChild(root);
  }
}

function findTab(path) {
  return state.openTabs.find((tab) => tab.path === path);
}

function activeTab() {
  return findTab(state.activePath);
}

function fileStateLabel(tab) {
  const size = formatBytes(tab.size);
  if (tab.saved) {
    return `${t("saved")} / ${size}`;
  }
  if (tab.missing) {
    return t("fileMissing");
  }
  return tab.truncated ? `${t("truncated")} / ${size}` : size;
}

function layoutDiffEditor() {
  requestAnimationFrame(() => {
    state.diffEditor?.layout();
    requestAnimationFrame(() => state.diffEditor?.layout());
  });
}
