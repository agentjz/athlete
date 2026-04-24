export type TelegramChatType = "private" | "group" | "supergroup" | "channel";

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: TelegramChatType;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramPrivateMessage {
  kind: "private_message";
  updateId: number;
  peerKey: string;
  userId: number;
  chatId: number;
  messageId: number;
  text: string;
  raw: TelegramUpdate;
}

export interface TelegramPrivateFileMessage {
  kind: "private_file_message";
  updateId: number;
  peerKey: string;
  userId: number;
  chatId: number;
  messageId: number;
  text: string;
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  raw: TelegramUpdate;
}

export interface TelegramIgnoredUpdate {
  kind: "ignore";
  updateId: number;
  reason: "unsupported_update" | "non_private_chat" | "unauthorized_user" | "empty_message";
  chatId?: number;
  userId?: number;
  chatType?: TelegramChatType;
  raw: TelegramUpdate;
}

export type TelegramClassifiedUpdate =
  | TelegramPrivateMessage
  | TelegramPrivateFileMessage
  | TelegramIgnoredUpdate;
