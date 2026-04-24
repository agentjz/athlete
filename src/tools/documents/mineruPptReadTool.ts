import { getMineruSupportedExtensions } from "../../integrations/mineru/constants.js";
import { executePreparedMineruRead, prepareMineruReadRequest } from "./mineruExecution.js";
import type { RegisteredTool } from "../types.js";

const SUPPORTED_EXTENSIONS = getMineruSupportedExtensions("ppt");

export const mineruPptReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "mineru_ppt_read",
      description: "Read a .ppt or .pptx presentation through MinerU and return a Markdown preview plus artifact paths.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Local .ppt or .pptx path.",
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
      toolName: "mineru_ppt_read",
      category: "ppt",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: (extension) => extension.replace(/^\./, ""),
    });
    return executePreparedMineruRead(request, context, {
      toolName: "mineru_ppt_read",
      category: "ppt",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: (extension) => extension.replace(/^\./, ""),
    });
  },
};
