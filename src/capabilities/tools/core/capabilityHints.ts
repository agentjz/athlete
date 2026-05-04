import path from "node:path";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "../../../integrations/mineru/constants.js";
import type { ToolGovernanceDocumentKind } from "./types.js";

export const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".tsv", ".ods"]);

export interface ToolCapabilityHint {
  code: string;
  presentation:
    | "metadata_only"
    | "spreadsheet_reader_available"
    | "document_reader_available";
  detectedCapability:
    | "spreadsheet.read"
    | "document.read";
  documentKind?: ToolGovernanceDocumentKind;
  reason: string;
}

const EXTENSION_CAPABILITY_HINT_PATTERNS: Array<{
  extensions: readonly string[];
  hint: ToolCapabilityHint;
}> = [
  {
    extensions: [...SPREADSHEET_EXTENSIONS],
    hint: spreadsheetHint(),
  },
  {
    extensions: [...MINERU_DOC_EXTENSIONS],
    hint: documentHint("doc"),
  },
  {
    extensions: [...MINERU_PDF_EXTENSIONS],
    hint: documentHint("pdf"),
  },
  {
    extensions: [...MINERU_IMAGE_EXTENSIONS],
    hint: documentHint("image"),
  },
  {
    extensions: [...MINERU_PPT_EXTENSIONS],
    hint: documentHint("ppt"),
  },
];

export function getToolCapabilityHintForPath(filePath: string): ToolCapabilityHint | null {
  const extension = path.extname(filePath).toLowerCase();
  const matched = EXTENSION_CAPABILITY_HINT_PATTERNS.find((item) => item.extensions.includes(extension));
  return matched ? matched.hint : null;
}

export function getToolCapabilityHintForText(message: string): ToolCapabilityHint | null {
  const lower = message.toLowerCase();
  return EXTENSION_CAPABILITY_HINT_PATTERNS
    .find((item) => item.extensions.some((extension) => lower.includes(extension)))
    ?.hint ?? null;
}

export function buildToolCapabilityHint(hint: ToolCapabilityHint): string {
  switch (hint.detectedCapability) {
    case "spreadsheet.read":
      return "Detected spreadsheet input. Structured spreadsheet-read capability is available; raw text reading is not the structured path.";
    case "document.read":
      return buildDocumentCapabilityHint(hint.documentKind);
    default:
      return "A specialized capability is available for this file type.";
  }
}

function spreadsheetHint(): ToolCapabilityHint {
    return {
      code: "hint.spreadsheet.read_spreadsheet",
      presentation: "spreadsheet_reader_available",
      detectedCapability: "spreadsheet.read",
      reason: "Spreadsheet format detected",
  };
}

function documentHint(kind: ToolGovernanceDocumentKind): ToolCapabilityHint {
  switch (kind) {
    case "doc":
      return {
        code: "hint.document.read.doc",
        presentation: "document_reader_available",
        detectedCapability: "document.read",
        documentKind: "doc",
        reason: "Word document detected",
      };
    case "image":
      return {
        code: "hint.document.read.image",
        presentation: "document_reader_available",
        detectedCapability: "document.read",
        documentKind: "image",
        reason: "Image document detected",
      };
    case "pdf":
      return {
        code: "hint.document.read.pdf",
        presentation: "document_reader_available",
        detectedCapability: "document.read",
        documentKind: "pdf",
        reason: "PDF document detected",
      };
    case "ppt":
      return {
        code: "hint.document.read.ppt",
        presentation: "document_reader_available",
        detectedCapability: "document.read",
        documentKind: "ppt",
        reason: "Presentation document detected",
      };
    case "spreadsheet":
      return spreadsheetHint();
    default:
      return {
        code: "hint.document.read.doc",
        presentation: "document_reader_available",
        detectedCapability: "document.read",
        documentKind: "doc",
        reason: "Document detected",
      };
  }
}

function buildDocumentCapabilityHint(kind: ToolCapabilityHint["documentKind"]): string {
  switch (kind) {
    case "doc":
      return "Detected Word document input. Document-read capability is available; read_docx is the native .docx fallback when rich parsing is unavailable.";
    case "image":
      return "Detected image document input. Document-read capability can convert image content into structured Markdown output.";
    case "pdf":
      return "Detected PDF input. Document-read capability can convert PDF content into Markdown output; raw read is not suitable.";
    case "ppt":
      return "Detected presentation deck input. Document-read capability can extract slides into Markdown artifacts.";
    default:
      return "Document-read capability is available for this file type.";
  }
}
