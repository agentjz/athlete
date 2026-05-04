import fs from "node:fs/promises";

import { applyPatch, parsePatch, type StructuredPatch } from "diff";

import { ensureParentDirectory, fileExists, resolveUserPath, truncateText } from "../../../../utils/fs.js";
import { decodeTextFileEnvelope, encodeTextFileEnvelope, type TextFileEnvelope } from "../../../../utils/text.js";
import { recordToolChange, type PendingChangeOperation } from "../../core/changeTracking.js";
import { ToolExecutionError } from "../../core/errors.js";
import { toToolRelativePath } from "../../core/pathDisplay.js";
import { buildDiffPreview, normalizeDiffPath, okResult, parseArgs, readBoolean, readPossiblyEmptyString } from "../../core/shared.js";
import { buildToolChangeFeedback } from "./toolChangeFeedback.js";
import { collectWriteDiagnostics } from "./writeDiagnostics.js";
import type { RegisteredTool } from "../../core/types.js";

interface PatchPlan {
  patch: StructuredPatch;
  targetPath: string;
  resolvedPath: string;
  kind: "create" | "update" | "delete";
  before: string;
  after: string;
  envelope: TextFileEnvelope;
}

interface PatchApplySummary {
  path: string;
  absolutePath: string;
  kind: PatchPlan["kind"];
  hunks: number;
}

const patchLocks = new Map<string, Promise<void>>();

export const patchFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "patch_file",
      description: "Apply a standard unified diff patch to one or more files. Use this for fast structural or multi-file edits; use edit_file for small anchored replacements after read_file.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "string",
            description: "Unified diff text with ---/+++ file headers and @@ hunks. Paths are resolved from the current working directory.",
          },
          dry_run: {
            type: "boolean",
            description: "Validate and preview the patch without writing files.",
          },
        },
        required: ["patch"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const patchText = readPossiblyEmptyString(args.patch, "patch");
    const dryRun = readBoolean(args.dry_run, false);
    const parsed = parseUnifiedPatch(patchText);
    const lockPaths = buildPatchLockPaths(parsed, context.cwd);

    return withPatchLocks(lockPaths, async () => {
      const plans = await buildPatchPlans(parsed, context.cwd);
      const absoluteChangedPaths = plans.map((plan) => plan.resolvedPath);
      const changedPaths = plans.map((plan) => toToolRelativePath(context.cwd, plan.resolvedPath));

      if (!dryRun) {
        for (const plan of plans) {
          if (plan.kind === "delete") {
            await fs.rm(plan.resolvedPath, { force: true });
          } else {
            await ensureParentDirectory(plan.resolvedPath);
            await fs.writeFile(plan.resolvedPath, encodeTextFileEnvelope(plan.after, plan.envelope));
          }
        }
      }

      const operations = plans.map((plan) => toChangeOperation(plan));
      const combinedDiff = truncateText(
        plans.map((plan) => formatPlanDiff(plan)).join("\n\n"),
        12_000,
      );
      const changeRecord = dryRun
        ? { change: null as null, warning: undefined as string | undefined }
        : await recordToolChange(context, {
            toolName: "patch_file",
            summary: `patch_file ${plans.length} file${plans.length === 1 ? "" : "s"}`,
            preview: combinedDiff,
            operations,
          });
      const diagnostics = dryRun ? emptyDiagnosticsReport() : await collectWriteDiagnostics(absoluteChangedPaths);
      const feedback = buildToolChangeFeedback({
        toolName: "patch_file",
        changeId: changeRecord.change?.id,
        changedPaths: absoluteChangedPaths,
        diff: combinedDiff,
        diagnostics,
      });
      const appliedFiles = plans.map(toApplySummary);

      return okResult(
        JSON.stringify(
          {
            dryRun,
            applied: !dryRun,
            files: plans.length,
            appliedFiles,
            appliedHunks: appliedFiles.reduce((total, file) => total + file.hunks, 0),
            changedPaths,
            absoluteChangedPaths,
            changeId: changeRecord.change?.id,
            changeHistoryWarning: changeRecord.warning,
            diff: feedback.diff,
            diagnostics: feedback.diagnostics,
            sessionDiff: dryRun ? undefined : feedback.sessionDiff,
            preview: feedback.diff,
          },
          null,
          2,
        ),
        {
          changedPaths: absoluteChangedPaths,
          changeId: changeRecord.change?.id,
          ...feedback,
        },
      );
    });
  },
};

function parseUnifiedPatch(patchText: string): StructuredPatch[] {
  if (!patchText.trim()) {
    throw new ToolExecutionError("patch_file requires non-empty unified diff text.", {
      code: "PATCH_EMPTY",
    });
  }

  let parsed: StructuredPatch[];
  try {
    parsed = parsePatch(patchText);
  } catch (error) {
    throw new ToolExecutionError(`patch_file could not parse the unified diff: ${error instanceof Error ? error.message : String(error)}`, {
      code: "PATCH_PARSE_FAILED",
    });
  }

  if (parsed.length === 0) {
    throw new ToolExecutionError("patch_file did not find any file patches. Provide ---/+++ headers and @@ hunks.", {
      code: "PATCH_EMPTY",
    });
  }

  return parsed;
}

function buildPatchLockPaths(patches: StructuredPatch[], cwd: string): string[] {
  return patches.map((patch, index) => {
    const targetPath = getPatchTargetPath(patch);
    if (!targetPath) {
      throw new ToolExecutionError(`patch_file patch ${index + 1} does not contain a usable target path.`, {
        code: "PATCH_TARGET_MISSING",
        details: {
          patchIndex: index,
          oldFileName: patch.oldFileName,
          newFileName: patch.newFileName,
        },
      });
    }

    return resolveUserPath(targetPath, cwd);
  });
}

async function buildPatchPlans(patches: StructuredPatch[], cwd: string): Promise<PatchPlan[]> {
  const plans: PatchPlan[] = [];
  const seenTargets = new Set<string>();

  for (let index = 0; index < patches.length; index += 1) {
    const patch = patches[index];
    if (!patch) {
      continue;
    }

    const targetPath = getPatchTargetPath(patch);
    if (!targetPath) {
      throw new ToolExecutionError(`patch_file patch ${index + 1} does not contain a usable target path.`, {
        code: "PATCH_TARGET_MISSING",
        details: {
          patchIndex: index,
          oldFileName: patch.oldFileName,
          newFileName: patch.newFileName,
        },
      });
    }

    const resolvedPath = resolveUserPath(targetPath, cwd);
    if (seenTargets.has(resolvedPath)) {
      throw new ToolExecutionError(`patch_file received multiple patch sections for ${targetPath}; merge them into one file patch.`, {
        code: "PATCH_DUPLICATE_TARGET",
        details: {
          patchIndex: index,
          path: targetPath,
        },
      });
    }
    seenTargets.add(resolvedPath);

    plans.push(await buildPatchPlan(patch, targetPath, resolvedPath, index));
  }

  return plans;
}

async function buildPatchPlan(
  patch: StructuredPatch,
  targetPath: string,
  resolvedPath: string,
  patchIndex: number,
): Promise<PatchPlan> {
  const kind = getPatchKind(patch);
  const existed = await fileExists(resolvedPath);
  const envelope = existed
    ? await readExistingTextEnvelope(resolvedPath)
    : {
        text: "",
        encoding: "utf8",
        lineEnding: "\n",
      } satisfies TextFileEnvelope;

  if (kind === "update" && !existed) {
    throw new ToolExecutionError(`patch_file cannot update missing file ${targetPath}. Use a create-file patch or write_file.`, {
      code: "PATCH_TARGET_MISSING",
      details: {
        patchIndex,
        path: targetPath,
      },
    });
  }
  if (kind === "create" && existed) {
    throw new ToolExecutionError(`patch_file cannot create ${targetPath} because it already exists. Use an update patch or edit_file.`, {
      code: "PATCH_TARGET_EXISTS",
      details: {
        patchIndex,
        path: targetPath,
      },
    });
  }
  if (kind === "delete" && !existed) {
    throw new ToolExecutionError(`patch_file cannot delete missing file ${targetPath}.`, {
      code: "PATCH_TARGET_MISSING",
      details: {
        patchIndex,
        path: targetPath,
      },
    });
  }

  const after = applyPatch(envelope.text, patch, {
    fuzzFactor: 0,
    autoConvertLineEndings: false,
  });
  if (after === false) {
    throw new ToolExecutionError(`patch_file could not apply hunk for ${targetPath}. Fresh read_file around the failed area, then choose edit_file or rewrite patch_file.`, {
      code: "PATCH_HUNK_NOT_FOUND",
      details: {
        patchIndex,
        path: targetPath,
        hunkIndex: 0,
        expectedContextPreview: buildHunkPreview(patch.hunks[0]?.lines ?? []),
        readArgs: {
          path: targetPath,
          offset: Math.max(1, patch.hunks[0]?.oldStart ?? 1),
          limit: 80,
        },
      },
    });
  }

  return {
    patch,
    targetPath,
    resolvedPath,
    kind,
    before: envelope.text,
    after,
    envelope,
  };
}

async function readExistingTextEnvelope(resolvedPath: string): Promise<TextFileEnvelope> {
  const buffer = await fs.readFile(resolvedPath);
  const envelope = decodeTextFileEnvelope(buffer);
  if (!envelope) {
    throw new ToolExecutionError(`patch_file cannot edit binary or unsupported text encoding for ${resolvedPath}.`, {
      code: "PATCH_UNREADABLE_TEXT",
      details: {
        path: resolvedPath,
      },
    });
  }

  return envelope;
}

function getPatchTargetPath(patch: StructuredPatch): string | null {
  return normalizeDiffPath(patch.newFileName) ?? normalizeDiffPath(patch.oldFileName);
}

function getPatchKind(patch: StructuredPatch): PatchPlan["kind"] {
  if (patch.oldFileName === "/dev/null") {
    return "create";
  }
  if (patch.newFileName === "/dev/null") {
    return "delete";
  }
  return "update";
}

function toChangeOperation(plan: PatchPlan): PendingChangeOperation {
  const preview = formatPlanDiff(plan);
  return {
    path: plan.resolvedPath,
    kind: plan.kind,
    binary: false,
    preview,
    beforeText: plan.kind === "create" ? undefined : plan.before,
    afterText: plan.kind === "delete" ? undefined : plan.after,
  };
}

function toApplySummary(plan: PatchPlan): PatchApplySummary {
  return {
    path: plan.targetPath,
    absolutePath: plan.resolvedPath,
    kind: plan.kind,
    hunks: plan.patch.hunks.length,
  };
}

function formatPlanDiff(plan: PatchPlan): string {
  const header = `--- ${plan.kind === "create" ? "/dev/null" : plan.targetPath}\n+++ ${plan.kind === "delete" ? "/dev/null" : plan.targetPath}`;
  const diff = buildDiffPreview(plan.before, plan.after);
  return diff ? `${header}\n${diff}` : header;
}

function buildHunkPreview(lines: string[]): string {
  return truncateText(lines.join("\n"), 1_000);
}

function emptyDiagnosticsReport() {
  return {
    status: "clean" as const,
    errorCount: 0,
    warningCount: 0,
    files: [],
  };
}

async function withPatchLocks<T>(filePaths: string[], action: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(filePaths)].sort((left, right) => left.localeCompare(right));
  const previousLocks = sorted.map((filePath) => patchLocks.get(filePath) ?? Promise.resolve());
  const queuedLocks = new Map<string, Promise<void>>();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  for (const filePath of sorted) {
    const previous = patchLocks.get(filePath) ?? Promise.resolve();
    const queued = previous.then(() => gate);
    queuedLocks.set(filePath, queued);
    patchLocks.set(filePath, queued);
  }

  await Promise.all(previousLocks);

  try {
    return await action();
  } finally {
    release?.();
    for (const filePath of sorted) {
      if (patchLocks.get(filePath) === queuedLocks.get(filePath)) {
        patchLocks.delete(filePath);
      }
    }
  }
}
