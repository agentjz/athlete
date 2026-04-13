import path from "node:path";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "../integrations/mineru/constants.js";
import type { ToolGovernanceDocumentKind } from "./types.js";

export const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".tsv", ".ods"]);

export interface ToolRouteHint {
  code: string;
  action:
    | "skip_file_content"
    | "use_read_spreadsheet"
    | "use_document_read";
  suggestedCapability:
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
  switch (route.suggestedCapability) {
    case "spreadsheet.read":
      return "The target looks like a spreadsheet. Use read_spreadsheet instead of read_file, then continue from the structured preview.";
    case "document.read":
      return buildDocumentRoutingHint(route.documentKind);
    default:
      return "Use the dedicated specialized tool for this file type.";
  }
}

function spreadsheetRoute(): ToolRouteHint {
  return {
    code: "route.spreadsheet.read_spreadsheet",
    action: "use_read_spreadsheet",
    suggestedCapability: "spreadsheet.read",
    reason: "Spreadsheet format detected",
  };
}

function documentRoute(kind: ToolGovernanceDocumentKind): ToolRouteHint {
  switch (kind) {
    case "doc":
      return {
        code: "route.document.read.doc",
        action: "use_document_read",
        suggestedCapability: "document.read",
        documentKind: "doc",
        reason: "Word document detected",
      };
    case "image":
      return {
        code: "route.document.read.image",
        action: "use_document_read",
        suggestedCapability: "document.read",
        documentKind: "image",
        reason: "Image document detected",
      };
    case "pdf":
      return {
        code: "route.document.read.pdf",
        action: "use_document_read",
        suggestedCapability: "document.read",
        documentKind: "pdf",
        reason: "PDF document detected",
      };
    case "ppt":
      return {
        code: "route.document.read.ppt",
        action: "use_document_read",
        suggestedCapability: "document.read",
        documentKind: "ppt",
        reason: "Presentation document detected",
      };
    case "spreadsheet":
      return spreadsheetRoute();
    default:
      return {
        code: "route.document.read.doc",
        action: "use_document_read",
        suggestedCapability: "document.read",
        documentKind: "doc",
        reason: "Document detected",
      };
  }
}

function buildDocumentRoutingHint(kind: ToolRouteHint["documentKind"]): string {
  switch (kind) {
    case "doc":
      return "The target is a Word document. Use a document-read capability first. If rich parsing is unavailable, fall back to read_docx.";
    case "image":
      return "The target is an image document. Use a document-read capability so the image can be converted into structured Markdown output.";
    case "pdf":
      return "The target is a PDF document. Use a document-read capability so the PDF can be converted into Markdown output instead of forcing read_file.";
    case "ppt":
      return "The target is a presentation deck. Use a document-read capability so the slides can be extracted into Markdown artifacts.";
    default:
      return "Use a document-read capability for this file type before falling back to raw file reads.";
  }
}
