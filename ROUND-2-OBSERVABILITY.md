# 第 2 轮：运行时可观测性

## 当前状态

状态：已完成  
结论：这一轮要求的运行时可观测性已经与当前仓库实现、spec、测试同步收口。

这一轮最终交付的不是“多几个数字”，而是一个可以区分 durable truth 和 derived diagnostics、并且能直接解释 runtime 控制流的诊断层。

## 已落地的核心结果

### 1. runtime summary 已经消费结构化 transition cause

当前代码：

- `src/agent/runtimeMetrics/summary.ts`
- `src/agent/runtimeMetrics/diagnostics.ts`

当前 summary 不再只显示次数，而是直接从以下机器真相推导：

- `runtimeStats`
- `checkpoint.flow.lastTransition`
- `verificationState`

它现在可以回答：

- 为什么继续
- 为什么 recovery
- 为什么压缩
- 为什么慢

### 2. durable truth 与 derived diagnostics 已经明确分层

当前 durable truth：

- `SessionRecord.runtimeStats`
- `SessionRecord.checkpoint`
- `SessionRecord.verificationState`

当前 derived diagnostics：

- runtime summary 文本
- `whyContinue / whyRecovery / whyCompression / whySlow`
- prompt layer chars / block counts
- prompt hotspot
- prompt slimming 诊断
- request-time context diagnostics

这些 derived diagnostics 只在命令执行或 request 构建时即时派生，不会回写进 session JSON。

### 3. prompt diagnostics 已经补到 layer 级和 block 级

当前代码：

- `src/agent/prompt/metrics.ts`
- `src/agent/prompt/requestDiagnostics.ts`
- `src/agent/contextBuilder.ts`

当前可见指标包括：

- `staticChars`
- `dynamicChars`
- `memoryChars`
- `staticBlockCount`
- `dynamicBlockCount`
- `memoryBlockCount`
- `totalChars`
- `hotspots`
- `initialEstimatedChars`
- `finalEstimatedChars`
- `maxContextChars`
- `summaryChars`
- `compactedTail`

### 4. `/runtime` / `/stats` / `/仪表盘` 已经变成有诊断价值的输出

当前代码：

- `src/ui/runtimeSummaryData.ts`
- `src/ui/runtimeSummary.ts`
- `src/ui/runtimeSummaryFormat.ts`
- `src/interaction/localCommands.ts`

当前输出已经显式分为两段：

- `Durable truth`
- `Derived diagnostics`

并且能直接展示：

- 当前 checkpoint / verification 状态
- last transition reason code
- why continue
- why recovery
- why compression
- why slow
- prompt layers
- prompt hotspot
- flaky tool hotspot

### 5. round2 风险已经收口

本轮要求的关键风险点已经关闭：

- 没有新增平行真相源
- prompt diagnostics 没有持久化回 session
- continuation / compact / checkpoint / verification 回归通过
- `src/ui/runtimeSummary.ts` 超出 P18 行数预算的问题已经拆分修复

## 当前关键文件

本轮最终落点主要在：

- `src/agent/runtimeMetrics.ts`
- `src/agent/runtimeMetrics/state.ts`
- `src/agent/runtimeMetrics/summary.ts`
- `src/agent/runtimeMetrics/diagnostics.ts`
- `src/agent/prompt/metrics.ts`
- `src/agent/prompt/requestDiagnostics.ts`
- `src/agent/contextBuilder.ts`
- `src/ui/runtimeSummary.ts`
- `src/ui/runtimeSummaryFormat.ts`
- `src/ui/runtimeSummaryData.ts`
- `src/interaction/localCommands.ts`

## 当前验证状态

本轮要求的验证已经按顺序跑完并通过：

1. `npm.cmd run test:build`
2. targeted tests
   - `runtime-observability`
   - `system-prompt-contract`
   - `runtime-lightweight-context`
   - `runtime-checkpoint-resume`
3. `npm.cmd run test:core`

当前相关关键测试包括：

- `tests/runtime-observability.test.ts`
- `tests/runtime-lightweight-context.test.ts`
- `tests/system-prompt-contract.test.ts`
- `tests/runtime-checkpoint-resume.test.ts`
- `tests/structure-slimming.test.ts`

## 当前结论

round2 现在已经完成，并且不是“功能上差不多完成”，而是：

- 机器真相源明确
- summary 可解释
- prompt diagnostics 可观察
- 风险点已收口
- 测试与 spec 已同步

后续轮次如果继续演进工具或 orchestrator，必须保持这一轮建立的边界：

- runtime facts 进入既有 truth source
- prompt diagnostics 保持 derived
- `/runtime` 继续只读 truth source + 即时派生诊断
