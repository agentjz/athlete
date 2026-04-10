import fs from "node:fs/promises";
import path from "node:path";

import { getToolRouteHintForPath } from "./routing.js";

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
  routeCode?: string;
  suggestedPath?: string;
  size: number;
  extension: string;
}

export async function inspectTextFile(filePath: string, maxBytes: number): Promise<InspectedFile> {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();

  const route = getToolRouteHintForPath(filePath);
  if (route) {
    return {
      readable: false,
      reason: `${route.reason}: ${extension}`,
      action: route.action,
      suggestedTool: route.suggestedTool,
      routeCode: route.code,
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
