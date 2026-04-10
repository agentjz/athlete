# runtime metrics

## 作用

这一层开始，Athlete 的 session 会持久化结构化 `runtimeStats`，
作为正式运行态仪表盘的真相源。

prompt layer metrics / context diagnostics 不属于这里的持久化真相源；它们只是在 request 构建阶段即时派生，用于诊断 prompt 体积、分层占比、hotspot 与压缩触发原因。

它回答的是：

- 这次 session 一共发了多少次 provider request
- 模型等待总耗时是多少
- tool 一共调用了多少次、各自累计耗时多少
- yield / continuation / recovery / compression 各发生了多少次
- 有多少 tool result 被 externalize，以及累计字节数是多少
- provider usage 是 available、partial 还是 unavailable

## 真相源位置

- `SessionRecord.runtimeStats`
- 仍然持久化在既有 session JSON 文件里
- 不新建平行 JSON 真相源

## 当前结构

`runtimeStats` 当前包含：

- `version`
- `model.requestCount`
- `model.waitDurationMsTotal`
- `model.usage.requestsWithUsage`
- `model.usage.requestsWithoutUsage`
- `model.usage.inputTokensTotal`
- `model.usage.outputTokensTotal`
- `model.usage.totalTokensTotal`
- `model.usage.reasoningTokensTotal`
- `tools.callCount`
- `tools.durationMsTotal`
- `tools.byName`
- `events.continuationCount`
- `events.yieldCount`
- `events.recoveryCount`
- `events.compressionCount`
- `externalizedToolResults.count`
- `externalizedToolResults.byteLengthTotal`
- `updatedAt`

## 来源

### model request

- 来源：`src/agent/api.ts`
- 统计粒度：真实 provider request attempt
- 包括 streaming、non-streaming fallback、retry、retry fallback

### tool execution

- 来源：`src/agent/runTurn.ts`
- 统计粒度：真实 runtime tool execution
- `tools.byName` 记录每个 tool 的调用次数、累计耗时、成功次数、失败次数

### yield / continuation / recovery

- 来源：`src/agent/turn/persistence.ts`
- continuation 包括：
  - managed continuation 的内部续跑输入
  - 用户显式 `continue` / `resume` 这类恢复输入

### compression

- 来源：`src/agent/runTurn.ts`
- 当 `buildRequestContext(...)` 返回 `compressed = true` 时记一次

### externalized tool results

- 来源：`src/agent/runTurn.ts` + `src/agent/toolResults/storage.ts`
- 只在 tool result 实际被 externalize 时累计

## 用户入口

当前最小仪表盘入口：

- `/runtime`
- `/stats`
- `/仪表盘`

这些命令读取既有 session 真相源，并在命令执行当下即时派生 prompt diagnostics。
它们可以解释 runtime，但不会把这些诊断结果反写成新的 session 真相。

## 当前 summary 最少包含

- model request 次数
- model wait 总耗时
- tool call 次数
- tool 总耗时
- yields / continuations / recoveries / compressions
- externalized result count / bytes
- top tools
- slowest step
- usage availability
- session health
- durable truth 区块：
  - `runtimeStats.updatedAt`
  - `checkpoint.flow.phase`
  - `checkpoint.flow.lastTransition`
  - `verificationState.status`
- derived diagnostics 区块：
  - why continue / why recovery / why compression
  - why slow
  - flaky tool hotspot
  - prompt layer / hotspot / slimming 诊断

## durable truth vs derived diagnostics

### durable truth

- `SessionRecord.runtimeStats`
- `SessionRecord.checkpoint`
- `SessionRecord.verificationState`

### derived diagnostics

- runtime summary 文本
- why slow / why continue / why recovery / why compression 的诊断结论
- prompt layer chars / block counts / hotspots
- request-time context diagnostics（如 initial / final estimated chars）

derived diagnostics 必须来自既有真相源和当前 request 构建结果，
不能反过来变成新的持久化 truth。

## usage 规则

- 只有 provider 明确返回 usage 时才记录 usage
- 如果 provider 没返回 usage，summary 必须显示 `unavailable` 或 `partial`
- 不根据字符数、消息数、模型名去估算 token

## 健康状态

当前 summary 会给出：

- `healthy`
- `warning`
- `recovering`

它来自 checkpoint phase、verification state、recovery 事件等正式状态的推导视图，
不是另一份单独持久化的状态。

## 真实验证

当前真实 API 验证入口：

- `npm run verify:runtime-observability-api`

它至少要确认：

- `runtimeStats` 已写进 session
- reload session 后 `runtimeStats` 仍然存在
- 真实 model request 被统计
- 真实 tool call 被统计
- 用户可读的 runtime summary 路径可用
- lightweight context 与 checkpoint runtime 没被打坏
