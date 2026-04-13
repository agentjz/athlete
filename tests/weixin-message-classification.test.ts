import assert from "node:assert/strict";
import test from "node:test";

import { classifyWeixinMessage } from "../src/weixin/messageClassifier.js";
import type { WeixinRawMessage } from "../src/weixin/types.js";

function createTextMessage(
  overrides: {
    fromUserId?: string;
    toUserId?: string;
    text?: string;
    contextToken?: string;
    groupId?: string;
    messageType?: number;
    clientId?: string;
  } = {},
): WeixinRawMessage {
  return {
    seq: 1,
    message_id: 101,
    from_user_id: overrides.fromUserId ?? "wxid_alice",
    to_user_id: overrides.toUserId ?? "athlete-bot",
    create_time_ms: 0,
    message_type: overrides.messageType ?? 1,
    context_token: overrides.contextToken ?? "ctx-001",
    client_id: overrides.clientId,
    group_id: overrides.groupId,
    item_list: [
      {
        type: 1,
        text_item: {
          text: overrides.text ?? "hello athlete",
        },
      },
    ],
  };
}

function createMediaMessage(
  mediaType: "image" | "file" | "video" | "voice",
  overrides: {
    fromUserId?: string;
    text?: string;
    contextToken?: string;
  } = {},
): WeixinRawMessage {
  const item =
    mediaType === "image"
      ? {
          type: 2,
          image_item: {
            media: {
              encrypt_query_param: "image-enc",
              aes_key: "image-key",
            },
          },
        }
      : mediaType === "file"
        ? {
            type: 4,
            file_item: {
              file_name: "brief.md",
              len: "24",
              media: {
                encrypt_query_param: "file-enc",
                aes_key: "file-key",
              },
            },
          }
        : mediaType === "video"
          ? {
              type: 5,
              video_item: {
                video_size: 2048,
                media: {
                  encrypt_query_param: "video-enc",
                  aes_key: "video-key",
                },
              },
            }
          : {
              type: 3,
              voice_item: {
                text: "voice transcript",
                sample_rate: 24_000,
                media: {
                  encrypt_query_param: "voice-enc",
                  aes_key: "voice-key",
                },
              },
            };

  return {
    ...createTextMessage({
      fromUserId: overrides.fromUserId,
      text: overrides.text ?? "",
      contextToken: overrides.contextToken,
    }),
    item_list: [
      item,
      {
        type: 1,
        text_item: {
          text: overrides.text ?? "",
        },
      },
    ],
  };
}

test("weixin classifier accepts authorized private text messages", () => {
  const classified = classifyWeixinMessage(createTextMessage(), {
    allowedUserIds: ["wxid_alice"],
  });

  assert.equal(classified.kind, "private_text_message");
  assert.equal(classified.userId, "wxid_alice");
  assert.equal(classified.peerKey, "weixin:private:wxid_alice");
  assert.equal(classified.text, "hello athlete");
  assert.equal(classified.contextToken, "ctx-001");
});

test("weixin classifier rejects unauthorized, grouped, empty, and unsupported messages", () => {
  const unauthorized = classifyWeixinMessage(createTextMessage(), {
    allowedUserIds: ["wxid_bob"],
  });
  assert.equal(unauthorized.kind, "ignore");
  assert.equal(unauthorized.reason, "unauthorized_user");

  const group = classifyWeixinMessage(
    createTextMessage({
      groupId: "room-001",
    }),
    {
      allowedUserIds: ["wxid_alice"],
    },
  );
  assert.equal(group.kind, "ignore");
  assert.equal(group.reason, "group_chat_unsupported");

  const empty = classifyWeixinMessage(
    {
      ...createTextMessage({
        text: "",
      }),
      item_list: [],
    },
    {
      allowedUserIds: ["wxid_alice"],
    },
  );
  assert.equal(empty.kind, "ignore");
  assert.equal(empty.reason, "empty_message");

  const unsupported = classifyWeixinMessage(
    createTextMessage({
      messageType: 2,
    }),
    {
      allowedUserIds: ["wxid_alice"],
    },
  );
  assert.equal(unsupported.kind, "ignore");
  assert.equal(unsupported.reason, "unsupported_message");
});

test("weixin classifier recognizes outbound bot text echo receipts by client_id", () => {
  const classified = classifyWeixinMessage(
    createTextMessage({
      fromUserId: "athlete-bot",
      toUserId: "wxid_alice",
      text: "final reply",
      messageType: 2,
      clientId: "athlete-weixin:receipt-001",
    }),
    {
      allowedUserIds: ["wxid_alice"],
    },
  );

  assert.equal(classified.kind, "outbound_text_echo");
  assert.equal(classified.peerKey, "weixin:private:wxid_alice");
  assert.equal(classified.userId, "wxid_alice");
  assert.equal(classified.clientId, "athlete-weixin:receipt-001");
  assert.equal(classified.text, "final reply");
});

test("weixin classifier distinguishes image, file, video, and voice messages", () => {
  const image = classifyWeixinMessage(createMediaMessage("image"), {
    allowedUserIds: ["wxid_alice"],
  });
  assert.equal(image.kind, "private_image_message");
  assert.equal(image.mediaKind, "image");

  const file = classifyWeixinMessage(createMediaMessage("file"), {
    allowedUserIds: ["wxid_alice"],
  });
  assert.equal(file.kind, "private_file_message");
  assert.equal(file.mediaKind, "file");
  assert.equal(file.fileName, "brief.md");

  const video = classifyWeixinMessage(createMediaMessage("video"), {
    allowedUserIds: ["wxid_alice"],
  });
  assert.equal(video.kind, "private_video_message");
  assert.equal(video.mediaKind, "video");

  const voice = classifyWeixinMessage(createMediaMessage("voice"), {
    allowedUserIds: ["wxid_alice"],
  });
  assert.equal(voice.kind, "private_voice_message");
  assert.equal(voice.mediaKind, "voice");
  assert.equal(voice.voiceTranscript, "voice transcript");
});
