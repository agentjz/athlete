import { ToolExecutionError } from "../../core/errors.js";
import { createLineAnchorHash, type FileEditAnchor } from "./editAnchor.js";

export interface AnchoredMatch {
  start: number;
  end: number;
  oldString: string;
  startLine: number;
}

export function validateAnchorAgainstSource(
  source: string,
  anchor: FileEditAnchor,
  resolvedPath: string,
): void {
  if (anchor.path !== resolvedPath) {
    throw new ToolExecutionError("The provided edit anchor belongs to a different file. A fresh read_file anchor for the target file is required.", {
      code: "EDIT_ANCHOR_PATH_MISMATCH",
      details: {
        expectedPath: resolvedPath,
        anchorPath: anchor.path,
      },
    });
  }

  const lines = source.split(/\r?\n/);
  const anchoredLine = lines[anchor.line - 1];
  if (anchoredLine === undefined) {
    throw new ToolExecutionError("The provided edit anchor no longer points to a valid line. Fresh read_file anchors are required.", {
      code: "EDIT_ANCHOR_STALE",
      details: {
        line: anchor.line,
      },
    });
  }

  if (createLineAnchorHash(anchoredLine) !== anchor.hash) {
    throw new ToolExecutionError("The provided edit anchor is stale because the targeted line changed. Fresh read_file anchors are required.", {
      code: "EDIT_ANCHOR_STALE",
      details: {
        line: anchor.line,
      },
    });
  }
}

export function findAnchoredOccurrences(source: string, oldString: string, anchor: FileEditAnchor): AnchoredMatch[] {
  const matches = findOccurrences(source, oldString);
  return matches.filter((match) => match.startLine === anchor.line);
}

function findOccurrences(source: string, oldString: string): AnchoredMatch[] {
  const matches: AnchoredMatch[] = [];
  let offset = 0;

  while (offset <= source.length) {
    const index = source.indexOf(oldString, offset);
    if (index === -1) {
      break;
    }

    matches.push({
      start: index,
      end: index + oldString.length,
      oldString,
      startLine: lineNumberAtOffset(source, index),
    });
    offset = index + oldString.length;
  }

  return matches;
}

function lineNumberAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }

  return line;
}
