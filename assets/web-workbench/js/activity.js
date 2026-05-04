import { elements, statusLabel } from "./dom.js";

const ACTIVITY_FRAMES = ["|", "/", "-", "\\"];

let timer = null;
let frameIndex = 0;
let activeState = "idle";

export function startThinking(label = "running") {
  startActivity("thinking", "思考中", 90);
}

export function startReplying(label = "streaming") {
  startActivity("replying", "回复中", 130);
}

export function stopActivity(label = "idle") {
  activeState = "idle";
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
  elements.activityLine.hidden = true;
  elements.activityLine.dataset.workState = "idle";
  elements.activityLine.replaceChildren(elements.activitySpinner, elements.activityText);
  elements.activitySpinner.textContent = "";
  elements.activityText.textContent = "";
}

export function setActivityLabel(stateName, label) {
  const displayLabel = stateName === "thinking" ? "思考中" : stateName === "replying" ? "回复中" : label;
  if (stateName === "thinking" || stateName === "replying") {
    showActivityLine(stateName, displayLabel);
  }
}

export function showChangeSummary(summary, onViewChanges) {
  stopTimer();
  activeState = "idle";
  const filesChanged = Number(summary?.filesChanged ?? 0);
  const insertions = Number(summary?.insertions ?? 0);
  const deletions = Number(summary?.deletions ?? 0);
  if (filesChanged <= 0) {
    stopActivity("idle");
    return;
  }

  elements.activityLine.hidden = false;
  elements.activityLine.dataset.workState = "changes";
  const text = document.createElement("span");
  text.className = "activity-text";
  text.textContent = `${filesChanged} 个文件已更改`;
  const added = document.createElement("span");
  added.className = "change-count added";
  added.textContent = `+${insertions}`;
  const removed = document.createElement("span");
  removed.className = "change-count removed";
  removed.textContent = `-${deletions}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "change-link";
  button.textContent = "查看更改";
  button.addEventListener("click", onViewChanges);
  elements.activityLine.replaceChildren(text, added, removed, button);
}

function startActivity(stateName, label, intervalMs) {
  showActivityLine(stateName, statusLabel(label));
  if (timer && activeState === stateName) {
    return;
  }
  stopTimer();
  activeState = stateName;
  frameIndex = 0;
  renderFrame();
  timer = window.setInterval(renderFrame, intervalMs);
}

function stopTimer() {
  if (!timer) {
    return;
  }
  window.clearInterval(timer);
  timer = null;
}

function showActivityLine(stateName, label) {
  elements.activityLine.hidden = false;
  elements.activityLine.dataset.workState = stateName;
  if (!elements.activityLine.contains(elements.activitySpinner)) {
    elements.activityLine.replaceChildren(elements.activitySpinner, elements.activityText);
  }
  elements.activityText.textContent = label;
}

function renderFrame() {
  if (activeState === "idle") {
    return;
  }
  const frame = ACTIVITY_FRAMES[frameIndex];
  elements.activitySpinner.textContent = frame;
  frameIndex = (frameIndex + 1) % ACTIVITY_FRAMES.length;
}
