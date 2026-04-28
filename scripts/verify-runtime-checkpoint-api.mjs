#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildInternalWakeInput,
} from "../.test-build/src/agent/checkpoint.js";
import { runManagedAgentTurn } from "../.test-build/src/agent/managedTurn.js";
import { runAgentTurn } from "../.test-build/src/agent/runTurn.js";
import { SessionStore } from "../.test-build/src/agent/sessionStore.js";
import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "deadmouse-runtime-checkpoint-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd(), mode: "agent" });
  if (!resolved.apiKey) {
    throw new Error("Missing DEADMOUSE_API_KEY in .deadmouse/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    yieldAfterToolSteps: 1,
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  const phaseOneRegistry = createRound2ApiRegistry(workspace);
  const phaseOneToolCalls = [];
  const phaseTwoToolCalls = [];
  const phaseOneSession = await sessionStore.create(workspace);

  const phaseOneResult = await runAgentTurn({
    input: [
      "Runtime checkpoint real API validation.",
      "Overall goal: after the session is reloaded from disk, write validation/runtime-checkpoint-summary.md.",
      "That final markdown must say the checkpoint existed, the session resumed from disk, and capture_round2_checkpoint was not repeated in phase two.",
      "For this first phase only, call capture_round2_checkpoint exactly once and do not call any other tool in the first response.",
    ].join(" "),
    cwd: workspace,
    config,
    yieldAfterToolSteps: 1,
    session: phaseOneSession,
    sessionStore,
    toolRegistry: phaseOneRegistry,
    callbacks: {
      onToolCall(name) {
        phaseOneToolCalls.push(name);
      },
    },
  });

  const reloaded = await sessionStore.load(phaseOneResult.session.id);
  const checkpoint = reloaded.checkpoint;
  const checkpointExists = Boolean(checkpoint?.objective);
  const checkpointStoragePath = checkpoint?.priorityArtifacts?.find((artifact) =>
    artifact.toolName === "capture_round2_checkpoint" && artifact.storagePath
  )?.storagePath;
  const phaseTwoRegistry = createRound2ApiRegistry(workspace);
  const runtimeIdentity = {
    kind: "teammate",
    name: "runtime-verifier",
    role: "checkpoint_runtime",
    teamName: "verification",
  };
  const phaseTwoInput = buildInternalWakeInput(runtimeIdentity);

  const phaseTwoResult = await runManagedAgentTurn({
    input: phaseTwoInput,
    cwd: workspace,
    config: {
      ...config,
      yieldAfterToolSteps: 6,
    },
    session: reloaded,
    sessionStore,
    toolRegistry: phaseTwoRegistry,
    callbacks: {
      onToolCall(name) {
        phaseTwoToolCalls.push(name);
      },
    },
    identity: runtimeIdentity,
  });

  const finalSession = await sessionStore.load(phaseTwoResult.session.id);
  const summaryPath = path.join(workspace, "validation", "runtime-checkpoint-summary.md");
  const summaryText = await fs.readFile(summaryPath, "utf8");
  const repeatedSetupInPhaseTwo = phaseTwoToolCalls.includes("capture_round2_checkpoint");

  const output = {
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: phaseOneResult.session.id,
    checkpointExists,
    checkpointPhaseAfterPhaseOne: checkpoint?.flow?.phase ?? null,
    checkpointObjective: checkpoint?.objective ?? null,
    checkpointNextStep: checkpoint?.nextStep ?? null,
    checkpointStoragePath,
    phaseOneYielded: phaseOneResult.yielded,
    phaseOneToolCalls,
    reloadedFromDisk: reloaded.id === phaseOneResult.session.id,
    phaseTwoToolCalls,
    repeatedSetupInPhaseTwo,
    finalCheckpointStatus: finalSession.checkpoint?.status ?? null,
    summaryPath: path.relative(workspace, summaryPath),
    summaryPreview: summaryText.slice(0, 320),
  };

  console.log(JSON.stringify(output, null, 2));

  if (!phaseOneResult.yielded) {
    throw new Error("Phase one did not yield after the checkpoint setup step.");
  }
  if (!checkpointExists) {
    throw new Error("Checkpoint was not persisted into the reloaded session.");
  }
  if (!checkpointStoragePath) {
    throw new Error("Checkpoint did not keep the recoverable externalized artifact reference.");
  }
  if (!phaseOneToolCalls.includes("capture_round2_checkpoint")) {
    throw new Error("Phase one did not call capture_round2_checkpoint.");
  }
  if (repeatedSetupInPhaseTwo) {
    throw new Error("Phase two repeated capture_round2_checkpoint instead of resuming from the checkpoint.");
  }
  if (!phaseTwoToolCalls.includes("write_resume_summary")) {
    throw new Error("Phase two did not write validation/runtime-checkpoint-summary.md.");
  }
  if (!summaryText.trim()) {
    throw new Error("The final round2 resume summary file is empty.");
  }
}

function createRound2ApiRegistry(workspace) {
  const setupMarkerPath = path.join(workspace, ".checkpoint-ready");

  return {
    definitions: [
      createFunctionTool(
        "capture_round2_checkpoint",
        "One-time setup step for round2 validation. Call it exactly once before any resume summary is written. Never call it again after it has already succeeded.",
      ),
      createFunctionTool(
        "write_resume_summary",
        "Write validation/runtime-checkpoint-summary.md after capture_round2_checkpoint has already succeeded and the checkpoint has been reloaded from disk.",
        {
          path: {
            type: "string",
          },
          content: {
            type: "string",
          },
        },
        ["path", "content"],
      ),
    ],
    async execute(name, rawArgs) {
      const args = rawArgs ? JSON.parse(rawArgs) : {};

      switch (name) {
        case "capture_round2_checkpoint": {
          if (await exists(setupMarkerPath)) {
            return {
              ok: false,
              output: JSON.stringify(
                {
                  ok: false,
                  error: "capture_round2_checkpoint already completed for the current objective. Continue without repeating it.",
                },
                null,
                2,
              ),
            };
          }

          await fs.writeFile(setupMarkerPath, "ready\n", "utf8");
          return {
            ok: true,
            output: buildLargeCheckpointPayload(),
          };
        }
        case "write_resume_summary": {
          if (!(await exists(setupMarkerPath))) {
            return {
              ok: false,
              output: JSON.stringify(
                {
                  ok: false,
                  error: "capture_round2_checkpoint must succeed before write_resume_summary.",
                },
                null,
                2,
              ),
            };
          }

          const relativePath = String(args.path ?? "validation/runtime-checkpoint-summary.md");
          const absolutePath = path.resolve(workspace, relativePath);
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, String(args.content ?? ""), "utf8");
          return {
            ok: true,
            output: JSON.stringify(
              {
                ok: true,
                path: path.relative(workspace, absolutePath) || relativePath,
                preview: String(args.content ?? "").slice(0, 240),
              },
              null,
              2,
            ),
          };
        }
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  };
}

function createFunctionTool(name, description, properties = {}, required = []) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

function buildLargeCheckpointPayload() {
  return JSON.stringify(
    {
      ok: true,
      title: "Round2 checkpoint artifact",
      path: "validation/round2-phase-one.json",
      format: "json",
      content: "ROUND2-REAL-API::" + "R".repeat(24_000),
      entries: Array.from({ length: 80 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        type: "file",
      })),
      matches: Array.from({ length: 6 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        line: index + 1,
        text: `resume signal ${index + 1}`,
      })),
    },
    null,
    2,
  );
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
