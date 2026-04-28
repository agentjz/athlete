import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildCliProgram } from "../../src/cli.js";
import type { SessionRecord } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("CLI run prints a stable one-shot closeout contract for unfinished turns", async (t) => {
  const root = await createTempWorkspace("one-shot-cli-contract", t);
  const runtimeConfig = createTestRuntimeConfig(root);
  let stdout = "";

  const originalWriteSync = fs.writeSync;
  (fs.writeSync as unknown as (...args: unknown[]) => number) = ((fd: unknown, buffer: unknown) => {
    if (fd === 1) {
      stdout += String(buffer ?? "");
      return String(buffer ?? "").length;
    }

    return (originalWriteSync as unknown as (...args: unknown[]) => number)(fd, buffer);
  }) as never;

  t.after(() => {
    fs.writeSync = originalWriteSync;
  });

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config: runtimeConfig,
      paths: runtimeConfig.paths,
      overrides: {},
    }),
    runOneShot: async ({ session }: { session: SessionRecord }) => ({
      session,
      closeout: {
        sessionId: session.id,
        completed: false,
        unfinishedReason: "pause.managed_slice_budget_exhausted",
        terminalTransition: {
          action: "pause",
          reason: {
            code: "pause.managed_slice_budget_exhausted",
            pauseReason: "Managed slice budget exhausted.",
            slicesUsed: 3,
            maxSlices: 3,
            elapsedMs: 1000,
          },
          timestamp: "2026-04-11T00:00:00.000Z",
        },
        verification: {
          status: "failed",
          observedPaths: ["report/summary.md"],
          attempts: 3,
        },
        acceptance: {
          status: "active",
          phase: "verify_outputs",
          pendingChecks: ["http:homepage"],
          stalledPhaseCount: 0,
        },
      },
    }),
  });

  await program.parseAsync(["run", "Finish", "the", "task"], {
    from: "user",
  });

  const lastLine = stdout.trim().split(/\r?\n/).at(-1);
  assert(lastLine);
  const parsed = JSON.parse(lastLine) as Record<string, any>;

  assert.equal(typeof parsed.sessionId, "string");
  assert.equal(parsed.completed, false);
  assert.equal(parsed.unfinishedReason, "pause.managed_slice_budget_exhausted");
  assert.equal(parsed.terminalTransition?.reason?.code, "pause.managed_slice_budget_exhausted");
  assert.equal(parsed.verification?.status, "failed");
  assert.equal(parsed.acceptance?.phase, "verify_outputs");
});
