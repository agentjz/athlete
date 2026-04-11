# Telegram私聊

## 当前定位

Telegram 是 Athlete 的私聊宿主之一。

它负责把 Telegram Bot API 接到统一主路径上，而不是自己重造 runtime。

## 当前能力

- `telegram serve`
- 私聊白名单
- `/stop`
- session 绑定
- 可见事件输出
- 文件下载
- 文件回传

## 当前关键实现

- `src/telegram/cli.ts`
- `src/telegram/service.ts`
- `src/telegram/turnRunner.ts`
- `src/telegram/sendFileTool.ts`
- `src/telegram/deliveryQueue.ts`

## 当前约束

1. Telegram turn 必须经 `src/host/`。
2. Telegram 只保留 transport、delivery、typing、attachment、stop 语义。
3. send file 是 host extra tool，不是 Telegram 自己拼 runtime。
