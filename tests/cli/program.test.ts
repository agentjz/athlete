import assert from "node:assert/strict";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";

test("cli program exposes current top-level commands", () => {
  const program = buildCliProgram();
  const commands = program.commands.map((command) => command.name());

  for (const name of ["agent", "spec", "resume", "sessions", "config", "init", "changes", "undo", "diff", "doctor", "telegram", "version"]) {
    assert.equal(commands.includes(name), true, `${name} command should exist`);
  }
});
