import fs from "node:fs/promises";

import { resolveUserPath, truncateText } from "../../../../utils/fs.js";
import { recordToolChange } from "../../core/changeTracking.js";
import { ToolExecutionError } from "../../core/errors.js";
import { buildDiffPreview, okResult, parseArgs, readString } from "../../core/shared.js";
import { buildToolChangeFeedback } from "./toolChangeFeedback.js";
import { collectWriteDiagnostics } from "./writeDiagnostics.js";
import { findAnchoredOccurrences, validateAnchorAgainstSource } from "./editAnchorMatch.js";
import { readFileEditAnchor, type FileEditAnchor } from "./editAnchor.js";
import { buildFileEditIdentity, getFileEditIdentityMismatch, readFileEditIdentity } from "./editIdentity.js";
import type { RegisteredTool } from "../../core/types.js";

interface RequestedEdit {
  anchor: FileEditAnchor;
  oldString: string;
  newString: string;
}

interface PlannedEdit {
  start: number;
  end: number;
  oldString: string;
  newString: string;
  sourceIndex: number;
}

const fileEditLocks = new Map<string, Promise<void>>();

export const editFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit an existing file by replacing exact text from the original file. Requires the stable identity returned by read_file and is preferred over write_file for small surgical changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit.",
          },
          expected_identity: {
            type: "object",
            description: "Stable identity returned by read_file for this file. Required for existing-file edits.",
            properties: {
              version: {
                type: "number",
              },
              path: {
                type: "string",
              },
              sha256: {
                type: "string",
              },
              byteLength: {
                type: "number",
              },
              lineCount: {
                type: "number",
              },
            },
            required: ["path", "sha256", "byteLength", "lineCount"],
            additionalProperties: false,
          },
          edits: {
            type: "array",
            description: "Batch edit plan applied against the original file contents.",
            items: {
              type: "object",
              properties: {
                old_string: {
                  type: "string",
                  description: "Exact text to replace from the original file.",
                },
                anchor: {
                  type: "object",
                  description: "Formal line anchor returned by read_file for the start of this edit.",
                  properties: {
                    version: {
                      type: "number",
                    },
                    path: {
                      type: "string",
                    },
                    line: {
                      type: "number",
                    },
                    hash: {
                      type: "string",
                    },
                    preview: {
                      type: "string",
                    },
                  },
                  required: ["path", "line", "hash"],
                  additionalProperties: false,
                },
                new_string: {
                  type: "string",
                  description: "Replacement text.",
                },
              },
              required: ["anchor", "old_string", "new_string"],
              additionalProperties: false,
            },
          },
        },
        required: ["path", "expected_identity", "edits"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const expectedIdentity = readFileEditIdentity(args.expected_identity, "expected_identity");
    const edits = readRequestedEdits(args.edits);
    const resolved = resolveUserPath(targetPath, context.cwd);

    return withFileEditLock(resolved, async () => {
      const before = await fs.readFile(resolved, "utf8");
      const currentIdentity = buildFileEditIdentity(resolved, before);
      const mismatch = getFileEditIdentityMismatch(expectedIdentity, currentIdentity, resolved);
      if (mismatch) {
        throw new ToolExecutionError(mismatch, {
          code: "EDIT_IDENTITY_STALE",
          details: {
            path: resolved,
          },
        });
      }

      const plannedEdits = buildEditPlan(before, edits, resolved);
      const after = applyEditPlan(before, plannedEdits);

      if (after === before) {
        throw new ToolExecutionError(`edit_file did not change the file contents for ${resolved}`, {
          code: "EDIT_NOOP",
          details: {
            path: resolved,
          },
        });
      }

      const diff = buildDiffPreview(before, after);

      await fs.writeFile(resolved, after, "utf8");
      const changeRecord = await recordToolChange(context, {
        toolName: "edit_file",
        summary: `edit_file ${resolved}`,
        preview: diff,
        operations: [
          {
            path: resolved,
            kind: "update",
            binary: false,
            preview: diff,
            beforeText: before,
            afterText: after,
          },
        ],
      });
      const diagnostics = await collectWriteDiagnostics([resolved]);
      const feedback = buildToolChangeFeedback({
        toolName: "edit_file",
        changeId: changeRecord.change?.id,
        changedPaths: [resolved],
        diff: truncateText(diff, 6_000),
        diagnostics,
      });

      return okResult(
        JSON.stringify(
          {
            path: resolved,
            requestedEdits: edits.length,
            appliedEdits: plannedEdits.length,
            changedPaths: [resolved],
            changeId: changeRecord.change?.id,
            changeHistoryWarning: changeRecord.warning,
            diff: feedback.diff,
            diagnostics: feedback.diagnostics,
            sessionDiff: feedback.sessionDiff,
            preview: truncateText(diff, 6_000),
          },
          null,
          2,
        ),
        {
          changedPaths: [resolved],
          changeId: changeRecord.change?.id,
          ...feedback,
        },
      );
    });
  },
};

function readRequestedEdits(value: unknown): RequestedEdit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Tool argument "edits" must contain at least one edit.');
  }

  return value.map((entry, index) => readRequestedEdit(entry, `edits[${index}]`));
}

function readRequestedEdit(value: unknown, field: string): RequestedEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument "${field}" must be an object.`);
  }

  const record = value as Record<string, unknown>;
  return {
    anchor: readFileEditAnchor(record.anchor, `${field}.anchor`),
    oldString: readString(record.old_string, `${field}.old_string`),
    newString: readString(record.new_string, `${field}.new_string`),
  };
}

function buildEditPlan(before: string, request: RequestedEdit[], resolvedPath: string): PlannedEdit[] {
  const planned: PlannedEdit[] = [];

  request.forEach((edit, sourceIndex) => {
    validateAnchorAgainstSource(before, edit.anchor, resolvedPath);
    const matches = findAnchoredOccurrences(before, edit.oldString, edit.anchor);
    if (matches.length === 0) {
      throw new ToolExecutionError(`edit_file could not find edit ${sourceIndex + 1} at anchored line ${edit.anchor.line}. A fresh read_file anchor is required.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.anchor.line,
        },
      });
    }

    if (matches.length > 1) {
      throw new ToolExecutionError(`edit_file edit ${sourceIndex + 1} still matched multiple regions near anchored line ${edit.anchor.line}; merge the edit or make old_string more specific.`, {
        code: "EDIT_AMBIGUOUS",
        details: {
          editIndex: sourceIndex,
          matches: matches.length,
          line: edit.anchor.line,
        },
      });
    }

    const match = matches[0];
    if (!match) {
      throw new ToolExecutionError(`edit_file lost its anchored match for edit ${sourceIndex + 1}. A fresh read_file anchor is required.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.anchor.line,
        },
      });
    }

    planned.push({
      start: match.start,
      end: match.end,
      oldString: match.oldString,
      newString: edit.newString,
      sourceIndex,
    });
  });

  planned.sort((left, right) => left.start - right.start || left.end - right.end || left.sourceIndex - right.sourceIndex);
  assertNoOverlappingEdits(planned);
  return planned;
}

function assertNoOverlappingEdits(edits: PlannedEdit[]): void {
  for (let index = 1; index < edits.length; index += 1) {
    const previous = edits[index - 1];
    const current = edits[index];
    if (!previous || !current) {
      continue;
    }

    if (current.start < previous.end) {
      throw new ToolExecutionError(
        `edit_file edits ${previous.sourceIndex + 1} and ${current.sourceIndex + 1} overlap in the original file. Merge adjacent edits or make them more specific.`,
        {
          code: "EDIT_OVERLAP",
          details: {
            leftEditIndex: previous.sourceIndex,
            rightEditIndex: current.sourceIndex,
          },
        },
      );
    }
  }
}

function applyEditPlan(before: string, edits: PlannedEdit[]): string {
  if (edits.length === 0) {
    return before;
  }

  let cursor = 0;
  let result = "";

  for (const edit of edits) {
    result += before.slice(cursor, edit.start);
    result += edit.newString;
    cursor = edit.end;
  }

  result += before.slice(cursor);
  return result;
}

async function withFileEditLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = fileEditLocks.get(filePath) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  fileEditLocks.set(filePath, queued);
  await previous;

  try {
    return await action();
  } finally {
    release?.();
    if (fileEditLocks.get(filePath) === queued) {
      fileEditLocks.delete(filePath);
    }
  }
}
