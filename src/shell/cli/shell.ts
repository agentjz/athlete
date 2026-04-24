import type { InteractionShell } from "../../interaction/shell.js";
import { createCliOutputPort } from "./output.js";
import { createReadlineInputPort } from "./readlineInput.js";
import { createCliTurnDisplay } from "./turnDisplay.js";

export function createReadlineInteractionShell(): InteractionShell {
  return {
    input: createReadlineInputPort(),
    output: createCliOutputPort(),
    createTurnDisplay(options) {
      return createCliTurnDisplay(options);
    },
  };
}

export function createCliInteractionShell(): InteractionShell {
  return createReadlineInteractionShell();
}
