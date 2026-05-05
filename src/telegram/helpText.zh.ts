export const TELEGRAM_HELP_TEXT = [
  "/help            Show Telegram usage help",
  "/stop            Stop the current Telegram task without shutting down the bot service",
  "/session         Show the session ID bound to this Telegram chat",
  "/config          Show current runtime configuration",
  "/multi           Telegram does not support interactive multiline mode; send the full message directly",
  "",
  "File usage:",
  "- Send files directly to the private chat. Kitty downloads them and attaches them to the current session.",
  "- You can ask Kitty to analyze the file you just sent or send a named file back.",
  "- Use /stop when you need to stop the current task.",
  "",
  "Note: local terminal exit/reset commands do not run in Telegram.",
].join("\n");

export const TELEGRAM_UNSUPPORTED_RESET_TEXT =
  "Local terminal exit/reset commands do not run in Telegram. Use /stop to stop the current Telegram task.";

export const TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT = TELEGRAM_UNSUPPORTED_RESET_TEXT;
