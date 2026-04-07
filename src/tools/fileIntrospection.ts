import fs from "node:fs/promises";
import path from "node:path";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "../integrations/mineru/constants.js";

export const SPREADSHEET_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".ods",
]);

const KNOWN_BINARY_EXTENSIONS = new Set([
  ".epub",
  ".mobi",
  ".zip",
  ".7z",
  ".rar",
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
    | "use_mineru_doc_read"
    | "use_mineru_image_read"
    | "use_mineru_pdf_read"
    | "use_mineru_ppt_read";
  suggestedTool?:
    | "read_spreadsheet"
    | "mineru_doc_read"
    | "mineru_image_read"
    | "mineru_pdf_read"
    | "mineru_ppt_read";
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

  if (MINERU_DOC_EXTENSIONS.includes(extension as never)) {
    return {
      readable: false,
      reason: `MinerU Word document detected: ${extension}`,
      action: "use_mineru_doc_read",
      suggestedTool: "mineru_doc_read",
      size: stat.size,
      extension,
    };
  }

  if (MINERU_PDF_EXTENSIONS.includes(extension as never)) {
    return {
      readable: false,
      reason: `MinerU PDF document detected: ${extension}`,
      action: "use_mineru_pdf_read",
      suggestedTool: "mineru_pdf_read",
      size: stat.size,
      extension,
    };
  }

  if (MINERU_IMAGE_EXTENSIONS.includes(extension as never)) {
    return {
      readable: false,
      reason: `MinerU image document detected: ${extension}`,
      action: "use_mineru_image_read",
      suggestedTool: "mineru_image_read",
      size: stat.size,
      extension,
    };
  }

  if (MINERU_PPT_EXTENSIONS.includes(extension as never)) {
    return {
      readable: false,
      reason: `MinerU presentation detected: ${extension}`,
      action: "use_mineru_ppt_read",
      suggestedTool: "mineru_ppt_read",
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
