# Weixin 私聊接入

## 范围

- 只支持 Weixin 私聊
- 不支持群聊、频道式广播、多平台网关
- 不做 `weixin-acp` / `codex-acp` / 外部子进程 agent 桥接
- 只做 Weixin 通道层能力扩展，不重写 Athlete 核心 runtime

## 宪法对齐

这块实现必须遵守 `spec/principles/` 里的核心原则：

- `P01 一个循环一个智能体`
  Weixin 只是把私聊消息接到现有 lead turn，不重写 agent loop
- `P16 配置只能有一个入口`
  Weixin 配置统一走 `src/config/store.ts` 和 `.athlete/.env`
- `P17 扩展靠事件生长`
  Weixin 通道通过边界模块、turn display、store、delivery queue 生长，不把平台细节塞进核心 runtime
- `P18 主循环和文件都不能长胖`
  Weixin 服务编排、turn 执行、附件处理、日志、命令语义、CLI 按职责拆模块
- `P19 先写失败测试再写实现`
  Weixin 配置、store、delivery、service、CLI、文档入口都有 fail-first 测试保护

## 模块边界

Weixin 相关实现集中在 `src/weixin/`：

- `types.ts`
  OpeniLink message shape 的 Athlete 规范化类型
- `config.ts`
  Weixin 配置默认值、归一化、运行时状态目录解析
- `client.ts`
  OpeniLink SDK 的 Athlete-native 包装层
- `polling.ts`
  long polling 和 `sync_buf` 提交
- `syncBufStore.ts`
  Weixin 拉取游标持久化
- `credentialsStore.ts`
  登录态持久化
- `sessionMapStore.ts`
  Weixin peer 到 Athlete session 的绑定
- `attachmentStore.ts`
  入站附件元数据持久化
- `contextTokenStore.ts`
  每个 peer 最新 `context_token` 的持久化、刷新、失效标记
- `deliveryQueue.ts`
  文本 / 图片 / 视频 / 文件投递队列、重试、恢复、`context_token` fail-closed
- `messageClassifier.ts`
  private-only 路由和消息类型判定
- `inboundFiles.ts`
  入站媒体下载、落盘、turn input 构造
- `localCommands.ts`
  Weixin 端命令语义适配
- `outputPort.ts`
  Weixin 文本输出适配
- `turnDisplay.ts`
  Weixin 过程输出适配
- `turnRunner.ts`
  单个 Weixin turn 的运行编排
- `service.ts`
  Weixin 服务总控、拉取、分发、stop、恢复
- `logger.ts`
  终端高层日志
- `processLock.ts`
  Weixin 服务单实例锁
- `cli.ts`
  `login / serve / logout` 正式命令入口
- `sendFileTool.ts`
  Weixin 出站媒体工具桥

CLI 注入仍然放在：

- `src/weixin/cli.ts`
- `src/cli.ts`

## 启动方式

命令：

```powershell
athlete weixin login
athlete weixin serve
athlete weixin logout
```

行为：

1. `login` 通过 OpeniLink QR 登录并保存登录态
2. `serve` 读取统一配置入口和项目状态目录
3. 获取 Weixin 单实例锁
4. 启动 long polling
5. 把私聊消息接入现有 Athlete session / turn 体系
6. 把文本和媒体回复先落到 delivery queue，再尝试发送
7. `logout` 清理登录态、`sync_buf` 和 token 相关发送状态

默认交互模式不会被劫持；只有显式执行 `athlete weixin ...` 才会启动 Weixin 通道。

## 配置

Weixin 配置统一并入 `AppConfig.weixin` / `RuntimeConfig.weixin`。

推荐通过 `.athlete/.env` 配置：

```text
ATHLETE_WEIXIN_ALLOWED_USER_IDS=wxid_alice,wxid_bob
ATHLETE_WEIXIN_BASE_URL=https://ilinkai.weixin.qq.com
ATHLETE_WEIXIN_CDN_BASE_URL=https://novac2c.cdn.weixin.qq.com/c2c
ATHLETE_WEIXIN_POLLING_TIMEOUT_MS=30000
ATHLETE_WEIXIN_POLLING_RETRY_BACKOFF_MS=1000
ATHLETE_WEIXIN_MESSAGE_CHUNK_CHARS=3500
ATHLETE_WEIXIN_TYPING_INTERVAL_MS=4000
ATHLETE_WEIXIN_QR_TIMEOUT_MS=480000
ATHLETE_WEIXIN_DELIVERY_MAX_RETRIES=6
ATHLETE_WEIXIN_DELIVERY_BASE_DELAY_MS=1000
ATHLETE_WEIXIN_DELIVERY_MAX_DELAY_MS=30000
ATHLETE_WEIXIN_ROUTE_TAG=
```

说明：

- `ATHLETE_WEIXIN_ALLOWED_USER_IDS` 必须显式配置；空白名单等于任何人都不能控制
- Weixin 配置仍然只走同一套配置入口，不另起平行配置系统
- 登录态不放进配置文件，而是放在项目状态目录下的 `credentials.json`

## 单实例语义

Weixin 服务必须是单实例：

- 同一个项目状态目录下，只允许一个 `weixin serve`
- 如果已经有一个存活实例，第二个实例直接拒绝启动
- 如果只剩下陈旧 `service.pid`，新实例会识别为 stale lock 并自动覆盖

这样可以避免：

- 同一条消息被两个实例重复消费
- 同一条回复被重复发送
- 用户误以为服务已经退出但实际上还有旧实例在线

## 状态与恢复

Weixin 状态目录位于：

```text
<project-state-root>/.athlete/weixin/
```

持久化内容包括：

- `credentials.json`
  扫码登录态
- `sync-buf.json`
  下一个拉取游标
- `session-map.json`
  `weixin:private:<userId>` 到 Athlete session 的映射
- `attachments.json`
  入站图片 / 视频 / 文件 / 语音元数据和本地落盘路径
- `context-token.json`
  每个 peer 最新可用的 `context_token`
- `delivery.json`
  待发送文本 / 图片 / 视频 / 文件、重试次数、阻塞原因
- `service.pid`
  Weixin 单实例锁

恢复语义：

1. 重启后先恢复 `sync_buf`
2. `session-map.json` 恢复同一 Weixin 私聊到同一个 Athlete session
3. `delivery.json` 在启动和轮询前后都会扫描并补发
4. `attachments.json` 让“刚发的文件 / 图片 / 语音”这类语义可继续工作
5. `context-token.json` 决定哪些待发送项现在可投递，哪些必须继续保留

## `context_token` 限制

`context_token` 是 Weixin 通道的硬边界。

Athlete 当前正式语义：

- 每次入站消息都会捕获并更新当前 peer 可用的 `context_token`
- 所有出站文本 / 图片 / 视频 / 文件都必须使用当前 token
- delivery queue 会显式区分：
  - `missing_context_token`
  - `context_token_invalid`
- 如果服务重启后队列里还有待发送项，但 token 缺失或失效：
  - 不丢消息
  - 不误报成功
  - 不 silent failure
- 待发送项会保留
- 只有等这个 peer 下次再发新消息、token 刷新后，队列才会再次尝试投递

这是 Weixin 和 Telegram 最关键的运行差异之一，README 和测试都必须同时体现。

## 文件能力

### 入站媒体

- 支持图片、视频、文件、语音入站
- OpeniLink 下载后的本地文件会进入当前 turn input 和附件上下文
- 语音通过 OpeniLink 提供的下载 / 解码入口落成本地 WAV
- 附件元数据会写入 `attachments.json`

### 出站媒体

- 支持文本、图片、视频、文件出站
- 工具桥会根据文件类型做真实路由
- 不支持“只回复一个本地路径”这种伪文件发送
- 不支持语音回发；该能力因为上游没有稳定发送接口而 fail-closed 拒绝

## `/stop`

Weixin 端只保留一个停止命令：

```text
/stop
```

语义：

- 只停止“当前这个 Weixin 用户当前正在执行的任务”
- 服务继续在线
- 不影响其他白名单用户
- 当前任务停止后，这个用户还能继续发下一条任务

## 命令语义

Weixin 端命令语义与本地 CLI 有明确边界：

- `/session`、`/config`、`/runtime` 等查看类命令继续复用现有本地命令层
- `/multi` 明确拒绝，并提示直接发送完整消息
- `quit` / `reset` / `/reset` 只做提示，不执行本地终端语义

## 过程输出

Weixin 过程输出保持聊天式，但优先保证“最终结果稳定可见”，不刷底层噪音。

聊天框里的可见消息：

- `todo_write` 对应的可见 preview 一次，就发一条 todo preview 消息
- `onAssistantDelta` 只作为阶段内缓冲信号，不直接发聊天消息
- `onAssistantText` 表示拿到了完整 assistant 文本时，发一条 assistant 消息
- `onAssistantDone` 带文本且当前 assistant 阶段尚未发出时，发一条最终 assistant 消息
- 不合并多段 assistant
- Weixin 不再发送 tool call 聊天消息，避免挤占最终回复的可见额度
- 短回复走普通文本；长回复超过阈值时直接写成 `.txt` 文件并作为文件发送
- 不把 todo / assistant 混成一条

不发送：

- tool call
- 工具输出正文
- 大段文件原文
- 底层噪音日志
- reasoning
- `onStatus` 一类非可见噪音

终端日志持续输出高层事件：

- 收到哪个 Weixin 用户的消息
- 当前进入哪个 session
- 当前阶段、工具、成功 / 失败 / 停止
- 当前是否发送了文本或媒体

显式信号与可靠性约束：

- Weixin / Telegram 共享同一层可见事件判定与 durable turn display
- durable outbound 只按事件顺序发送，不按文本去重
- 如果要防重复，只能基于 event id / delivery state，不能基于文本内容
- `runOnce` 必须等当前 turn 的可见输出 durable 完成后再 commit 输入
- `serve` 主循环通过显式 pending-commit 队列继续轮询和处理 `/stop`，不靠时序猜测
- 可见消息 durable enqueue 失败不能 silent swallow，必须继续上抛

## 串行与隔离

- 同一 Weixin peer 使用 per-peer queue 串行执行
- 不同 peer 之间允许并发
- `/stop` 与 per-peer 串行队列兼容
- 同一个 peer 的 turn 不能并发破坏同一个 session

## 安全与约束

- 只接受 `allowedUserIds` 白名单内的私聊用户
- 非白名单用户不会进入 Athlete turn
- 群聊消息不会进入 session
- Weixin 端仍然遵守 Athlete 当前 runtime 的 `mode`、`allowedRoots` 和执行约束

## 非目标 / fail-closed 边界

- 不做 `weixin-acp` / `codex-acp` 子进程桥接
- 不做群聊路由投机实现
- 不伪造语音回发能力
- 不在 `src/agent/`、`src/tools/`、`src/ui/` 里散落平台特有分支
