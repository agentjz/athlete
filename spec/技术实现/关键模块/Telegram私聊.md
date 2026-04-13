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
- 面向操作者的终端状态日志
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
4. Telegram 终端日志面向操作者，只输出服务、入站、turn、投递等短状态，不直接把内部 event name 当用户提示语。
