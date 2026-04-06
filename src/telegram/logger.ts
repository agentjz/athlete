export interface TelegramLogContext {
  peerKey?: string;
  userId?: number;
  chatId?: number;
  sessionId?: string;
  inputKind?: "text" | "file";
  fileName?: string;
  toolName?: string;
  detail?: string;
}

export interface TelegramLogger {
  info(event: string, context?: TelegramLogContext): void;
  error(event: string, context?: TelegramLogContext): void;
}

export function createConsoleTelegramLogger(): TelegramLogger {
  return {
    info(event, context) {
      console.log(formatTelegramLogLine(event, context));
    },
    error(event, context) {
      console.error(formatTelegramLogLine(event, context));
    },
  };
}

function formatTelegramLogLine(event: string, context: TelegramLogContext = {}): string {
  const fragments = ["[telegram]", event];

  if (context.userId) {
    fragments.push(`user=${context.userId}`);
  }
  if (context.chatId) {
    fragments.push(`chat=${context.chatId}`);
  }
  if (context.peerKey) {
    fragments.push(`peer=${context.peerKey}`);
  }
  if (context.sessionId) {
    fragments.push(`session=${context.sessionId}`);
  }
  if (context.inputKind) {
    fragments.push(`input=${context.inputKind}`);
  }
  if (context.fileName) {
    fragments.push(`file=${context.fileName}`);
  }
  if (context.toolName) {
    fragments.push(`tool=${context.toolName}`);
  }
  if (context.detail) {
    fragments.push(context.detail);
  }

  return fragments.join(" ");
}
