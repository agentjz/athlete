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
  return ["[telegram]", describeTelegramEvent(event, context)].filter(Boolean).join(" ");
}

function describeTelegramEvent(event: string, context: TelegramLogContext): string {
  const identity = joinFragments(
    context.userId ? `user=${context.userId}` : "",
    context.chatId ? `chat=${context.chatId}` : "",
  );
  const session = context.sessionId ? `session=${context.sessionId}` : "";
  const input = context.inputKind ? `input=${labelTelegramInputKind(context.inputKind)}` : "";
  const fileName = context.fileName ? `file=${context.fileName}` : "";
  const tool = context.toolName ? `tool=${context.toolName}` : "";

  switch (event) {
    case "service online":
      return joinFragments("service started", context.detail ?? "");
    case "polling failure":
      return joinFragments("poll failed", context.detail ?? "");
    case "ignored inbound update":
      return joinFragments("ignored update", identity, context.detail ?? "");
    case "received inbound message":
      return joinFragments(`received ${labelTelegramInputKind(context.inputKind)} message`, identity, fileName);
    case "session ready":
      return joinFragments("session ready", identity, session);
    case "starting turn":
      return joinFragments("starting turn", identity, session, input, fileName);
    case "phase":
      return joinFragments("processing", identity, session, context.detail ?? "");
    case "tool call":
      return joinFragments("tool call", tool, session, summarizePreview(context.detail, 72));
    case "tool finished":
      return joinFragments("tool complete", tool, session, context.detail ?? "");
    case "tool failed":
      return joinFragments("tool failed", tool, session, context.detail ?? "");
    case "queued text reply":
      return joinFragments("queued text reply", context.chatId ? `chat=${context.chatId}` : "", summarizePreviewField(context.detail));
    case "delivery sent":
      return joinFragments(`sent ${labelOutgoingKind(context.detail, context.fileName)}`, context.chatId ? `chat=${context.chatId}` : "", fileName);
    case "delivery failed":
      return joinFragments("send failed", context.chatId ? `chat=${context.chatId}` : "", fileName, context.detail ?? "");
    case "background task failure":
      return joinFragments("background task failed", identity, session, context.detail ?? "");
    case "delivery flush failure":
      return joinFragments("delivery flush failed", identity, session, context.detail ?? "");
    case "stop requested":
      return joinFragments("stop requested", identity, session);
    case "stop armed for queued turn":
      return joinFragments("queued turn marked stopped", identity);
    case "stop requested with no active turn":
      return joinFragments("no active turn to stop", identity);
    case "turn completed":
      return joinFragments("turn complete", identity, session, context.detail ?? "");
    case "turn stopped":
      return joinFragments("turn stopped", identity, session);
    case "turn failed":
      return joinFragments("turn failed", identity, session, context.detail ?? "");
    default:
      return joinFragments(event, identity, session, input, fileName, tool, context.detail ?? "");
  }
}

function labelTelegramInputKind(inputKind: TelegramLogContext["inputKind"]): string {
  switch (inputKind) {
    case "file":
      return "file";
    case "text":
    default:
      return "text";
  }
}

function labelOutgoingKind(detail: string | undefined, fileName: string | undefined): string {
  if (fileName || detail?.includes("type=file")) {
    return "file";
  }

  return "text reply";
}

function summarizePreview(value: string | undefined, maxChars: number): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 3)}...`;
}

function summarizePreviewField(value: string | undefined): string {
  const preview = summarizePreview(value, 48);
  return preview ? `preview=${preview}` : "";
}

function normalizeText(value: string | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function joinFragments(...fragments: string[]): string {
  return fragments.filter(Boolean).join(" ");
}
