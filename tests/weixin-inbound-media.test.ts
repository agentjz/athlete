import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { FileWeixinAttachmentStore } from "../src/weixin/attachmentStore.js";
import {
  buildWeixinMediaTurnInput,
  buildWeixinTextTurnInput,
  downloadWeixinAttachment,
} from "../src/weixin/inboundFiles.js";
import type { WeixinClientLike } from "../src/weixin/client.js";
import type {
  WeixinPrivateFileMessage,
  WeixinPrivateImageMessage,
  WeixinPrivateTextMessage,
  WeixinPrivateVideoMessage,
  WeixinPrivateVoiceMessage,
} from "../src/weixin/types.js";
import { createTempWorkspace } from "./helpers.js";

class FakeInboundWeixinClient implements WeixinClientLike {
  private readonly mediaDownloads = new Map<string, Uint8Array>();
  private readonly voiceDownloads = new Map<string, Uint8Array>();

  registerMedia(key: string, bytes: Uint8Array): void {
    this.mediaDownloads.set(key, bytes);
  }

  registerVoice(key: string, bytes: Uint8Array): void {
    this.voiceDownloads.set(key, bytes);
  }

  async downloadMedia(media: { encrypt_query_param?: string } | undefined): Promise<Uint8Array> {
    const key = media?.encrypt_query_param ?? "";
    const bytes = this.mediaDownloads.get(key);
    if (!bytes) {
      throw new Error(`Unknown media: ${key}`);
    }
    return bytes;
  }

  async downloadVoice(voice: { media?: { encrypt_query_param?: string } } | undefined): Promise<Uint8Array> {
    const key = voice?.media?.encrypt_query_param ?? "";
    const bytes = this.voiceDownloads.get(key);
    if (!bytes) {
      throw new Error(`Unknown voice: ${key}`);
    }
    return bytes;
  }

  async loginWithQr(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async getUpdates(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async getTypingConfig(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async sendTyping(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async sendText(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async sendImage(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async sendVideo(): Promise<never> {
    throw new Error("not implemented for this test");
  }

  async sendFile(): Promise<never> {
    throw new Error("not implemented for this test");
  }
}

function createBaseMessage<
  T extends
    | WeixinPrivateTextMessage
    | WeixinPrivateImageMessage
    | WeixinPrivateVideoMessage
    | WeixinPrivateFileMessage
    | WeixinPrivateVoiceMessage,
>(
  message: Omit<T, "peerKey" | "userId" | "messageId" | "seq" | "contextToken" | "raw">,
): T {
  return {
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    messageId: 101,
    seq: 1,
    contextToken: "ctx-001",
    raw: {} as never,
    ...message,
  } as unknown as T;
}

test("weixin inbound media downloads image, file, video, and voice into the state directory with persisted metadata", async (t) => {
  const root = await createTempWorkspace("weixin-inbound-media", t);
  const stateDir = path.join(root, ".athlete", "weixin");
  const client = new FakeInboundWeixinClient();
  const attachmentStore = new FileWeixinAttachmentStore(path.join(stateDir, "attachments.json"));

  client.registerMedia("image-enc", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  client.registerMedia("file-enc", new Uint8Array(Buffer.from("# brief\n")));
  client.registerMedia("video-enc", new Uint8Array(Buffer.from("mp4")));
  client.registerVoice("voice-enc", new Uint8Array(Buffer.from("wav-bytes")));

  const cases = [
    createBaseMessage<WeixinPrivateImageMessage>({
      kind: "private_image_message",
      mediaKind: "image",
      text: "analyze the image",
      media: {
        encrypt_query_param: "image-enc",
        aes_key: "image-key",
      },
    }),
    createBaseMessage<WeixinPrivateFileMessage>({
      kind: "private_file_message",
      mediaKind: "file",
      text: "please read the brief",
      fileName: "brief.md",
      media: {
        encrypt_query_param: "file-enc",
        aes_key: "file-key",
      },
    }),
    createBaseMessage<WeixinPrivateVideoMessage>({
      kind: "private_video_message",
      mediaKind: "video",
      text: "summarize this clip",
      media: {
        encrypt_query_param: "video-enc",
        aes_key: "video-key",
      },
    }),
    createBaseMessage<WeixinPrivateVoiceMessage>({
      kind: "private_voice_message",
      mediaKind: "voice",
      text: "",
      voiceTranscript: "voice transcript",
      sampleRate: 24_000,
      media: {
        encrypt_query_param: "voice-enc",
        aes_key: "voice-key",
      },
    }),
  ];

  for (const message of cases) {
    const attachment = await downloadWeixinAttachment({
      client,
      cwd: root,
      config: {
        stateDir,
      } as never,
      message,
      sessionId: "session-001",
    });

    await attachmentStore.add(attachment);
    const stats = await fs.stat(attachment.localFilePath);
    assert.equal(stats.isFile(), true);
    assert.equal(attachment.mediaKind, message.mediaKind);
  }

  const persisted = await fs.readFile(path.join(stateDir, "attachments.json"), "utf8");
  assert.match(persisted, /brief\.md/);
  assert.match(persisted, /voice/i);
});

test("weixin turn input includes downloaded attachment context and recent attachment history", async (t) => {
  const root = await createTempWorkspace("weixin-inbound-turn-input", t);
  const stateDir = path.join(root, ".athlete", "weixin");
  const attachmentStore = new FileWeixinAttachmentStore(path.join(stateDir, "attachments.json"));
  const client = new FakeInboundWeixinClient();
  client.registerMedia("file-enc", new Uint8Array(Buffer.from("# brief\n")));

  const message = createBaseMessage<WeixinPrivateFileMessage>({
    kind: "private_file_message",
    mediaKind: "file",
    text: "请分析我刚发的文件",
    fileName: "brief.md",
    media: {
      encrypt_query_param: "file-enc",
      aes_key: "file-key",
    },
  });

  const attachment = await downloadWeixinAttachment({
    client,
    cwd: root,
    config: {
      stateDir,
    } as never,
    message,
    sessionId: "session-001",
  });
  await attachmentStore.add(attachment);
  const recent = await attachmentStore.listByPeer(message.peerKey, 5);

  const fileInput = buildWeixinMediaTurnInput(message, attachment, recent, root);
  assert.match(fileInput, /Weixin attachment/i);
  assert.match(fileInput, /brief\.md/i);
  assert.match(fileInput, /请分析我刚发的文件/);

  const textInput = buildWeixinTextTurnInput(
    "继续分析刚才的文件",
    recent,
    root,
  );
  assert.match(textInput, /Recent attachments from this Weixin chat/i);
  assert.match(textInput, /brief\.md/i);
});
