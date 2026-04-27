import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramDeliveryQueue } from "./deliveryQueue.js";
import type { TelegramLogger } from "./logger.js";
import { resolveUserPath } from "../utils/fs.js";
import { okResult, parseArgs, readString } from "../capabilities/tools/core/shared.js";
import type { RegisteredTool } from "../capabilities/tools/core/types.js";

const DEFAULT_MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
const MAX_CAPTION_CHARS = 900;

export function createTelegramSendFileTool(options: {
  chatId: number;
  deliveryQueue: TelegramDeliveryQueue;
  logger?: TelegramLogger;
}): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "telegram_send_file",
        description:
          "Send a local workspace file back to the active Telegram private chat as a real Telegram document.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the local file that should be sent to Telegram.",
            },
            file_name: {
              type: "string",
              description: "Optional Telegram filename override.",
            },
            caption: {
              type: "string",
              description: "Optional short caption shown under the Telegram document.",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    governance: {
      source: "host",
      specialty: "messaging",
      mutation: "state",
      risk: "medium",
      destructive: false,
      concurrencySafe: false,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
    async execute(rawArgs, context) {
      const args = parseArgs(rawArgs);
      const targetPath = readString(args.path, "path");
      const resolved = resolveUserPath(targetPath, context.cwd);
      const stats = await fs.stat(resolved);

      if (!stats.isFile()) {
        throw new Error(`Only regular files can be sent to Telegram: ${resolved}`);
      }

      const maxUploadBytes = readConfiguredUploadLimit(context.config.telegram);
      if (stats.size > maxUploadBytes) {
        throw new Error(
          `File too large for Telegram delivery: ${resolved} (${stats.size} bytes > ${maxUploadBytes} bytes).`,
        );
      }

      const fileName =
        typeof args.file_name === "string" && args.file_name.trim()
          ? args.file_name.trim()
          : path.basename(resolved);
      const caption = normalizeCaption(typeof args.caption === "string" ? args.caption : undefined);

      await options.deliveryQueue.enqueueFile({
        chatId: options.chatId,
        filePath: resolved,
        fileName,
        caption,
      });
      await options.deliveryQueue.flushDue();
      options.logger?.info("queued file delivery", {
        chatId: options.chatId,
        fileName,
        detail: `path=${resolved}`,
      });

      return okResult(
        JSON.stringify(
          {
            ok: true,
            chatId: options.chatId,
            fileName,
            path: resolved,
            size: stats.size,
            sentAs: "telegram_document",
          },
          null,
          2,
        ),
      );
    },
  };
}

function readConfiguredUploadLimit(config: unknown): number {
  const value = (config as { maxUploadBytes?: number } | undefined)?.maxUploadBytes;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  return DEFAULT_MAX_UPLOAD_BYTES;
}

function normalizeCaption(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= MAX_CAPTION_CHARS ? normalized : normalized.slice(0, MAX_CAPTION_CHARS);
}
