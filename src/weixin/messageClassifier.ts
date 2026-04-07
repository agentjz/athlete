import type {
  WeixinClassifiedMessage,
  WeixinPrivateFileMessage,
  WeixinPrivateImageMessage,
  WeixinPrivateTextMessage,
  WeixinPrivateVideoMessage,
  WeixinPrivateVoiceMessage,
  WeixinRawMessage,
} from "./types.js";

const MESSAGE_TYPE_USER = 1;
const ITEM_TYPE_TEXT = 1;
const ITEM_TYPE_IMAGE = 2;
const ITEM_TYPE_VOICE = 3;
const ITEM_TYPE_FILE = 4;
const ITEM_TYPE_VIDEO = 5;

export function classifyWeixinMessage(
  message: WeixinRawMessage,
  options: {
    allowedUserIds: string[];
  },
): WeixinClassifiedMessage {
  const userId = String(message.from_user_id ?? "").trim();
  const groupId = String(message.group_id ?? "").trim();
  const contextToken = String(message.context_token ?? "").trim();
  const itemList = Array.isArray(message.item_list) ? message.item_list : [];

  if (groupId) {
    return {
      kind: "ignore",
      reason: "group_chat_unsupported",
      userId: userId || undefined,
      groupId,
      raw: message,
    };
  }

  if (!userId || !options.allowedUserIds.includes(userId)) {
    return {
      kind: "ignore",
      reason: "unauthorized_user",
      userId: userId || undefined,
      raw: message,
    };
  }

  if (message.message_type !== undefined && message.message_type !== MESSAGE_TYPE_USER) {
    return {
      kind: "ignore",
      reason: "unsupported_message",
      userId,
      raw: message,
    };
  }

  const base = {
    peerKey: `weixin:private:${userId}`,
    userId,
    messageId: toInteger(message.message_id),
    seq: toInteger(message.seq),
    contextToken,
    text: extractText(itemList),
    raw: message,
  };

  const imageItem = itemList.find((item) => item.type === ITEM_TYPE_IMAGE && item.image_item?.media);
  if (imageItem?.image_item?.media) {
    const classified: WeixinPrivateImageMessage = {
      ...base,
      kind: "private_image_message",
      mediaKind: "image",
      media: imageItem.image_item.media,
    };
    return classified;
  }

  const fileItem = itemList.find((item) => item.type === ITEM_TYPE_FILE && item.file_item?.media);
  if (fileItem?.file_item?.media) {
    const classified: WeixinPrivateFileMessage = {
      ...base,
      kind: "private_file_message",
      mediaKind: "file",
      media: fileItem.file_item.media,
      fileName: normalizeOptionalString(fileItem.file_item.file_name),
      fileSize: parseOptionalInteger(fileItem.file_item.len),
    };
    return classified;
  }

  const videoItem = itemList.find((item) => item.type === ITEM_TYPE_VIDEO && item.video_item?.media);
  if (videoItem?.video_item?.media) {
    const classified: WeixinPrivateVideoMessage = {
      ...base,
      kind: "private_video_message",
      mediaKind: "video",
      media: videoItem.video_item.media,
    };
    return classified;
  }

  const voiceItem = itemList.find((item) => item.type === ITEM_TYPE_VOICE && item.voice_item?.media);
  if (voiceItem?.voice_item?.media) {
    const classified: WeixinPrivateVoiceMessage = {
      ...base,
      kind: "private_voice_message",
      mediaKind: "voice",
      media: voiceItem.voice_item.media,
      voiceTranscript: normalizeOptionalString(voiceItem.voice_item.text),
      sampleRate: toPositiveInteger(voiceItem.voice_item.sample_rate),
      voice: voiceItem.voice_item,
    };
    return classified;
  }

  if (base.text) {
    const classified: WeixinPrivateTextMessage = {
      ...base,
      kind: "private_text_message",
    };
    return classified;
  }

  if (itemList.some((item) => item.type === ITEM_TYPE_TEXT || item.type === ITEM_TYPE_VOICE)) {
    return {
      kind: "ignore",
      reason: "empty_message",
      userId,
      raw: message,
    };
  }

  return {
    kind: "ignore",
    reason: itemList.length > 0 ? "unsupported_message" : "empty_message",
    userId,
    raw: message,
  };
}

function extractText(itemList: ReadonlyArray<{ type?: number; text_item?: { text?: string }; voice_item?: { text?: string } }>): string {
  for (const item of itemList) {
    if (item.type === ITEM_TYPE_TEXT) {
      const text = normalizeOptionalString(item.text_item?.text);
      if (text) {
        return text;
      }
    }
  }

  for (const item of itemList) {
    if (item.type === ITEM_TYPE_VOICE) {
      const transcript = normalizeOptionalString(item.voice_item?.text);
      if (transcript) {
        return transcript;
      }
    }
  }

  return "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return 0;
}

function toPositiveInteger(value: unknown): number | undefined {
  const parsed = parseOptionalInteger(value);
  return typeof parsed === "number" && parsed > 0 ? parsed : undefined;
}
