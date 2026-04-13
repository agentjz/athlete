import type { TelegramClassifiedUpdate, TelegramUpdate } from "./types.js";

export interface TelegramUpdateFilterOptions {
  allowedUserIds: readonly number[];
}

export function classifyTelegramUpdate(
  update: TelegramUpdate,
  options: TelegramUpdateFilterOptions,
): TelegramClassifiedUpdate {
  const message = update.message;
  if (!message) {
    return {
      kind: "ignore",
      updateId: update.update_id,
      reason: "unsupported_update",
      raw: update,
    };
  }

  const userId = message.from?.id;
  const normalizedUserId = typeof userId === "number" && Number.isFinite(userId) ? Math.trunc(userId) : null;
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const text = (message.text ?? message.caption ?? "").trim();
  const document = message.document;

  if (chatType !== "private") {
    return {
      kind: "ignore",
      updateId: update.update_id,
      reason: "non_private_chat",
      chatId,
      userId: normalizedUserId ?? undefined,
      chatType,
      raw: update,
    };
  }

  if (normalizedUserId === null) {
    return {
      kind: "ignore",
      updateId: update.update_id,
      reason: "empty_message",
      chatId,
      userId: normalizedUserId ?? undefined,
      chatType,
      raw: update,
    };
  }

  if (!options.allowedUserIds.includes(normalizedUserId)) {
    return {
      kind: "ignore",
      updateId: update.update_id,
      reason: "unauthorized_user",
      chatId,
      userId: normalizedUserId,
      chatType,
      raw: update,
    };
  }

  if (document?.file_id && document.file_unique_id) {
    return {
      kind: "private_file_message",
      updateId: update.update_id,
      peerKey: `telegram:private:${chatId}`,
      userId: normalizedUserId,
      chatId,
      messageId: message.message_id,
      text,
      fileId: document.file_id,
      fileUniqueId: document.file_unique_id,
      fileName: document.file_name,
      mimeType: document.mime_type,
      fileSize: document.file_size,
      raw: update,
    };
  }

  if (!text) {
    return {
      kind: "ignore",
      updateId: update.update_id,
      reason: "empty_message",
      chatId,
      userId: normalizedUserId,
      chatType,
      raw: update,
    };
  }

  return {
    kind: "private_message",
    updateId: update.update_id,
    peerKey: `telegram:private:${chatId}`,
    userId: normalizedUserId,
    chatId,
    messageId: message.message_id,
    text,
    raw: update,
  };
}
