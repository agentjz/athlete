import fs from "node:fs/promises";
import path from "node:path";

import { getToolCapabilityHintForPath } from "./capabilityHints.js";
import { decodeTextFileEnvelope } from "../../../utils/text.js";
import type { TextFileEnvelope } from "../../../utils/text.js";
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
  presentation?:
    | "metadata_only"
    | "spreadsheet_reader_available"
    | "document_reader_available";
  detectedCapability?:
    | "spreadsheet.read"
    | "document.read";
  documentKind?: ToolGovernanceDocumentKind;
  capabilityHintCode?: string;
  size: number;
  extension: string;
  textEnvelope?: Pick<TextFileEnvelope, "encoding" | "lineEnding">;
}

export async function inspectTextFile(filePath: string, _maxBytes: number): Promise<InspectedFile> {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();

  const hint = getToolCapabilityHintForPath(filePath);
  if (hint) {
    return {
      readable: false,
      reason: `${hint.reason}: ${extension}`,
      presentation: hint.presentation,
      detectedCapability: hint.detectedCapability,
      documentKind: hint.documentKind,
      capabilityHintCode: hint.code,
      size: stat.size,
      extension,
    };
  }

  if (KNOWN_BINARY_EXTENSIONS.has(extension)) {
    return {
      readable: false,
      reason: `Unsupported binary/document format: ${extension || "unknown"}`,
      presentation: "metadata_only",
      size: stat.size,
      extension,
    };
  }

  const buffer = await fs.readFile(filePath);
  const decoded = decodeTextFileEnvelope(buffer);
  if (!decoded) {
    return {
      readable: false,
      reason: "Binary file detected",
      presentation: "metadata_only",
      size: stat.size,
      extension,
    };
  }

  return {
    readable: true,
    content: decoded.text,
    textEnvelope: {
      encoding: decoded.encoding,
      lineEnding: decoded.lineEnding,
    },
    size: stat.size,
    extension,
  };
}
