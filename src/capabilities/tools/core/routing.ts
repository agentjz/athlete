import path from "node:path";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "../../../integrations/mineru/constants.js";
import type { ToolGovernanceDocumentKind } from "./types.js";

export const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".tsv", ".ods"]);

export interface ToolRouteHint {
  code: string;
  action:
    | "skip_file_content"
    | "use_read_spreadsheet"
    | "use_document_read";
  detectedCapability:
    | "spreadsheet.read"
    | "document.read";
  documentKind?: ToolGovernanceDocumentKind;
  reason: string;
}

const EXTENSION_ROUTE_PATTERNS: Array<{
  extensions: readonly string[];
  route: ToolRouteHint;
}> = [
  {
    extensions: [...SPREADSHEET_EXTENSIONS],
    route: spreadsheetRoute(),
  },
  {
    extensions: [...MINERU_DOC_EXTENSIONS],
    route: documentRoute("doc"),
  },
  {
    extensions: [...MINERU_PDF_EXTENSIONS],
    route: documentRoute("pdf"),
  },
  {
    extensions: [...MINERU_IMAGE_EXTENSIONS],
    route: documentRoute("image"),
  },
  {
    extensions: [...MINERU_PPT_EXTENSIONS],
    route: documentRoute("ppt"),
  },
];

export function getToolRouteHintForPath(filePath: string): ToolRouteHint | null {
  const extension = path.extname(filePath).toLowerCase();
  const matched = EXTENSION_ROUTE_PATTERNS.find((item) => item.extensions.includes(extension));
  return matched ? matched.route : null;
}

export function getToolRouteHintForText(message: string): ToolRouteHint | null {
  const lower = message.toLowerCase();
  return EXTENSION_ROUTE_PATTERNS
    .find((item) => item.extensions.some((extension) => lower.includes(extension)))
    ?.route ?? null;
}

export function buildToolRoutingHint(route: ToolRouteHint): string {
  switch (route.detectedCapability) {
    case "spreadsheet.read":
      return "Detected spreadsheet input. Structured spreadsheet-read capability is available; raw text reading is not the structured path.";
    case "document.read":
      return buildDocumentRoutingHint(route.documentKind);
    default:
      return "A specialized capability is available for this file type.";
  }
}

function spreadsheetRoute(): ToolRouteHint {
  return {
    code: "route.spreadsheet.read_spreadsheet",
    action: "use_read_spreadsheet",
    detectedCapability: "spreadsheet.read",
    reason: "Spreadsheet format detected",
  };
}

function documentRoute(kind: ToolGovernanceDocumentKind): ToolRouteHint {
  switch (kind) {
    case "doc":
      return {
        code: "route.document.read.doc",
        action: "use_document_read",
        detectedCapability: "document.read",
        documentKind: "doc",
        reason: "Word document detected",
      };
    case "image":
      return {
        code: "route.document.read.image",
        action: "use_document_read",
        detectedCapability: "document.read",
        documentKind: "image",
        reason: "Image document detected",
      };
    case "pdf":
      return {
        code: "route.document.read.pdf",
        action: "use_document_read",
        detectedCapability: "document.read",
        documentKind: "pdf",
        reason: "PDF document detected",
      };
    case "ppt":
      return {
        code: "route.document.read.ppt",
        action: "use_document_read",
        detectedCapability: "document.read",
        documentKind: "ppt",
        reason: "Presentation document detected",
      };
    case "spreadsheet":
      return spreadsheetRoute();
    default:
      return {
        code: "route.document.read.doc",
        action: "use_document_read",
        detectedCapability: "document.read",
        documentKind: "doc",
        reason: "Document detected",
      };
  }
}

function buildDocumentRoutingHint(kind: ToolRouteHint["documentKind"]): string {
  switch (kind) {
    case "doc":
      return "Detected Word document input. Document-read capability is available; read_docx is the native .docx fallback when rich parsing is unavailable.";
    case "image":
      return "Detected image document input. Document-read capability can convert image content into structured Markdown output.";
    case "pdf":
      return "Detected PDF input. Document-read capability can convert PDF content into Markdown output; raw read_file is not suitable.";
    case "ppt":
      return "Detected presentation deck input. Document-read capability can extract slides into Markdown artifacts.";
    default:
      return "Document-read capability is available for this file type.";
  }
}
