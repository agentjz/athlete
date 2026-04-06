import fs from "node:fs/promises";
import path from "node:path";

import * as XLSX from "xlsx";

import { assertPathAllowed } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { SPREADSHEET_EXTENSIONS } from "../fileIntrospection.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

const DEFAULT_PREVIEW_SHEETS = 3;

export const readSpreadsheetTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_spreadsheet",
      description: "Read spreadsheet files like xlsx, xls, csv, tsv, or ods and return a structured preview.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Spreadsheet file path.",
          },
          sheet: {
            type: "string",
            description: "Optional sheet name or 1-based sheet index.",
          },
          max_rows: {
            type: "number",
            description: "Maximum preview rows per sheet.",
          },
          max_columns: {
            type: "number",
            description: "Maximum preview columns per row.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const requestedSheet =
      typeof args.sheet === "number" && Number.isFinite(args.sheet)
        ? String(Math.trunc(args.sheet))
        : typeof args.sheet === "string"
          ? args.sheet.trim()
          : "";
    const maxRows = clampNumber(args.max_rows, 1, 200, context.config.maxSpreadsheetPreviewRows);
    const maxColumns = clampNumber(args.max_columns, 1, 100, context.config.maxSpreadsheetPreviewColumns);
    const resolved = assertPathAllowed(targetPath, context.cwd, context.config);

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(resolved);
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === "ENOENT") {
        const suggestions = await findPathSuggestions(context.cwd, targetPath, context.projectContext);
        throw new ToolExecutionError(`File not found: ${targetPath}`, {
          code: "ENOENT",
          details: {
            requestedPath: targetPath,
            suggestions,
          },
        });
      }

      throw error;
    }

    const extension = path.extname(resolved).toLowerCase();
    if (!SPREADSHEET_EXTENSIONS.has(extension)) {
      throw new ToolExecutionError(`Unsupported spreadsheet format: ${extension || "unknown"}`, {
        code: "UNSUPPORTED_SPREADSHEET",
        details: {
          supportedExtensions: [...SPREADSHEET_EXTENSIONS].sort(),
        },
      });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(resolved, {
        cellDates: true,
        dense: true,
        raw: false,
      });
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to parse spreadsheet: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: "SPREADSHEET_PARSE_FAILED",
        },
      );
    }

    const sheetNames = workbook.SheetNames ?? [];
    if (sheetNames.length === 0) {
      return okResult(
        JSON.stringify(
        {
          path: resolved,
          extension,
          size: stat.size,
          sheetCount: 0,
          sheets: [],
        },
          null,
          2,
        ),
      );
    }

    const selectedSheetNames = selectSheets(sheetNames, requestedSheet);
    const previews = selectedSheetNames.map((sheetName) =>
      buildSheetPreview(workbook.Sheets[sheetName], sheetName, maxRows, maxColumns),
    );

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          extension,
          size: stat.size,
          sheetCount: sheetNames.length,
          availableSheets: sheetNames,
          previewedSheets: selectedSheetNames.length,
          truncatedSheetCount: Math.max(0, sheetNames.length - selectedSheetNames.length),
          sheets: previews,
        },
        null,
        2,
      ),
    );
  },
};

function selectSheets(sheetNames: string[], requestedSheet: string): string[] {
  if (!requestedSheet) {
    return sheetNames.slice(0, DEFAULT_PREVIEW_SHEETS);
  }

  const byName = sheetNames.find((sheetName) => sheetName === requestedSheet);
  if (byName) {
    return [byName];
  }

  const asIndex = Number.parseInt(requestedSheet, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= sheetNames.length) {
    const selectedSheet = sheetNames[asIndex - 1];
    if (selectedSheet) {
      return [selectedSheet];
    }
  }

  throw new ToolExecutionError(`Sheet not found: ${requestedSheet}`, {
    code: "SHEET_NOT_FOUND",
    details: {
      requestedSheet,
      availableSheets: sheetNames,
    },
  });
}

function buildSheetPreview(
  worksheet: XLSX.WorkSheet | undefined,
  sheetName: string,
  maxRows: number,
  maxColumns: number,
): Record<string, unknown> {
  if (!worksheet) {
    return {
      name: sheetName,
      rowCount: 0,
      columnCount: 0,
      preview: [],
    };
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  }) as unknown[][];

  const rowCount = rows.length;
  const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const preview = rows.slice(0, maxRows).map((row, index) => ({
    row: index + 1,
    cells: normalizeRow(row, maxColumns),
  }));

  return {
    name: sheetName,
    rowCount,
    columnCount,
    truncatedRows: Math.max(0, rowCount - preview.length),
    truncatedColumns: Math.max(0, columnCount - maxColumns),
    preview,
  };
}

function normalizeRow(row: unknown[], maxColumns: number): string[] {
  return row.slice(0, maxColumns).map((cell) => formatCell(cell));
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  }

  return String(value);
}
