import { requestJson } from "./api.js";
import { confirmAction } from "./confirm.js";
import { elements } from "./dom.js";
import { t } from "./i18n.js";
import { joinPath, parentPath } from "./paths.js";
import { state } from "./state.js";

let modal;
let activeAction;
let afterChange = async () => {};
let openFileHandler = async () => {};
let renameOpenPathHandler = () => {};
let deleteOpenPathHandler = () => {};

export function configurePathActions(handlers) {
  modal = new bootstrap.Modal(elements.pathActionModal);
  afterChange = handlers.afterChange;
  openFileHandler = handlers.openFile;
  renameOpenPathHandler = handlers.renameOpenPath;
  deleteOpenPathHandler = handlers.deleteOpenPath;
  elements.pathActionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPathAction();
  });
}

export function showCreateFileDialog() {
  showPathDialog({
    kind: "file",
    title: t("newFile"),
    label: t("filePath"),
    help: t("createFileHelp"),
    value: joinPath(selectedDirectory(), "untitled.txt"),
    submitLabel: t("create"),
  });
}

export function showCreateFolderDialog() {
  showPathDialog({
    kind: "folder",
    title: t("newFolder"),
    label: t("folderPath"),
    help: t("createFolderHelp"),
    value: joinPath(selectedDirectory(), "new-folder"),
    submitLabel: t("create"),
  });
}

export function showRenameDialog() {
  if (!state.selectedPath) {
    return;
  }
  showPathDialog({
    kind: "rename",
    title: t("renamePath"),
    label: t("newName"),
    help: t("renameHelp"),
    value: state.selectedPath,
    submitLabel: t("rename"),
  });
}

export async function deleteSelectedPath() {
  if (!state.selectedPath) {
    return;
  }
  const confirmed = await confirmAction({
    title: t("deletePath"),
    body: `${t("deletePathConfirm")}\n\n${state.selectedPath}`,
  });
  if (!confirmed) {
    return;
  }
  const deleted = await requestJson("/api/files/delete", jsonBody({ path: state.selectedPath }));
  deleteOpenPathHandler(deleted.path, deleted.type);
  state.selectedPath = parentPath(deleted.path);
  state.selectedType = "directory";
  await afterChange({ expandPath: state.selectedPath });
}

async function submitPathAction() {
  const value = elements.pathActionInput.value.trim().replace(/\\/g, "/");
  if (!activeAction || !value) {
    showError(t("pathRequired"));
    return;
  }
  elements.pathActionSubmit.disabled = true;
  clearError();
  try {
    await runPathAction(value);
  } catch (error) {
    showError(error.message || String(error));
  } finally {
    elements.pathActionSubmit.disabled = false;
  }
}

async function runPathAction(value) {
  if (activeAction.kind === "file") {
    const created = await requestJson("/api/files/create", jsonBody({ path: value }));
    modal.hide();
    await afterChange({ expandPath: parentPath(created.path) });
    await openFileHandler(created.path);
    return;
  }
  if (activeAction.kind === "folder") {
    const created = await requestJson("/api/directories/create", jsonBody({ path: value }));
    modal.hide();
    state.expandedPaths.add(created.path);
    await afterChange({ expandPath: parentPath(created.path) });
    return;
  }
  const renamed = await requestJson("/api/files/rename", jsonBody({
    from: state.selectedPath,
    to: resolveRenameTarget(value),
  }));
  modal.hide();
  renameOpenPathHandler(renamed.from, renamed.to, renamed.type);
  state.selectedPath = renamed.to;
  state.selectedType = renamed.type;
  await afterChange({ expandPath: parentPath(renamed.to) });
  if (renamed.type === "file") {
    await openFileHandler(renamed.to);
  }
}

function showPathDialog(action) {
  activeAction = action;
  clearError();
  elements.pathActionTitle.textContent = action.title;
  elements.pathActionLabel.textContent = action.label;
  elements.pathActionHelp.textContent = action.help;
  elements.pathActionInput.value = action.value;
  elements.pathActionSubmit.textContent = action.submitLabel;
  modal.show();
  setTimeout(() => {
    elements.pathActionInput.focus();
    elements.pathActionInput.select();
  });
}

function showError(message) {
  elements.pathActionInput.classList.add("is-invalid");
  elements.pathActionError.textContent = message;
}

function clearError() {
  elements.pathActionInput.classList.remove("is-invalid");
  elements.pathActionError.textContent = "";
}

function selectedDirectory() {
  if (state.selectedType === "directory") {
    return state.selectedPath;
  }
  return parentPath(state.selectedPath);
}

function resolveRenameTarget(value) {
  if (value.includes("/")) {
    return value;
  }
  return joinPath(parentPath(state.selectedPath), value);
}

function jsonBody(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
