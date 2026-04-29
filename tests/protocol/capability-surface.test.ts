import assert from "node:assert/strict";
import test from "node:test";

import { createCapabilityProfile } from "../../src/protocol/capability.js";
import { createCapabilityPackage } from "../../src/protocol/package.js";
import { assertCapabilitySurfaceConvergence, createCapabilitySurface } from "../../src/protocol/capabilitySurface.js";

function createPackage(id: string, tools: string[]) {
  const profile = createCapabilityProfile({
    kind: "tool",
    id,
    name: id,
    description: id,
    tools,
    extensionPoint: "tests/protocol/capability-surface.test.ts",
  });
  return createCapabilityPackage({
    profile,
    source: {
      kind: "tool",
      builtIn: true,
    },
    adapter: {
      kind: "tool",
      id: `${id}.adapter`,
      description: "test adapter",
    },
    runnerType: "tool",
  });
}

test("capability surface converges when declared and exposed actions match", () => {
  const surface = createCapabilitySurface([
    createPackage("tool.pkg.a", ["background_run", "background_check"]),
  ]);
  assert.doesNotThrow(() => {
    assertCapabilitySurfaceConvergence(surface, ["background_check", "background_run"]);
  });
});

test("capability surface fails closed when declarations mention unavailable actions", () => {
  const surface = createCapabilitySurface([
    createPackage("tool.pkg.a", ["background_run", "background_check"]),
  ]);
  assert.throws(() => {
    assertCapabilitySurfaceConvergence(surface, ["background_run"]);
  }, /declares unavailable actions/i);
});

test("capability surface fails closed when exposed actions are undeclared", () => {
  const surface = createCapabilitySurface([
    createPackage("tool.pkg.a", ["background_run"]),
  ]);
  assert.throws(() => {
    assertCapabilitySurfaceConvergence(surface, ["background_run", "background_check"]);
  }, /missing declarations/i);
});
