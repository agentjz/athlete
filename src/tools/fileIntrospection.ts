import fs from "node:fs/promises";
import path from "node:path";

export const SPREADSHEET_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".ods",
]);

export const DOCX_EXTENSIONS = new Set([
  ".docx",
]);

const LEGACY_WORD_EXTENSIONS = new Set([
  ".doc",
  ".docm",
]);

const KNOWN_BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".ppt",
  ".pptx",
  ".epub",
  ".mobi",
  ".zip",
  ".7z",
  ".rar",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".exe",
  ".dll",
  ".bin",
]);

export interface InspectedFile {
  readable: boolean;
  content?: string;
  reason?: string;
  action?:
    | "skip_file_content"
    | "use_read_spreadsheet"
    | "use_read_docx"
    | "use_read_pdf"
    | "convert_to_docx_first";
  suggestedTool?: "read_spreadsheet" | "read_docx" | "read_pdf";
  suggestedPath?: string;
  size: number;
  extension: string;
}

export async function inspectTextFile(filePath: string, maxBytes: number): Promise<InspectedFile> {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return {
      readable: false,
      reason: `Spreadsheet format detected: ${extension}`,
      action: "use_read_spreadsheet",
      suggestedTool: "read_spreadsheet",
      size: stat.size,
      extension,
    };
  }

  if (DOCX_EXTENSIONS.has(extension)) {
    return {
      readable: false,
      reason: `Word .docx document detected: ${extension}`,
      action: "use_read_docx",
      suggestedTool: "read_docx",
      size: stat.size,
      extension,
    };
  }

  if (LEGACY_WORD_EXTENSIONS.has(extension)) {
    return {
      readable: false,
      reason: `Legacy Word format detected: ${extension}`,
      action: "convert_to_docx_first",
      suggestedPath: replaceExtension(filePath, ".docx"),
      size: stat.size,
      extension,
    };
  }

  if (extension === ".pdf") {
    return {
      readable: false,
      reason: `PDF document detected: ${extension}`,
      action: "use_read_pdf",
      suggestedTool: "read_pdf",
      size: stat.size,
      extension,
    };
  }

  if (KNOWN_BINARY_EXTENSIONS.has(extension)) {
    return {
      readable: false,
      reason: `Unsupported binary/document format: ${extension || "unknown"}`,
      action: "skip_file_content",
      size: stat.size,
      extension,
    };
  }

  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) {
    return {
      readable: false,
      reason: "Binary file detected",
      action: "skip_file_content",
      size: stat.size,
      extension,
    };
  }

  const slice = buffer.subarray(0, Math.min(buffer.length, maxBytes));
  return {
    readable: true,
    content: slice.toString("utf8"),
    size: stat.size,
    extension,
  };
}

function replaceExtension(filePath: string, nextExtension: string): string {
  const extension = path.extname(filePath);
  return extension ? filePath.slice(0, -extension.length) + nextExtension : `${filePath}${nextExtension}`;
}
