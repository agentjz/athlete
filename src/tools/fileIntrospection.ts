import fs from "node:fs/promises";
import path from "node:path";

import { getToolRouteHintForPath } from "./routing.js";
import { decodeTextBuffer } from "../utils/text.js";
import type { ToolGovernanceDocumentKind } from "./types.js";

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
    | "use_document_read";
  suggestedCapability?:
    | "spreadsheet.read"
    | "document.read";
  documentKind?: ToolGovernanceDocumentKind;
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
      suggestedCapability: route.suggestedCapability,
      documentKind: route.documentKind,
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
  const decoded = decodeTextBuffer(buffer);
  if (!decoded) {
    return {
      readable: false,
      reason: "Binary file detected",
      action: "skip_file_content",
      size: stat.size,
      extension,
    };
  }

  const slice = decoded.text.slice(0, Math.min(decoded.text.length, maxBytes));
  return {
    readable: true,
    content: slice,
    size: stat.size,
    extension,
  };
}
