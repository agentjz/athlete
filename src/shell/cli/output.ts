import type { ShellOutputPort } from "../../interaction/shell.js";
import { ui } from "../../utils/console.js";
import { writeStdout } from "../../utils/stdio.js";

export function createCliOutputPort(): ShellOutputPort {
  let lastInterruptAt = 0;

  return {
    plain: ui.plain,
    info: ui.info,
    warn: ui.warn,
    error: ui.error,
    dim: ui.dim,
    heading: ui.heading,
    tool: ui.tool,
    interrupt(message) {
      const now = Date.now();
      if (now - lastInterruptAt < 150) {
        return;
      }

      lastInterruptAt = now;
      writeStdout("\n");
      ui.warn(message);
    },
  };
}
