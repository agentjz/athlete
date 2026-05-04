import { requestJson } from "./api.js";
import { elements } from "./dom.js";
import { escapeHtml } from "./markdown.js";
import { state } from "./state.js";
import { iconForFile } from "./utils.js";
import { t } from "./i18n.js";

let openFileHandler = async () => {};
let showDiffHandler = async () => {};

export function configureExplorer(handlers) {
  openFileHandler = handlers.openFile;
  showDiffHandler = handlers.showDiff;
}

export async function refreshTree(options = {}) {
  if (options.expandPath !== undefined) {
    addExpandedAncestors(options.expandPath);
  }
  state.tree = await requestJson("/api/files/tree");
  await loadExpandedBranches(state.tree);
  elements.fileTree.replaceChildren(renderTreeNode(state.tree, true));
}

export async function refreshGitStatus() {
  state.gitFiles = await requestJson("/api/git/status");
  renderChangedFiles();
}

export function rerenderSelections() {
  if (state.tree) {
    elements.fileTree.replaceChildren(renderTreeNode(state.tree, true));
  }
  renderChangedFiles();
}

function renderTreeNode(node, isRoot = false) {
  const container = document.createElement("div");
  const expanded = isRoot || state.expandedPaths.has(node.path);
  const gitState = node.gitState || null;

  if (!isRoot) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "tree-item",
      node.path === state.selectedPath || node.path === state.activePath ? "active" : "",
      node.ignored ? "ignored" : "",
    ].filter(Boolean).join(" ");

    const toggle = node.type === "directory"
      ? `<i class="bi ${expanded ? "bi-chevron-down" : "bi-chevron-right"} tree-toggle"></i>`
      : '<span class="tree-toggle-spacer"></span>';
    const icon = node.type === "directory"
      ? `<i class="bi ${expanded ? "bi-folder2-open" : "bi-folder2"}"></i>`
      : `<i class="bi ${iconForFile(node.name)}"></i>`;
    button.innerHTML = `${toggle}${icon}<span class="label"></span>`;
    button.querySelector(".label").textContent = node.name;
    const badge = renderGitBadge(gitState);
    if (badge) {
      button.appendChild(badge);
    }

    if (node.type === "directory") {
      button.addEventListener("click", async () => {
        selectNode(node);
        await toggleDirectory(node);
        elements.fileTree.replaceChildren(renderTreeNode(state.tree, true));
      });
    } else {
      button.addEventListener("click", () => {
        selectNode(node);
        void openFileHandler(node.path);
      });
    }
    container.appendChild(button);
  }

  if (node.type === "directory" && Array.isArray(node.children) && expanded) {
    const children = document.createElement("div");
    children.className = isRoot ? "" : "tree-children";
    for (const child of node.children) {
      children.appendChild(renderTreeNode(child));
    }
    container.appendChild(children);
  }
  return container;
}

async function toggleDirectory(node) {
  if (state.expandedPaths.has(node.path)) {
    state.expandedPaths.delete(node.path);
    return;
  }
  if (node.loaded === false) {
    const loaded = await requestJson(`/api/files/tree?path=${encodeURIComponent(node.path)}`);
    node.children = loaded.children || [];
    node.loaded = true;
  }
  state.expandedPaths.add(node.path);
}

function selectNode(node) {
  state.selectedPath = node.path;
  state.selectedType = node.type;
}

async function loadExpandedBranches(node) {
  if (node.type !== "directory" || !Array.isArray(node.children)) {
    return;
  }
  for (const child of node.children) {
    if (child.type !== "directory" || !state.expandedPaths.has(child.path)) {
      continue;
    }
    if (child.loaded === false) {
      const loaded = await requestJson(`/api/files/tree?path=${encodeURIComponent(child.path)}`);
      child.children = loaded.children || [];
      child.loaded = true;
    }
    await loadExpandedBranches(child);
  }
}

function addExpandedAncestors(value) {
  const parts = String(value || "").split("/").filter(Boolean);
  let current = "";
  state.expandedPaths.add("");
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    state.expandedPaths.add(current);
  }
}

function renderChangedFiles() {
  elements.changedFiles.replaceChildren();
  const visibleFiles = state.gitFiles.filter((file) => !file.ignored);
  if (visibleFiles.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-2 py-1 text-secondary";
    empty.textContent = t("noChanges");
    elements.changedFiles.appendChild(empty);
    return;
  }

  for (const file of visibleFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `changed-file ${file.path === state.activePath ? "active" : ""}`;
    button.innerHTML = `<span class="badge text-bg-light border">${escapeHtml(gitLabel(file))}</span><span class="label"></span>`;
    button.querySelector(".label").textContent = file.path;
    button.addEventListener("click", () => void showDiffHandler(file.path));
    elements.changedFiles.appendChild(button);
  }
}

function renderGitBadge(file) {
  if (!file) {
    return null;
  }
  const label = gitLabel(file);
  if (!label) {
    return null;
  }
  const badge = document.createElement("span");
  badge.className = `git-badge ${file.ignored ? "ignored" : file.index === "?" ? "untracked" : file.index === "D" || file.workingTree === "D" ? "deleted" : ""}`;
  badge.textContent = label;
  return badge;
}

function gitLabel(file) {
  if (file.ignored) {
    return "";
  }
  if (file.index === "?" && file.workingTree === "?") {
    return "U";
  }
  if (file.index === "A" || file.workingTree === "A") {
    return "A";
  }
  if (file.index === "D" || file.workingTree === "D") {
    return "D";
  }
  if (file.index === "M" || file.workingTree === "M") {
    return "M";
  }
  const raw = `${file.index || ""}${file.workingTree || ""}`.trim();
  return raw || "";
}
