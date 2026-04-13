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
  return ["[weixin]", describeWeixinEvent(event, context)].filter(Boolean).join(" ");
}

function describeWeixinEvent(event: string, context: WeixinLogContext): string {
  const identity = context.userId ? `user=${context.userId}` : "";
  const session = context.sessionId ? `session=${context.sessionId}` : "";
  const input = context.inputKind ? `input=${labelWeixinInputKind(context.inputKind)}` : "";
  const fileName = context.fileName ? `file=${context.fileName}` : "";
  const tool = context.toolName ? `tool=${context.toolName}` : "";

  switch (event) {
    case "service online":
      return joinFragments("服务已启动", context.detail ?? "");
    case "polling failure":
      return joinFragments("轮询失败", context.detail ?? "");
    case "received inbound message":
      return joinFragments(`收到${labelWeixinInputKind(context.inputKind)}消息`, identity, fileName);
    case "session ready":
      return joinFragments("会话已就绪", identity, session);
    case "starting turn":
      return joinFragments("开始处理请求", identity, session, input, fileName);
    case "phase":
      return joinFragments("处理中", identity, session, context.detail ?? "");
    case "tool call":
      return joinFragments("调用工具", tool, session, summarizePreview(context.detail, 72));
    case "tool finished":
      return joinFragments("工具完成", tool, session, context.detail ?? "");
    case "tool failed":
      return joinFragments("工具失败", tool, session, context.detail ?? "");
    case "queued text reply":
      return joinFragments("已排队文本回复", identity, summarizePreviewField(context.detail));
    case "queued file reply":
      return joinFragments("已排队文件回复", identity, fileName, summarizePreviewField(context.detail));
    case "delivery sent":
      return joinFragments(`已发送${labelOutgoingKind(context.detail, context.fileName)}`, identity, fileName);
    case "delivery failed":
      return joinFragments("发送失败", identity, fileName, context.detail ?? "");
    case "delivery blocked":
      return joinFragments("发送被阻塞", identity, fileName, context.detail ?? "");
    case "background task failure":
      return joinFragments("后台任务失败", identity, session, context.detail ?? "");
    case "delivery flush failure":
      return joinFragments("投递刷新失败", identity, session, context.detail ?? "");
    case "stop requested":
      return joinFragments("已请求停止当前任务", identity, session);
    case "stop armed for queued turn":
      return joinFragments("已标记停止排队中的任务", identity);
    case "stop requested with no active turn":
      return joinFragments("当前没有可停止的任务", identity);
    case "turn completed":
      return joinFragments("本轮处理完成", identity, session, context.detail ?? "");
    case "turn stopped":
      return joinFragments("本轮已停止", identity, session);
    case "turn failed":
      return joinFragments("本轮处理失败", identity, session, context.detail ?? "");
    default:
      return joinFragments(event, identity, session, input, fileName, tool, context.detail ?? "");
  }
}

function labelWeixinInputKind(inputKind: WeixinLogContext["inputKind"]): string {
  switch (inputKind) {
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "file":
      return "文件";
    case "voice":
      return "语音";
    case "text":
    default:
      return "文本";
  }
}

function labelOutgoingKind(detail: string | undefined, fileName: string | undefined): string {
  if (fileName || detail?.includes("type=file")) {
    return "文件";
  }

  return "文本回复";
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
