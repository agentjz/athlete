# Telegram私聊

## 文档目的

本文说明 Telegram 宿主当前负责什么、保存哪些宿主态、如何进入统一主路径，以及哪些行为被测试保护。

## 模块目标与当前状态

Telegram 当前是私聊宿主之一，负责把 Telegram Bot API 接到统一 host 边界，而不是自行重造 runtime。

## 正式边界

主要代码边界：

- `src/telegram/cli.ts`
- `src/telegram/service.ts`
- `src/telegram/service/turnState.ts`
- `src/telegram/service/updateClassification.ts`
- `src/telegram/service/observability.ts`
- `src/telegram/updateCommitQueue.ts`
- `src/telegram/turnRunner.ts`
- `src/telegram/sessionMapStore.ts`
- `src/telegram/offsetStore.ts`
- `src/telegram/deliveryQueue.ts`
- `src/telegram/sendFileTool.ts`

## 真相源与状态归属

Telegram 当前保存的宿主态包括：

- session map
- offset
- delivery queue
- 附件与可见输出相关状态

这些状态只服务 Telegram 通道运行，不裁决任务或执行真相。

## 主路径

当前主路径如下：

1. `telegram serve` 拉起服务。
2. `service.ts` 拉取并筛选 private updates。
3. 通过 session map 找到或创建正式 session。
4. `turnRunner.ts` 经 `src/host/` 执行 turn。
5. 回复、文件和可见输出进入 delivery queue。
6. `/stop` 只终止当前会话或当前 peer 的执行，不改系统主路径。

## 模块职责与非职责

### Telegram 宿主负责

- transport、delivery、attachment
- private-only 过滤与白名单
- `/stop`
- 宿主侧操作日志

### Telegram 宿主不负责

- 定义 runtime 真相源
- 自行拼接 runtime tools
- 绕开 `src/host/` 直接执行 turn

## 失败路径与异常路径

当前明确处理：

- delivery failure 会被记录并保留正式失败语义
- send file 通过 host extra tool 注入，不伪装成 builtin
- 可见事件采用白名单：只向 Telegram 发送 `assistant` 阶段文本和 `todo_write` 预览
- 非 todo 的工具调用与工具结果预览（例如通用 tool output / read preview）不会进入 Telegram 聊天消息
- 可见输出属于宿主展示层，不复写核心主路径

## 测试与验证

当前主要由以下测试保护：

- `tests/telegram-service.test.ts`
- `tests/telegram-visible-events-service.test.ts`
- `tests/telegram-enhancements.test.ts`
- `tests/telegram-queues.test.ts`
- `tests/telegram-cli.test.ts`
- `tests/telegram-config-and-stores.test.ts`
- `tests/host-service-observability.test.ts`

## 当前落地决定

Telegram 当前已经固定为“宿主外壳 + 统一 host 边界 + 私聊服务”的实现方式。增加能力应继续落在 transport、delivery 和宿主侧体验上，而不是把 Telegram 自己变成第二套 runtime。

