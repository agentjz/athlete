import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildCliProgram } from "../src/cli.js";
import type { SessionRecord } from "../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

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
        unfinishedReason: "pause.verification_awaiting_user",
        terminalTransition: {
          action: "pause",
          reason: {
            code: "pause.verification_awaiting_user",
            pendingPaths: ["report/summary.md"],
            pauseReason: "Need a user-directed verification check.",
            attempts: 3,
            reminderCount: 1,
            noProgressCount: 2,
          },
          timestamp: "2026-04-11T00:00:00.000Z",
        },
        verification: {
          status: "awaiting_user",
          pendingPaths: ["report/summary.md"],
          attempts: 3,
          reminderCount: 1,
          noProgressCount: 2,
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
  assert.equal(parsed.unfinishedReason, "pause.verification_awaiting_user");
  assert.equal(parsed.terminalTransition?.reason?.code, "pause.verification_awaiting_user");
  assert.equal(parsed.verification?.status, "awaiting_user");
  assert.equal(parsed.acceptance?.phase, "verify_outputs");
});
