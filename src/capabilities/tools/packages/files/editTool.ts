import fs from "node:fs/promises";

import { resolveUserPath, truncateText } from "../../../../utils/fs.js";
import { decodeTextFileEnvelope, encodeTextFileEnvelope } from "../../../../utils/text.js";
import { recordToolChange } from "../../core/changeTracking.js";
import { ToolExecutionError } from "../../core/errors.js";
import { toToolRelativePath } from "../../core/pathDisplay.js";
import { buildDiffPreview, okResult, parseArgs, readOptionalNumber, readPossiblyEmptyString, readString } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { buildToolChangeFeedback } from "./toolChangeFeedback.js";
import { collectWriteDiagnostics } from "./writeDiagnostics.js";

interface RequestedEdit {
  oldText: string;
  newText: string;
  line?: number;
}

interface PlannedEdit {
  start: number;
  end: number;
  oldText: string;
  newText: string;
  sourceIndex: number;
}

const fileEditLocks = new Map<string, Promise<void>>();

export const editToolDefinition: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "edit",
      description: "Edit an existing file by replacing exact current text. Use read first when the target area is not fresh.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit.",
          },
          edits: {
            type: "array",
            description: "Batch edit plan applied against the current file contents.",
            items: {
              type: "object",
              properties: {
                oldText: {
                  type: "string",
                  description: "Exact current text to replace.",
                },
                newText: {
                  type: "string",
                  description: "Replacement text.",
                },
                line: {
                  type: "number",
                  description: "Optional 1-based line near the edit when oldText appears more than once.",
                },
              },
              required: ["oldText", "newText"],
              additionalProperties: false,
            },
          },
        },
        required: ["path", "edits"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const edits = readRequestedEdits(args.edits);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const displayPath = toToolRelativePath(context.cwd, resolved);

    return withFileEditLock(resolved, async () => {
      const beforeBuffer = await fs.readFile(resolved);
      const beforeEnvelope = decodeTextFileEnvelope(beforeBuffer);
      if (!beforeEnvelope) {
        throw new ToolExecutionError(`edit cannot edit binary or unsupported text encoding for ${displayPath}`, {
          code: "EDIT_UNREADABLE_TEXT",
          details: { path: resolved },
        });
      }

      const before = beforeEnvelope.text;
      const plannedEdits = buildEditPlan(before, edits, displayPath);
      const after = applyEditPlan(before, plannedEdits);
      if (after === before) {
        throw new ToolExecutionError(`edit did not change ${displayPath}`, {
          code: "EDIT_NOOP",
          details: { path: resolved },
        });
      }

      const diff = buildDiffPreview(before, after);
      await fs.writeFile(resolved, encodeTextFileEnvelope(after, beforeEnvelope));
      const changeRecord = await recordToolChange(context, {
        toolName: "edit",
        summary: `edit ${displayPath}`,
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
        toolName: "edit",
        changeId: changeRecord.change?.id,
        changedPaths: [resolved],
        diff: truncateText(diff, 6_000),
        diagnostics,
      });

      return okResult(
        JSON.stringify(
          {
            path: displayPath,
            requestedEdits: edits.length,
            appliedEdits: plannedEdits.length,
            changedPaths: [displayPath],
            changeId: changeRecord.change?.id,
            changeHistoryWarning: changeRecord.warning,
            diff: feedback.diff,
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
    oldText: readPossiblyEmptyString(record.oldText, `${field}.oldText`),
    newText: readPossiblyEmptyString(record.newText, `${field}.newText`),
    line: readOptionalNumber(record.line),
  };
}

function buildEditPlan(before: string, request: RequestedEdit[], displayPath: string): PlannedEdit[] {
  const planned: PlannedEdit[] = [];

  request.forEach((edit, sourceIndex) => {
    const matches = findEditOccurrences(before, edit.oldText, edit.line);
    if (matches.length === 0) {
      throw new ToolExecutionError(`edit could not find edit ${sourceIndex + 1}. Read around the target area, then retry with current oldText.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.line,
          readArgs: buildReadArgs(displayPath, edit.line),
        },
      });
    }

    if (matches.length > 1) {
      throw new ToolExecutionError(`edit ${sourceIndex + 1} matched multiple regions; add line or make oldText more specific.`, {
        code: "EDIT_AMBIGUOUS",
        details: {
          editIndex: sourceIndex,
          matches: matches.length,
          line: edit.line,
          readArgs: buildReadArgs(displayPath, edit.line),
        },
      });
    }

    const match = matches[0];
    if (!match) {
      throw new ToolExecutionError(`edit lost its match for edit ${sourceIndex + 1}. Read around the target area, then retry.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.line,
          readArgs: buildReadArgs(displayPath, edit.line),
        },
      });
    }

    planned.push({
      start: match.start,
      end: match.end,
      oldText: match.oldText,
      newText: edit.newText,
      sourceIndex,
    });
  });

  planned.sort((left, right) => left.start - right.start || left.end - right.end || left.sourceIndex - right.sourceIndex);
  assertNoOverlappingEdits(planned);
  return planned;
}

function findEditOccurrences(before: string, oldText: string, lineHint: number | undefined): Array<{ start: number; end: number; oldText: string }> {
  if (oldText.length === 0) {
    return [];
  }

  const matches: Array<{ start: number; end: number; oldText: string; distance: number }> = [];
  let offset = 0;
  while (offset <= before.length) {
    const index = before.indexOf(oldText, offset);
    if (index === -1) {
      break;
    }

    const line = lineForOffset(before, index);
    matches.push({
      start: index,
      end: index + oldText.length,
      oldText,
      distance: lineHint === undefined ? 0 : Math.abs(line - lineHint),
    });
    offset = index + Math.max(1, oldText.length);
  }

  if (lineHint === undefined || matches.length <= 1) {
    return matches.map(({ start, end, oldText }) => ({ start, end, oldText }));
  }

  const closestDistance = Math.min(...matches.map((match) => match.distance));
  return matches
    .filter((match) => match.distance === closestDistance)
    .map(({ start, end, oldText }) => ({ start, end, oldText }));
}

function lineForOffset(input: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (input.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function buildReadArgs(path: string, line: number | undefined): { path: string; offset: number; limit: number } {
  return {
    path,
    offset: Math.max(1, (line ?? 1) - 20),
    limit: 60,
  };
}

function assertNoOverlappingEdits(edits: PlannedEdit[]): void {
  for (let index = 1; index < edits.length; index += 1) {
    const previous = edits[index - 1];
    const current = edits[index];
    if (!previous || !current) {
      continue;
    }

    if (current.start < previous.end) {
      throw new ToolExecutionError(`edit entries ${previous.sourceIndex + 1} and ${current.sourceIndex + 1} overlap. Merge them or make oldText more specific.`, {
        code: "EDIT_OVERLAP",
        details: {
          leftEditIndex: previous.sourceIndex,
          rightEditIndex: current.sourceIndex,
        },
      });
    }
  }
}

function applyEditPlan(before: string, edits: PlannedEdit[]): string {
  let cursor = 0;
  let result = "";

  for (const edit of edits) {
    result += before.slice(cursor, edit.start);
    result += edit.newText;
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
