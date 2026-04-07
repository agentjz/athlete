# @openilink/openilink-sdk-node

微信 [iLink Bot API](https://ilinkai.weixin.qq.com) 的 Node.js SDK。

```bash
npm install @openilink/openilink-sdk-node
```

## 特性

- 扫码登录，支持扫码/过期回调
- 长轮询消息监听，自动重试与退避，动态超时
- 主动推送（自动缓存 `context_token`）
- 发送图片、视频、文件，MIME 自动路由
- CDN 加密上传/下载（AES-128-ECB）
- 语音消息解码（可插拔 SILK 解码器 + WAV 封装）
- 输入状态指示器、Bot 配置
- 可注入自定义 `fetch` 实现，便于测试、代理或自定义 Agent
- `fetch` + `AbortController` 传输层，便于在 Node 18+ 环境直接使用
- 结构化错误类型（`APIError`、`HTTPError`、`NoContextTokenError`、`RequestError`）
- 零运行时依赖

## 要求

- Node.js 18+

## 快速开始

```ts
import { Client, extractText } from "@openilink/openilink-sdk-node";
import { readFileSync, writeFileSync } from "node:fs";

const client = new Client("");

const result = await client.loginWithQr({
  on_qrcode: (img) => {
    console.log(`请扫码:\n${img}`);
  },
  on_scanned: () => {
    console.log("已扫码，请在微信中确认...");
  },
});

if (!result.connected) {
  throw new Error(result.message);
}

console.log(`已连接 BotID=${result.bot_id ?? ""}`);

const syncBufFile = new URL("./sync_buf.dat", import.meta.url);
let savedBuf = "";

try {
  savedBuf = readFileSync(syncBufFile, "utf8");
} catch {}

await client.monitor(
  async (message) => {
    const text = extractText(message);
    if (!text) {
      return;
    }

    await client.push(String(message.from_user_id), `收到: ${text}`);
  },
  {
    initial_buf: savedBuf,
    on_response: (response) => {
      console.log(response.sync_buf ?? "");
      console.log(response.raw_response?.status_code ?? 0);
    },
    on_buf_update: (buf) => {
      writeFileSync(syncBufFile, buf);
    },
  },
);
```

## API

### 创建客户端

```ts
import { Client } from "@openilink/openilink-sdk-node";

const client = new Client(token, {
  base_url: "https://custom.endpoint.com",
  cdn_base_url: "https://custom.cdn.com/c2c",
  bot_type: "3",
  version: "2.1.6",
  route_tag: "my-route-tag",
  fetch_impl: async (input, init) => {
    return fetch(input, init);
  },
  silk_decoder: async (silkData, sampleRate) => {
    return decodeSilkSomehow(silkData, sampleRate);
  },
});
```

### 扫码登录

```ts
const result = await client.loginWithQr({
  on_qrcode: (imgContent) => {},
  on_scanned: () => {},
  on_expired: (attempt, max) => {},
});
```

登录成功后，客户端的 token 和 `base_url` 会自动更新。

### 接收消息

```ts
import { extractText } from "@openilink/openilink-sdk-node";

await client.monitor(
  async (message) => {
    const text = extractText(message);
    // message.from_user_id, message.context_token, message.item_list
  },
  {
    initial_buf: savedBuf,
    on_response: (response) => {},
    on_buf_update: (buf) => {},
    on_error: (error) => {},
    on_session_expired: () => {},
    should_continue: () => true,
  },
);
```

`monitor()` 会自动缓存每个用户的 `context_token`，供 `push()` 使用。服务端返回的 `longpolling_timeout_ms` 会被自动采纳；成功响应里的 `sync_buf` 和原始 HTTP 元数据可通过 `on_response` / `raw_response` 读取。

### 发送文本

```ts
await client.sendText(userId, "你好", contextToken);
await client.push(userId, "这是一条定时通知");
```

### 发送媒体

```ts
import { MEDIA_IMAGE } from "@openilink/openilink-sdk-node";
import { readFileSync } from "node:fs";

const data = readFileSync("photo.jpg");

// 高级接口：自动识别 MIME 类型 -> 上传 -> 发送
await client.sendMediaFile(userId, contextToken, data, "photo.jpg", "看看这张图");

// 分步操作：上传 -> 发送
const uploaded = await client.uploadFile(data, userId, MEDIA_IMAGE);
await client.sendImage(userId, contextToken, uploaded);
await client.sendVideo(userId, contextToken, uploaded);
await client.sendFileAttachment(userId, contextToken, "report.pdf", uploaded);
```

### 下载媒体

```ts
import { ITEM_TYPE_IMAGE, ITEM_TYPE_VOICE } from "@openilink/openilink-sdk-node";

for (const item of message.item_list ?? []) {
  switch (item.type) {
    case ITEM_TYPE_IMAGE:
      await client.downloadMedia(item.image_item?.media);
      break;

    case ITEM_TYPE_VOICE:
      await client.downloadVoice(item.voice_item);
      break;
  }
}
```

### 语音解码

SDK 通过可插拔的 `silk_decoder` 支持语音消息解码，保持对外部解码器的开放性：

```ts
import { buildWAV, Client } from "@openilink/openilink-sdk-node";

const client = new Client(token, {
  silk_decoder: async (silkData, sampleRate) => {
    return decodeSilkSomehow(silkData, sampleRate);
  },
});

const wav = await client.downloadVoice(voiceItem);
```

也可以单独使用 WAV 封装：

```ts
const wav = buildWAV(pcmBytes, 24_000, 1, 16);
```

### 其他

```ts
import {
  CANCEL_TYPING,
  TYPING,
  ExtensionFromMIME,
  MIMEFromFilename,
  extractText,
  isImageMIME,
  isMediaItem,
  isVideoMIME,
} from "@openilink/openilink-sdk-node";
```

```ts
await client.sendTyping(userId, typingTicket, TYPING);
await client.sendTyping(userId, typingTicket, CANCEL_TYPING);

const config = await client.getConfig(userId, contextToken);

const text = extractText(message);
const media = isMediaItem(message.item_list?.[0]);

const mime = MIMEFromFilename("photo.jpg");     // image/jpeg
const ext = ExtensionFromMIME("image/jpg");     // .jpg
const image = isImageMIME("image/png");         // true
const video = isVideoMIME("video/mp4");         // true
```

## 错误处理

```ts
import {
  APIError,
  HTTPError,
  NoContextTokenError,
  RequestError,
} from "@openilink/openilink-sdk-node";

try {
  await client.push(userId, "hello");
} catch (error) {
  if (error instanceof APIError && error.isSessionExpired()) {
    // 需要重新登录
  } else if (error instanceof HTTPError) {
    console.log(error.statusCode);
  } else if (error instanceof NoContextTokenError) {
    // 该用户尚未发送过消息，无法主动推送
  } else if (error instanceof RequestError && error.isTimeout()) {
    // 请求超时
  }
}
```

## 常量

```ts
import {
  ITEM_TYPE_FILE,
  ITEM_TYPE_IMAGE,
  ITEM_TYPE_TEXT,
  ITEM_TYPE_VIDEO,
  ITEM_TYPE_VOICE,
  MEDIA_FILE,
  MEDIA_IMAGE,
  MEDIA_VIDEO,
  MEDIA_VOICE,
  MESSAGE_STATE_FINISH,
  MESSAGE_STATE_GENERATING,
  MESSAGE_STATE_NEW,
  MESSAGE_TYPE_BOT,
  MESSAGE_TYPE_USER,
} from "@openilink/openilink-sdk-node";

MEDIA_IMAGE;              // 1
MEDIA_VIDEO;              // 2
MEDIA_FILE;               // 3
MEDIA_VOICE;              // 4

MESSAGE_TYPE_USER;        // 1
MESSAGE_TYPE_BOT;         // 2

ITEM_TYPE_TEXT;           // 1
ITEM_TYPE_IMAGE;          // 2
ITEM_TYPE_VOICE;          // 3
ITEM_TYPE_FILE;           // 4
ITEM_TYPE_VIDEO;          // 5

MESSAGE_STATE_NEW;        // 0
MESSAGE_STATE_GENERATING; // 1
MESSAGE_STATE_FINISH;     // 2
```

## 许可证

MIT
