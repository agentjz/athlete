# Telegram 私聊接入

## 范围

- 只支持 Telegram 私聊
- 不支持群聊、超级群、频道
- 不做 Webhook 平台化，不做按钮系统，不做多平台网关
- 只做 Telegram 通道层能力增强，不重写 Athlete 核心 runtime

## 宪法对齐

这块实现必须遵守 `spec/principles/` 里的几条核心原则：

- `P01 一个循环一个智能体`
  Telegram 只是把私聊消息接到现有 lead turn，不重写 agent loop
- `P02 加一个工具只加一个处理器`
  Telegram 文件回传能力通过独立工具处理器接入，不把平台分支塞进核心循环
- `P16 配置只能有一个入口`
  Telegram 配置统一走 `src/config/store.ts` 和 `.athlete/.env`
- `P17 扩展靠事件生长`
  Telegram 通道通过边界模块、turn display、tool registry、store 扩展，不靠在主循环里硬塞平台细节
- `P18 主循环和文件都不能长胖`
  Telegram 服务编排、turn 执行、附件处理、日志和命令语义要按职责拆模块，避免一个大文件继续膨胀

## 模块边界

Telegram 相关实现集中在 `src/telegram/`：

- `types.ts`
  Telegram update/message 的规范化类型
- `config.ts`
  Telegram 配置默认值、归一化、运行时目录解析
- `botApiClient.ts`
  Telegram Bot API HTTP 客户端
- `polling.ts`
  long polling 和 offset 提交
- `offsetStore.ts`
  update offset 持久化
- `sessionMapStore.ts`
  Telegram peer 到 Athlete session 的绑定
- `attachmentStore.ts`
  Telegram 入站附件元数据持久化
- `deliveryQueue.ts`
  文本/文件投递队列、重试、恢复
- `messageChunking.ts`
  长文本分片
- `localCommands.ts`
  Telegram 端命令语义适配
- `turnDisplay.ts`
  Telegram 过程输出适配
- `turnRunner.ts`
  单个 Telegram turn 的运行编排
- `service.ts`
  Telegram 服务总控、拉取、分发、stop、恢复
- `logger.ts`
  终端高层日志
- `sendFileTool.ts`
  Telegram 文件回传工具
- `processLock.ts`
  Telegram 服务单实例锁
- `proxy.ts`
  Telegram 代理环境接线

CLI 只负责注册命令和注入依赖，仍然放在：

- `src/telegram/cli.ts`
- `src/cli.ts`

## 启动方式

命令：

```powershell
athlete telegram serve
```

行为：

1. 读取统一配置入口 `src/config/store.ts`
2. 解析 Telegram runtime 配置
3. 获取 Telegram 单实例锁
4. 启动 long polling
5. 把私聊消息接入现有 Athlete session / turn 体系
6. 把文本和文件回复先落盘到 delivery queue，再尝试发送

默认交互模式不会被劫持；只有显式执行 `athlete telegram serve` 才会启动 Telegram 服务。

## 配置

Telegram 配置统一并入 `AppConfig.telegram` / `RuntimeConfig.telegram`。

推荐通过 `.athlete/.env` 配置：

```text
ATHLETE_TELEGRAM_TOKEN=replace-with-your-bot-token
ATHLETE_TELEGRAM_ALLOWED_USER_IDS=123456789
ATHLETE_TELEGRAM_API_BASE_URL=https://api.telegram.org
ATHLETE_TELEGRAM_PROXY_URL=http://127.0.0.1:7897
ATHLETE_TELEGRAM_POLLING_TIMEOUT_SECONDS=50
ATHLETE_TELEGRAM_POLLING_LIMIT=100
ATHLETE_TELEGRAM_POLLING_RETRY_BACKOFF_MS=1000
ATHLETE_TELEGRAM_MESSAGE_CHUNK_CHARS=3500
ATHLETE_TELEGRAM_TYPING_INTERVAL_MS=4000
ATHLETE_TELEGRAM_DELIVERY_MAX_RETRIES=6
ATHLETE_TELEGRAM_DELIVERY_BASE_DELAY_MS=1000
ATHLETE_TELEGRAM_DELIVERY_MAX_DELAY_MS=30000
```

说明：

- `ATHLETE_TELEGRAM_ALLOWED_USER_IDS` 必须显式配置；空白名单等于任何人都不能控制 bot
- `ATHLETE_TELEGRAM_PROXY_URL` 是 Telegram 专用代理入口，例如 Clash Verge 的 `mixed-port`
- Telegram 配置仍然只走同一套配置入口，不另起平行配置系统

## 什么是本地代理入口

当用户使用 Clash Verge、Clash Meta、mihomo 这类代理工具时，常见情况是：

- Telegram 域名会被 fake-ip 机制映射成 `198.18.x.x`
- 应用程序自己不能直接拿这个 fake-ip 去直连
- 应用程序应该把请求交给本地代理软件去转发

这里的“本地代理入口”就是：

- 代理软件跑在用户自己的电脑上
- 它会打开一个本地地址
- 例如 `http://127.0.0.1:7897`

对于 Telegram 服务来说，真正稳定要配置的是这个本地入口，而不是 Telegram 最后被解析成的 fake-ip。

## 单实例语义

Telegram 服务必须是单实例：

- 同一个项目状态目录下，只允许一个 `telegram serve`
- 如果已经有一个存活实例，第二个实例直接拒绝启动
- 如果只剩下陈旧 `service.pid`，新实例会识别为 stale lock 并自动覆盖

这样可以避免：

- 同一条消息被两个实例重复消费
- 同一条最终回复被重复发送
- 用户关掉一个窗口后，误以为服务还神秘存活

## 会话与恢复

Telegram 状态目录位于：

```text
<project-state-root>/.athlete/telegram/
```

持久化内容包括：

- `offset.json`
  下一个待消费的 Telegram update offset
- `session-map.json`
  `telegram:private:<chatId>` 到 Athlete session 的映射
- `attachments.json`
  入站文件元数据和本地落盘路径
- `delivery.json`
  待发送文本/文件、重试次数和下次重试时间
- `service.pid`
  Telegram 单实例锁文件

恢复语义：

1. 重启后先读 `offset.json`，从上次提交之后继续拉取
2. `session-map.json` 恢复同一 Telegram 私聊到同一个 Athlete session
3. `delivery.json` 在启动和轮询前后都会扫描并补发
4. `attachments.json` 让“刚发的文件”这类语义可继续工作
5. `service.pid` 如果是失效旧 pid，会被新实例覆盖

## 文件能力

### 入站文件

- 用户可以在 Telegram 私聊直接发文件
- Bot API 会下载文件到项目状态目录下的 Telegram 文件目录
- 附件元数据会持久化
- 当前 turn 会拿到这份文件的本地路径和上下文说明
- 用户可以继续说“分析我刚发的文件”

### 出站文件

- 用户可以要求 Athlete 查找本地文件并发回 Telegram
- 用户可以要求 Athlete 生成文件并发回 Telegram
- 回复形式必须是真实 Telegram document
- 不允许只发本地路径或文本链接糊弄

### 恢复与边界

- 文本和文件都先进入 delivery queue，再尝试发送
- 失败后按指数退避重试
- 服务重启后继续恢复待发送文本和文件
- 文件大小要做边界校验

## `/stop`

Telegram 端只保留一个停止命令：

```text
/stop
```

语义：

- 只停止“当前这个 Telegram 用户当前正在执行的任务”
- bot 服务继续在线
- 不停止整个 Telegram 服务
- 不影响其他白名单用户
- 停止后当前用户还能继续发下一条任务

## Telegram 端命令语义

Telegram 端命令语义与本地 CLI 有明确边界：

- `/session`、`/config`、`/runtime` 等查看类命令继续复用现有本地命令层
- `/multi` 明确拒绝，并提示直接发送完整消息
- `quit` / `reset` 不再作为 Telegram 主命令暴露
- Telegram 端收到 `quit` / `reset` 时，只做提示，不执行本地终端语义

## 过程输出

Telegram 过程输出要更接近终端工作感知，但不能刷底层噪音。

### Telegram 聊天框里的阶段消息

过程消息按实际事件顺序发送，不做机械固定轮换：

- AI 开始调用一个工具，就把工具名单独发出来
- 如果执行了 `todo_write`，就把当前 todo 列表单独发出来
- 最终结果单独发一条

不发送的内容：

- 工具输出正文
- 大段文件原文
- 底层噪音日志

格式约束：

- 不额外加抬头
- 不输出 reasoning
- 过程消息保持聊天式、顺序式输出，更接近终端高层过程感知

### 终端日志

终端持续输出高层过程日志，包括：

- 收到哪个 Telegram 用户的消息
- 当前进入哪个 session
- 当前在哪个阶段
- 当前调用了哪个工具
- 当前是否停止、失败、成功
- 当前是否发送了文本或文件

## 串行与隔离

- 同一 Telegram peer 使用 `PerPeerCommandQueue` 串行执行
- 不同 peer 之间允许并发
- `/stop` 与 per-peer 串行队列兼容
- 同一个 peer 的 turn 不能并发破坏同一个 session

## 安全与约束

- 只接受 `allowedUserIds` 白名单内的私聊用户
- 非白名单用户不会进入 Athlete turn
- 群聊/频道消息不会进入私聊 session
- Telegram 端仍然遵守 Athlete 当前 runtime 的 `mode`、`allowedRoots` 和执行约束

## 维护约束

- Telegram 平台细节不能下沉到 `src/agent/`、`src/tools/`、`src/ui/`
- 只允许薄接线进入核心 runtime
- 新增能力优先继续生长在 `src/telegram/`
