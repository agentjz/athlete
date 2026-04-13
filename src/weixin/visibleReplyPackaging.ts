import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const WEIXIN_INLINE_VISIBLE_TEXT_MAX_CHARS = 5_000;

export type WeixinVisibleReplyPayload =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "file";
      filePath: string;
      fileName: string;
    };

export async function packageWeixinVisibleReply(options: {
  stateDir: string;
  text: string;
  inlineTextMaxChars?: number;
}): Promise<WeixinVisibleReplyPayload> {
  const inlineTextMaxChars = options.inlineTextMaxChars ?? WEIXIN_INLINE_VISIBLE_TEXT_MAX_CHARS;
  if (options.text.length <= inlineTextMaxChars) {
    return {
      kind: "text",
      text: options.text,
    };
  }

  const outboundDir = path.join(options.stateDir, "outbound-replies");
  await fs.mkdir(outboundDir, { recursive: true });
  const fileName = `athlete-reply-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.txt`;
  const filePath = path.join(outboundDir, fileName);
  await fs.writeFile(filePath, options.text, "utf8");

  return {
    kind: "file",
    filePath,
    fileName,
  };
}
