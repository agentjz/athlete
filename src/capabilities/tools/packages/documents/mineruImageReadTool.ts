import { getMineruSupportedExtensions } from "../../../../integrations/mineru/constants.js";
import { executePreparedMineruRead, prepareMineruReadRequest } from "./mineruExecution.js";
import type { RegisteredTool } from "../../core/types.js";

const SUPPORTED_EXTENSIONS = getMineruSupportedExtensions("image");

export const mineruImageReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "mineru_image_read",
      description: "Read an image document through MinerU and return a Markdown preview plus artifact paths.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Local image path.",
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
      toolName: "mineru_image_read",
      category: "image",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: "image",
    });
    return executePreparedMineruRead(request, context, {
      toolName: "mineru_image_read",
      category: "image",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: "image",
    });
  },
};
