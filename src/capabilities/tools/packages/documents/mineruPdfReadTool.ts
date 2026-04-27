import { getMineruSupportedExtensions } from "../../../../integrations/mineru/constants.js";
import { executePreparedMineruRead, prepareMineruReadRequest } from "./mineruExecution.js";
import type { RegisteredTool } from "../../core/types.js";

const SUPPORTED_EXTENSIONS = getMineruSupportedExtensions("pdf");

export const mineruPdfReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "mineru_pdf_read",
      description: "Read a PDF through MinerU and return a Markdown preview plus artifact paths.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Local PDF path.",
          },
          ocr: {
            type: "boolean",
            description: "Whether to force OCR-oriented parsing. Defaults to true.",
          },
          language: {
            type: "string",
            description: "Optional MinerU language override.",
          },
          model_version: {
            type: "string",
            description: "Optional MinerU model version override.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const request = await prepareMineruReadRequest(rawArgs, context, {
      toolName: "mineru_pdf_read",
      category: "pdf",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: "pdf",
    });
    return executePreparedMineruRead(request, context, {
      toolName: "mineru_pdf_read",
      category: "pdf",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: "pdf",
    });
  },
};
