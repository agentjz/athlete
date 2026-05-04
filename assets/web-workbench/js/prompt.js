import { requestJson } from "./api.js";
import { setActivityLabel, startThinking, stopActivity } from "./activity.js";
import { appendErrorMessage, appendUserMessage, resetTurnStream } from "./runtimeStream.js";
import { elements, setRunning } from "./dom.js";
import { t } from "./i18n.js";
import { state } from "./state.js";

export async function sendPrompt() {
  const input = elements.promptInput.value.trim();
  if (!input || state.running) {
    return;
  }
  elements.promptInput.value = "";
  appendUserMessage(input);
  resetTurnStream();
  setRunning(true, "running");
  startThinking("running");

  try {
    await requestJson("/api/session/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
  } catch (error) {
    appendErrorMessage(error.message, "error");
    setRunning(false, "error");
    stopActivity("error");
  }
}

export async function abortTurn() {
  if (!state.running) {
    return;
  }
  setActivityLabel("thinking", "aborting");
  elements.sendButton.disabled = true;
  try {
    await requestJson("/api/session/abort", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    appendErrorMessage(error.message, "abort");
    setRunning(false, "error");
    stopActivity("error");
  }
}
