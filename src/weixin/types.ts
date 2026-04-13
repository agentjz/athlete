import type { CDNMedia, VoiceItem, WeixinMessage } from "@openilink/openilink-sdk-node";

export type WeixinRawMessage = WeixinMessage;

export interface WeixinPollingBatch {
  messages: WeixinRawMessage[];
  syncBuf: string | null;
  longPollingTimeoutMs?: number;
}

export interface WeixinPollingSourceLike {
  poll(signal?: AbortSignal): Promise<WeixinPollingBatch>;
  commit(syncBuf: string | null): Promise<void>;
}

export interface WeixinPrivateMessageBase {
  peerKey: string;
  userId: string;
  messageId: number;
  seq: number;
  contextToken: string;
  text: string;
  raw: WeixinRawMessage;
}

export interface WeixinOutboundTextEchoMessage {
  kind: "outbound_text_echo";
  peerKey: string;
  userId: string;
  messageId: number;
  seq: number;
  clientId: string;
  text: string;
  raw: WeixinRawMessage;
}

export interface WeixinPrivateTextMessage extends WeixinPrivateMessageBase {
  kind: "private_text_message";
}

export interface WeixinPrivateImageMessage extends WeixinPrivateMessageBase {
  kind: "private_image_message";
  mediaKind: "image";
  media: CDNMedia;
}

export interface WeixinPrivateFileMessage extends WeixinPrivateMessageBase {
  kind: "private_file_message";
  mediaKind: "file";
  media: CDNMedia;
  fileName?: string;
  fileSize?: number;
}

export interface WeixinPrivateVideoMessage extends WeixinPrivateMessageBase {
  kind: "private_video_message";
  mediaKind: "video";
  media: CDNMedia;
}

export interface WeixinPrivateVoiceMessage extends WeixinPrivateMessageBase {
  kind: "private_voice_message";
  mediaKind: "voice";
  media: CDNMedia;
  voiceTranscript?: string;
  sampleRate?: number;
  voice?: VoiceItem;
}

export interface WeixinIgnoredMessage {
  kind: "ignore";
  reason:
    | "unsupported_message"
    | "empty_message"
    | "unauthorized_user"
    | "group_chat_unsupported";
  userId?: string;
  groupId?: string;
  raw: WeixinRawMessage;
}

export type WeixinPrivateMessage =
  | WeixinPrivateTextMessage
  | WeixinPrivateImageMessage
  | WeixinPrivateFileMessage
  | WeixinPrivateVideoMessage
  | WeixinPrivateVoiceMessage;

export type WeixinClassifiedMessage =
  | WeixinPrivateMessage
  | WeixinOutboundTextEchoMessage
  | WeixinIgnoredMessage;
