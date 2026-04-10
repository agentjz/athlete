import path from "node:path";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "../integrations/mineru/constants.js";

export const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".tsv", ".ods"]);

export interface ToolRouteHint {
  code: string;
  action:
    | "skip_file_content"
    | "use_read_spreadsheet"
    | "use_mineru_doc_read"
    | "use_mineru_image_read"
    | "use_mineru_pdf_read"
    | "use_mineru_ppt_read";
  suggestedTool:
    | "read_spreadsheet"
    | "mineru_doc_read"
    | "mineru_image_read"
    | "mineru_pdf_read"
    | "mineru_ppt_read";
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
  switch (route.suggestedTool) {
    case "read_spreadsheet":
      return "The target looks like a spreadsheet. Use read_spreadsheet instead of read_file, then continue from the structured preview.";
    case "mineru_doc_read":
      return "The target is a Word document. Use mineru_doc_read first. If MinerU cannot process it, fall back to read_docx.";
    case "mineru_image_read":
      return "The target is an image document. Use mineru_image_read so MinerU can extract structured Markdown output.";
    case "mineru_pdf_read":
      return "The target is a PDF document. Use mineru_pdf_read so MinerU can extract Markdown output instead of forcing read_file.";
    case "mineru_ppt_read":
      return "The target is a presentation deck. Use mineru_ppt_read so MinerU can extract the slides into Markdown artifacts.";
    default:
      return "Use the dedicated specialized tool for this file type.";
  }
}

function spreadsheetRoute(): ToolRouteHint {
  return {
    code: "route.spreadsheet.read_spreadsheet",
    action: "use_read_spreadsheet",
    suggestedTool: "read_spreadsheet",
    reason: "Spreadsheet format detected",
  };
}

function documentRoute(kind: "doc" | "image" | "pdf" | "ppt"): ToolRouteHint {
  switch (kind) {
    case "doc":
      return {
        code: "route.document.mineru_doc_read",
        action: "use_mineru_doc_read",
        suggestedTool: "mineru_doc_read",
        reason: "MinerU Word document detected",
      };
    case "image":
      return {
        code: "route.document.mineru_image_read",
        action: "use_mineru_image_read",
        suggestedTool: "mineru_image_read",
        reason: "MinerU image document detected",
      };
    case "pdf":
      return {
        code: "route.document.mineru_pdf_read",
        action: "use_mineru_pdf_read",
        suggestedTool: "mineru_pdf_read",
        reason: "MinerU PDF document detected",
      };
    case "ppt":
      return {
        code: "route.document.mineru_ppt_read",
        action: "use_mineru_ppt_read",
        suggestedTool: "mineru_ppt_read",
        reason: "MinerU presentation detected",
      };
    default:
      return {
        code: "route.document.mineru_doc_read",
        action: "use_mineru_doc_read",
        suggestedTool: "mineru_doc_read",
        reason: "MinerU document detected",
      };
  }
}
