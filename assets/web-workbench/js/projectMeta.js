import { elements } from "./dom.js";
import { t } from "./i18n.js";
import { state } from "./state.js";

export function renderProjectMeta() {
  if (!state.project) {
    return;
  }
  elements.projectName.textContent = state.project.projectName;
  elements.runtimeMeta.textContent = formatModelName(state.project.model);
  if (state.project.mode === "spec") {
    elements.modeMeta.textContent = "Spec";
    return;
  }
  elements.modeMeta.textContent = "Agent";
}

function formatModelName(value) {
  return String(value || "")
    .replace(/^deepseek-/i, "DeepSeek ")
    .replace(/^gpt-/i, "GPT-")
    .replace(/\bv(\d+)\b/gi, "v$1")
    .replace(/-/g, " ");
}
