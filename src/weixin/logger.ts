export interface WeixinLogContext {
  peerKey?: string;
  userId?: string;
  sessionId?: string;
  inputKind?: "text" | "image" | "video" | "file" | "voice";
  fileName?: string;
  toolName?: string;
  detail?: string;
}

export interface WeixinLogger {
  info(event: string, context?: WeixinLogContext): void;
  error(event: string, context?: WeixinLogContext): void;
}

export function createConsoleWeixinLogger(): WeixinLogger {
  return {
    info(event, context) {
      console.log(formatWeixinLogLine(event, context));
    },
    error(event, context) {
      console.error(formatWeixinLogLine(event, context));
    },
  };
}

function formatWeixinLogLine(event: string, context: WeixinLogContext = {}): string {
  const fragments = ["[weixin]", event];
  if (context.userId) {
    fragments.push(`user=${context.userId}`);
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
