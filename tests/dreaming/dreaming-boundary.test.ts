import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertRealWorldGitUnchanged,
  createDreamingWriteBoundary,
  enforceDreamingToolBoundary,
} from "../../src/capabilities/dreaming/writeBoundary.js";
import type { BeforeToolCallHookContext } from "../../src/agent/types.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("Dreaming write boundary allows mirror-world writes and blocks real-world writes", () => {
  const real = path.resolve("C:/repo/real");
  const mirror = path.resolve("C:/repo/real/.kitty/worktrees/dreaming-x");
  const boundary = createDreamingWriteBoundary({
    realWorldPath: real,
    mirrorWorldPath: mirror,
  });

  assert.equal(enforceDreamingToolBoundary(context("write", { path: "src/new.ts" }), boundary), undefined);
  assert.equal(enforceDreamingToolBoundary(context("edit", { path: "src/a.ts", edits: [] }), boundary), undefined);
  assert.equal(enforceDreamingToolBoundary(context("download_url", { url: "https://example.com/a", path: "tmp/a.pdf" }), boundary), undefined);
  assert.match(
    enforceDreamingToolBoundary(context("write", { path: path.join(real, "src/main.ts") }), boundary)?.reason ?? "",
    /Mirror World/i,
  );
  assert.match(
    enforceDreamingToolBoundary(context("edit", { path: path.join(real, "src/main.ts"), edits: [] }), boundary)?.reason ?? "",
    /Mirror World/i,
  );
  assert.match(
    enforceDreamingToolBoundary(context("bash", { command: "npm test", cwd: real }), boundary)?.reason ?? "",
    /shell cwd/i,
  );
});

test("Dreaming blocks nested orchestration tools inside its own execution channel", () => {
  const boundary = createDreamingWriteBoundary({
    realWorldPath: path.resolve("C:/repo/real"),
    mirrorWorldPath: path.resolve("C:/repo/real/.kitty/worktrees/dreaming-x"),
  });

  assert.match(
    enforceDreamingToolBoundary(context("task", { description: "spawn nested" }), boundary)?.reason ?? "",
    /cannot call 'task'/i,
  );
  assert.match(
    enforceDreamingToolBoundary(context("worktree_remove", { name: "x" }), boundary)?.reason ?? "",
    /cannot call 'worktree_remove'/i,
  );
});

test("Dreaming real-world unchanged guard ignores runtime ledger but rejects material repo changes", async (t) => {
  const root = await createTempWorkspace("dreaming-real-world-guard", t);
  await initGitRepo(root);
  await fs.mkdir(path.join(root, ".kitty", "dreaming"), { recursive: true });
  await fs.writeFile(path.join(root, ".kitty", "dreaming", "state.json"), "{}", "utf8");

  await assert.doesNotReject(() => assertRealWorldGitUnchanged(root));

  await fs.writeFile(path.join(root, "real-change.txt"), "changed\n", "utf8");
  await assert.rejects(
    () => assertRealWorldGitUnchanged(root),
    /Real World boundary violation/i,
  );
});

test("Dreaming real-world guard accepts pre-existing dirty state when it does not change", async (t) => {
  const root = await createTempWorkspace("dreaming-real-world-baseline", t);
  await initGitRepo(root);
  await fs.writeFile(path.join(root, "pre-existing.txt"), "already dirty\n", "utf8");
  const baseline = ["?? pre-existing.txt"];

  await assert.doesNotReject(() => assertRealWorldGitUnchanged(root, baseline));

  await fs.writeFile(path.join(root, "new-change.txt"), "new\n", "utf8");
  await assert.rejects(
    () => assertRealWorldGitUnchanged(root, baseline),
    /Real World boundary violation/i,
  );
});

function context(name: string, args: Record<string, unknown>): BeforeToolCallHookContext {
  return {
    session: {
      id: "session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      messageCount: 0,
      messages: [],
    },
    toolCall: {
      id: `call-${name}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    },
  };
}

