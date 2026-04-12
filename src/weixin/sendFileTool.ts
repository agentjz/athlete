import fs from "node:fs/promises";
import path from "node:path";

import type { WeixinDeliveryQueue } from "./deliveryQueue.js";
import type { WeixinLogger } from "./logger.js";
import { assertPathAllowed } from "../utils/fs.js";
import { okResult, parseArgs, readString } from "../tools/shared.js";
import type { RegisteredTool } from "../tools/types.js";

const DEFAULT_MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
const MAX_CAPTION_CHARS = 900;

export function createWeixinSendFileTool(options: {
  peerKey: string;
  userId: string;
  deliveryQueue: WeixinDeliveryQueue;
  logger?: WeixinLogger;
}): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "weixin_send_file",
        description:
          "Send a local workspace image, video, or file back to the active Weixin private chat. The channel auto-routes supported media kinds and rejects unsupported voice output.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the local file that should be sent to Weixin.",
            },
            file_name: {
              type: "string",
              description: "Optional Weixin filename override for file deliveries.",
            },
            caption: {
              type: "string",
              description: "Optional short caption sent with the media.",
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
      const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
      const stats = await fs.stat(resolved);

      if (!stats.isFile()) {
        throw new Error(`Only regular files can be sent to Weixin: ${resolved}`);
      }

      const maxUploadBytes = readConfiguredUploadLimit(context.config.weixin);
      if (stats.size > maxUploadBytes) {
        throw new Error(`File too large for Weixin delivery: ${resolved} (${stats.size} bytes > ${maxUploadBytes} bytes).`);
      }

      const fileName =
        typeof args.file_name === "string" && args.file_name.trim()
          ? args.file_name.trim()
          : path.basename(resolved);
      const caption = normalizeCaption(typeof args.caption === "string" ? args.caption : undefined);
      const mime = mimeFromFilename(fileName) || mimeFromFilename(path.basename(resolved));

      if (mime && mime.startsWith("audio/")) {
        throw new Error("Weixin outbound voice/audio is not supported by Athlete because the upstream SDK does not expose a stable voice-send API.");
      }

      if (mime && isImageMime(mime)) {
        await options.deliveryQueue.enqueueImage({
          peerKey: options.peerKey,
          userId: options.userId,
          filePath: resolved,
          caption,
        });
        await options.deliveryQueue.flushDue();
        options.logger?.info("queued media delivery", {
          peerKey: options.peerKey,
          userId: options.userId,
          fileName,
          detail: `kind=image path=${resolved}`,
        });

        return okResult(
          JSON.stringify(
            {
              ok: true,
              userId: options.userId,
              path: resolved,
              fileName,
              size: stats.size,
              sentAs: "weixin_image",
            },
            null,
            2,
          ),
        );
      }

      if (mime && isVideoMime(mime)) {
        await options.deliveryQueue.enqueueVideo({
          peerKey: options.peerKey,
          userId: options.userId,
          filePath: resolved,
          caption,
        });
        await options.deliveryQueue.flushDue();
        options.logger?.info("queued media delivery", {
          peerKey: options.peerKey,
          userId: options.userId,
          fileName,
          detail: `kind=video path=${resolved}`,
        });

        return okResult(
          JSON.stringify(
            {
              ok: true,
              userId: options.userId,
              path: resolved,
              fileName,
              size: stats.size,
              sentAs: "weixin_video",
            },
            null,
            2,
          ),
        );
      }

      await options.deliveryQueue.enqueueFile({
        peerKey: options.peerKey,
        userId: options.userId,
        filePath: resolved,
        fileName,
        caption,
      });
      await options.deliveryQueue.flushDue();
      options.logger?.info("queued media delivery", {
        peerKey: options.peerKey,
        userId: options.userId,
        fileName,
        detail: `kind=file path=${resolved}`,
      });

      return okResult(
        JSON.stringify(
          {
            ok: true,
            userId: options.userId,
            path: resolved,
            fileName,
            size: stats.size,
            sentAs: "weixin_file",
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

function mimeFromFilename(fileName: string): string {
  const extension = path.extname(fileName).trim().toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".aac":
      return "audio/aac";
    case ".m4a":
      return "audio/mp4";
    case ".pdf":
      return "application/pdf";
    default:
      return "";
  }
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}
