import fs from "node:fs/promises";
import path from "node:path";

import type { WeixinAttachmentRecord } from "./attachmentStore.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinRuntimeConfig } from "./config.js";
import type { WeixinLogger } from "./logger.js";
import type {
  WeixinPrivateFileMessage,
  WeixinPrivateImageMessage,
  WeixinPrivateMessage,
  WeixinPrivateVideoMessage,
  WeixinPrivateVoiceMessage,
} from "./types.js";

const DEFAULT_MAX_DOWNLOAD_BYTES = 45 * 1024 * 1024;

export async function downloadWeixinAttachment(options: {
  client: WeixinClientLike;
  cwd: string;
  config: Pick<WeixinRuntimeConfig, "stateDir">;
  message: WeixinPrivateImageMessage | WeixinPrivateFileMessage | WeixinPrivateVideoMessage | WeixinPrivateVoiceMessage;
  sessionId: string;
  logger?: WeixinLogger;
}): Promise<WeixinAttachmentRecord> {
  const bytes = options.message.kind === "private_voice_message"
    ? await options.client.downloadVoice({
        media: options.message.media,
        sample_rate: options.message.sampleRate,
      })
    : await options.client.downloadMedia(options.message.media);
  const maxDownloadBytes = readConfiguredDownloadLimit(options.config);
  if (bytes.byteLength > maxDownloadBytes) {
    throw new Error(
      `Weixin attachment too large to download: ${options.message.mediaKind} (${bytes.byteLength} bytes > ${maxDownloadBytes} bytes).`,
    );
  }

  const filesDir = path.join(options.config.stateDir, "files", sanitizePathSegment(options.message.peerKey));
  await fs.mkdir(filesDir, { recursive: true });
  const localFilePath = path.join(filesDir, buildAttachmentFileName(options.message));
  await fs.writeFile(localFilePath, bytes);

  const timestamp = new Date().toISOString();
  const record: WeixinAttachmentRecord = {
    id: `${options.message.peerKey}:${options.message.messageId}:${options.message.mediaKind}`,
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    messageId: options.message.messageId,
    seq: options.message.seq,
    sessionId: options.sessionId,
    mediaKind: options.message.mediaKind,
    localFilePath,
    fileName: readAttachmentFileName(options.message),
    fileSize: bytes.byteLength,
    text: options.message.text || undefined,
    contextToken: options.message.contextToken,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (options.message.kind === "private_voice_message" && options.message.voiceTranscript) {
    record.text = options.message.voiceTranscript;
  }

  options.logger?.info("downloaded inbound attachment", {
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    inputKind: options.message.mediaKind,
    fileName: record.fileName,
    detail: `path=${localFilePath}`,
  });
  return record;
}

export function buildWeixinTextTurnInput(
  input: string,
  recentAttachments: WeixinAttachmentRecord[],
  cwd: string,
): string {
  if (recentAttachments.length === 0) {
    return input;
  }

  return [
    input,
    "",
    "[Weixin context]",
    "Recent attachments from this Weixin chat are available locally. Use them only if they are relevant to the current request.",
    ...formatAttachmentLines(recentAttachments, cwd),
  ].join("\n");
}

export function buildWeixinMediaTurnInput(
  message: WeixinPrivateMessage,
  attachment: WeixinAttachmentRecord,
  recentAttachments: WeixinAttachmentRecord[],
  cwd: string,
): string {
  const instruction =
    message.text ||
    "The user sent media in Weixin without extra instructions. Confirm receipt briefly, inspect it if useful, and ask what they want done next.";

  return [
    instruction,
    "",
    "[Weixin attachment]",
    "The user uploaded media in this Weixin private chat. It has already been downloaded locally and is available to the normal file/document tools.",
    ...formatAttachmentLines([attachment], cwd),
    "",
    "[Recent Weixin attachments]",
    ...formatAttachmentLines(recentAttachments, cwd),
  ].join("\n");
}

function formatAttachmentLines(records: WeixinAttachmentRecord[], cwd: string): string[] {
  if (records.length === 0) {
    return ["- none"];
  }

  return records.map((record, index) => {
    const displayPath = toDisplayPath(record.localFilePath, cwd);
    const size = typeof record.fileSize === "number" ? ` (${record.fileSize} bytes)` : "";
    const extra = record.text ? `; note=${record.text}` : "";
    return `${index + 1}. ${record.fileName ?? path.basename(record.localFilePath)} -> ${displayPath}${size}${extra}`;
  });
}

function buildAttachmentFileName(
  message: WeixinPrivateImageMessage | WeixinPrivateFileMessage | WeixinPrivateVideoMessage | WeixinPrivateVoiceMessage,
): string {
  const prefix = `${String(message.seq || message.messageId).padStart(8, "0")}-${message.mediaKind}`;
  if (message.kind === "private_file_message" && message.fileName) {
    return `${prefix}-${sanitizeFileName(message.fileName)}`;
  }
  if (message.kind === "private_voice_message") {
    return `${prefix}.wav`;
  }
  if (message.kind === "private_video_message") {
    return `${prefix}.mp4`;
  }
  return `${prefix}.bin`;
}

function readAttachmentFileName(
  message: WeixinPrivateImageMessage | WeixinPrivateFileMessage | WeixinPrivateVideoMessage | WeixinPrivateVoiceMessage,
): string | undefined {
  if (message.kind === "private_file_message" && message.fileName) {
    return sanitizeFileName(message.fileName);
  }
  if (message.kind === "private_voice_message") {
    return `voice-${message.messageId}.wav`;
  }
  if (message.kind === "private_video_message") {
    return `video-${message.messageId}.mp4`;
  }
  if (message.kind === "private_image_message") {
    return `image-${message.messageId}.bin`;
  }
  return undefined;
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return normalized || "weixin-upload.bin";
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
