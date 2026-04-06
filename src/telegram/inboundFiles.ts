import fs from "node:fs/promises";
import path from "node:path";

import type { RuntimeConfig } from "../types.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
import type { TelegramAttachmentRecord } from "./attachmentStore.js";
import type { TelegramLogger } from "./logger.js";
import type { TelegramPrivateFileMessage } from "./types.js";

const DEFAULT_MAX_DOWNLOAD_BYTES = 45 * 1024 * 1024;

export async function downloadTelegramAttachment(options: {
  bot: TelegramBotApiClient;
  cwd: string;
  config: RuntimeConfig["telegram"];
  message: TelegramPrivateFileMessage;
  sessionId: string;
  logger?: TelegramLogger;
}): Promise<TelegramAttachmentRecord> {
  const descriptor = await options.bot.getFile({
    fileId: options.message.fileId,
  });
  const announcedSize = options.message.fileSize ?? descriptor.fileSize ?? undefined;
  const maxDownloadBytes = readConfiguredDownloadLimit(options.config);
  if (typeof announcedSize === "number" && announcedSize > maxDownloadBytes) {
    throw new Error(
      `Telegram file too large to download: ${options.message.fileName ?? options.message.fileId} (${announcedSize} bytes > ${maxDownloadBytes} bytes).`,
    );
  }

  const download = await options.bot.downloadFile(descriptor);
  if (download.byteLength > maxDownloadBytes) {
    throw new Error(
      `Telegram file too large after download: ${options.message.fileName ?? options.message.fileId} (${download.byteLength} bytes > ${maxDownloadBytes} bytes).`,
    );
  }

  const filesDir = path.join(options.config.stateDir, "files", sanitizePathSegment(options.message.peerKey));
  await fs.mkdir(filesDir, { recursive: true });
  const safeFileName = sanitizeFileName(options.message.fileName ?? `${options.message.fileUniqueId}.bin`);
  const localFilePath = path.join(filesDir, `${String(options.message.updateId).padStart(8, "0")}-${safeFileName}`);
  await fs.writeFile(localFilePath, download);

  const timestamp = new Date().toISOString();
  const record: TelegramAttachmentRecord = {
    id: `${options.message.peerKey}:${options.message.messageId}:${options.message.fileUniqueId}`,
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    chatId: options.message.chatId,
    messageId: options.message.messageId,
    updateId: options.message.updateId,
    sessionId: options.sessionId,
    telegramFileId: options.message.fileId,
    telegramFileUniqueId: options.message.fileUniqueId,
    telegramFilePath: descriptor.filePath,
    localFilePath,
    fileName: options.message.fileName,
    mimeType: options.message.mimeType,
    fileSize: download.byteLength,
    caption: options.message.text || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  options.logger?.info("downloaded inbound file", {
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    chatId: options.message.chatId,
    sessionId: options.sessionId,
    inputKind: "file",
    fileName: options.message.fileName,
    detail: `path=${localFilePath}`,
  });
  return record;
}

export function buildTextTurnInput(
  input: string,
  recentAttachments: TelegramAttachmentRecord[],
  cwd: string,
): string {
  if (recentAttachments.length === 0) {
    return input;
  }

  return [
    input,
    "",
    "[Telegram context]",
    "Recent attachments from this chat are available locally. Use them only if they are relevant to the user's request.",
    ...formatAttachmentLines(recentAttachments, cwd),
  ].join("\n");
}

export function buildFileTurnInput(
  message: TelegramPrivateFileMessage,
  attachment: TelegramAttachmentRecord,
  recentAttachments: TelegramAttachmentRecord[],
  cwd: string,
): string {
  const instruction =
    message.text ||
    "The user sent a file in Telegram without extra instructions. Confirm receipt briefly, inspect the file if useful, and ask what they want done next.";

  return [
    instruction,
    "",
    "[Telegram attachment]",
    "The user uploaded a file in this chat. It has already been downloaded locally and is available to the normal file/document tools.",
    ...formatAttachmentLines([attachment], cwd),
    "",
    "[Recent Telegram attachments]",
    ...formatAttachmentLines(recentAttachments, cwd),
  ].join("\n");
}

function formatAttachmentLines(records: TelegramAttachmentRecord[], cwd: string): string[] {
  if (records.length === 0) {
    return ["- none"];
  }

  return records.map((record, index) => {
    const displayPath = toDisplayPath(record.localFilePath, cwd);
    const size = typeof record.fileSize === "number" ? ` (${record.fileSize} bytes)` : "";
    const caption = record.caption ? `; caption=${record.caption}` : "";
    return `${index + 1}. ${record.fileName ?? path.basename(record.localFilePath)} -> ${displayPath}${size}${caption}`;
  });
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return normalized || "telegram-upload.bin";
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function toDisplayPath(targetPath: string, cwd: string): string {
  const relative = path.relative(cwd, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : targetPath;
}

function readConfiguredDownloadLimit(config: unknown): number {
  const value = (config as { maxDownloadBytes?: number } | undefined)?.maxDownloadBytes;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  return DEFAULT_MAX_DOWNLOAD_BYTES;
}
