import type { TelegramIgnoredUpdate } from "../types.js";

export function isStopCommand(input: string): boolean {
  return input.trim().toLowerCase() === "/stop";
}

export function describeIgnoredTelegramUpdate(update: TelegramIgnoredUpdate): string {
  const fragments = [`update=${update.updateId}`, `reason=${update.reason}`];

  if (update.chatType) {
    fragments.push(`chat_type=${update.chatType}`);
  }

  switch (update.reason) {
    case "non_private_chat":
      fragments.push("Telegram host only accepts private chats.");
      break;
    case "unauthorized_user":
      fragments.push("Sender is not in DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS.");
      break;
    case "empty_message":
      fragments.push("Message has no text/caption or supported Telegram document payload.");
      break;
    case "unsupported_update":
      fragments.push("Only Telegram message updates are handled by long polling.");
      break;
    default:
      break;
  }

  return fragments.join(" ");
}
