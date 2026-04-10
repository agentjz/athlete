# 第 2 轮：运行时可观测性

这一轮默认建立在**第 1 轮已完成**的基础上。  
这一轮的目标不是做“漂亮仪表盘”，而是把 Athlete 做成**可被机器诊断、可被人类定位问题**的系统。

这是一项**一次性完整交付**任务。  
不要停在分析、半成品 summary、或只加几个计数器。  
必须把测试、实现、验证、最小 spec 同步一起做完。

## 执行前提

1. 把 Athlete 当成**快速演进的新项目**。
2. **不要为旧 session / 旧 JSON shape / 旧兼容路径投入实现成本。**
3. 如果发现某个旧测试、旧分支、旧约束是为了兼容历史形态而存在，而不是为了保护当前机器真相，应当删除或改写为保护**当前 truth source**。
4. 但不能借“新项目”之名破坏当前已成立的机器边界：
   - `SessionRecord`
   - `checkpoint`
   - `verificationState`
   - `runtimeStats`
   - `continuation / compact / closeout`

## 你的角色

你不是做展示层 polish 的人。  
你是一个强调第一性原理、系统边界、机器真相源、fail-closed 设计和宪法原则的高级架构师兼落地工程师。

你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

把 Athlete 的运行时可观测性做成真正有诊断价值的系统，让我们能够从机器数据直接回答下面这些问题，而不是靠猜：

- 为什么慢
- 为什么继续
- 为什么 recovery
- 为什么压缩
- prompt 哪一层在变胖
- 哪个 block 是 prompt hotspot
- 哪类工具最容易慢、最容易失败
- 当前 session 到底处于什么 runtime 状态
- 本轮 summary 到底是在报告 durable truth，还是 derived diagnostics

## 宪法原则

本轮必须显式遵守这些原则：

### P18 主循环和文件都不能长胖

- 不要把 `runTurn.ts`、`runtimeMetrics/state.ts`、`contextBuilder.ts`、`runtimeSummary.ts` 写胖。
- 超过 300 行先怀疑职责耦合，不要先堆代码。
- 一旦出现“同一文件里有两件以上主要事情”，优先拆子目录或拆子文件。

### P13 session 是任务现场

- session 是任务现场，不是展示缓存。
- 如果某个运行时事实需要跨 turn / reload 保持一致，它要么进入既有 session 真相源，要么根本不该被持久化。

### P06 上下文要能压缩

- prompt diagnostics 不能破坏 compact / continuation。
- context 诊断属于**即时派生**，不是新的长期记忆。

### 状态与真相源

- 不允许新建平行 JSON 真相源。
- 可持久化的 runtime 事实，只能扩在既有 `SessionRecord` / `runtimeStats` / `checkpoint` 上。
- 任何跨 turn 一致性都不能只放在 prompt 文案里。

## 核心原则

1. 可观测性必须来自真实运行时行为，而不是 prompt 提醒或文案解释。
2. runtime summary 必须从结构化机器数据推导，不允许再造一套人类文本真相。
3. prompt metrics 是**derived diagnostics**，不是 durable truth。
4. 如果现有 `SessionRecord` / `runtimeStats` / `checkpoint` 足够承载事实，就不要新造字段层级或新文件。
5. 不要做完整遥测平台，不要接外部 sink。
6. 不要堆零散日志，不要把“可观测性”做成 `console.log` 工程。
7. 不要为旧 session 兼容付出额外成本。

## 先做什么

### 第一步必须是：先写失败测试

不要先改实现。  
先把这一轮真正要保护的行为写成失败测试，再开始实现。

如果现有测试表达的是“兼容旧 session / 旧结构”，而不是保护当前 runtime truth：

- 删除它，或
- 改写成保护当前 truth source 的测试

但不要两者并存。

## 必须先读

先读这些，再动代码：

- `ROUND-1-KERNEL-HARDENING.md`
- `spec/modules/runtime-metrics.md`
- `spec/modules/lightweight-context-runtime.md`
- `spec/architecture/运行时循环.md`
- `spec/modules/runtime-rules.md`
- `spec/principles/P18-主循环和文件都不能长胖.md`
- `spec/principles/P13-session是任务现场.md`
- `spec/principles/P06-上下文要能压缩.md`
- `spec/architecture/状态与真相源.md`
- `src/agent/runtimeMetrics.ts`
- `src/agent/runtimeMetrics/state.ts`
- `src/agent/runtimeMetrics/summary.ts`
- `src/agent/runtimeTransition.ts`
- `src/agent/runtimeTransition/*`
- `src/agent/contextBuilder.ts`
- `src/agent/prompt/*`
- `src/ui/runtimeSummary.ts`
- `src/interaction/localCommands.ts`
- `tests/runtime-observability.test.ts`
- `tests/runtime-lightweight-context.test.ts`
- `tests/system-prompt-contract.test.ts`
- `tests/runtime-checkpoint-resume.test.ts`

## 本轮必须参考的本地 REF

这轮必须参考下面这些本地资料，但**只能吸收结构方式、诊断方式、性能观测方式**，不能照抄、不能让运行时依赖 `REF`：

- `C:\Users\Administrator\Desktop\athlete\REF\txt\顶级开发团队设计的Harness工程项目源码什么样.txt`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\context.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\cost-tracker.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\toolUseSummary\toolUseSummaryGenerator.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\tokenEstimation.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\constants\toolLimits.ts`

重点看：

- 工业级 harness 如何知道“自己哪里慢”
- prompt / token / tool / state transition 如何被观察
- 观测结构如何服务 runtime 决策，而不是做成表面 UI

## 本轮必须交付的东西

你必须完成下面这些：

1. 让 runtime summary 不只是显示次数，而是能明确解释关键控制流为什么发生。
2. 让 summary 能消费 round1 的结构化 runtime transition，而不是继续靠零散文案推断。
3. 扩展 prompt diagnostics，至少能看到：
   - static layer chars
   - dynamic layer chars
   - memory chars
   - static / dynamic / memory block counts
   - block 级别 hotspot
   - 总 prompt chars
4. 明确区分：
   - durable truth
   - derived diagnostics
5. 改善 `/runtime` / `/stats` / `/仪表盘` 输出，使其对真实调试有帮助，而不是只有几组计数。
6. 保持与 continuation / compact / checkpoint / verification 完全兼容。
7. 不为了旧 session 兼容而增加分支或代码。

## 你真正要做成什么样

这一轮完成后，系统至少要能机器化回答：

- 本 session 为什么看起来慢：
  - 是 model wait 慢
  - 还是 tool execution 慢
  - 还是 repeated recovery 多
  - 还是 prompt 膨胀触发 compression
- 本 session 为什么继续：
  - 是 tool batch continuation
  - 是 managed continuation
  - 是 verification blocked
  - 是 incomplete todos
  - 是 required skill missing
- prompt 为什么变胖：
  - 是 static layer 固定大
  - 是 dynamic runtime layer 在膨胀
  - 是 compressed memory 占比过高
  - 还是某个 block hotspot 太大
- 当前 summary 里哪些是 durable truth：
  - `runtimeStats`
  - `checkpoint.flow.lastTransition`
  - 当前 verification / checkpoint 状态
- 哪些只是当前请求时即时推导的 diagnostics：
  - prompt layer chars
  - block hotspot
  - prompt slimming 诊断结论

## 推荐实现方向

推荐这样收敛：

### durable truth

只有当它是跨 turn / reload 仍需要一致的运行时事实时，才允许进入持久化层：

- `SessionRecord.runtimeStats`
- `SessionRecord.checkpoint`

### derived diagnostics

以下优先保持即时派生，不要落盘：

- prompt layer metrics
- block hotspot
- prompt slimming 诊断
- summary 文本

### 模块边界

优先考虑这些区域：

- `src/agent/runtimeMetrics/*`
- `src/agent/contextBuilder.ts`
- `src/agent/prompt/*`
- `src/ui/runtimeSummary.ts`
- `src/interaction/localCommands.ts`

如需新增模块：

- 新增小模块可以
- 不要新增“大一统 observability 管理器”
- 不要把关键入口写胖

## 不要做的事

- 不要做完整遥测平台。
- 不要接外部 analytics / telemetry sink。
- 不要堆无结构日志。
- 不要把 prompt diagnostics 持久化成新的真相源。
- 不要新建平行 JSON。
- 不要为了“旧 session 可读”增加兼容逻辑。
- 不要把 summary 文本反过来当成机器判断依据。
- 不要做与本轮无关的 UI 美化工程。

## 必须先写的失败测试

至少先补下面这些失败测试，再开始实现：

1. runtime summary 能表达主要 transition cause，而不只是次数。
2. summary 能明确区分 durable truth 和 derived diagnostics。
3. prompt metrics 结构完整，且包含 static / dynamic / memory / hotspot。
4. prompt diagnostics 不进入 session 持久化真相源。
5. reload 后 runtimeStats 与 checkpoint transition 仍然正确。
6. prompt slimming 回归能被测试拦住。
7. `/runtime` 输出能回答“为什么继续 / 为什么 recovery / 为什么压缩”。

如果现有测试是为了保护旧 shape：

- 直接删掉，或
- 重写成保护当前 truth source

## 最低验收标准

你只有在下面全部满足时，才能认为本轮完成：

1. `runtime summary` 已能消费结构化 transition cause。
2. `prompt diagnostics` 能看出 layer 级别和 block 级别热点。
3. 没有新增平行真相源。
4. 没有为了旧 session 兼容新增代码。
5. `/runtime` 本地命令输出对真实调试有帮助，不是计数器清单。
6. continuation / compact / checkpoint / verification 没被打坏。
7. 文件职责仍然清晰，没有明显违反 P18。

## 必须执行的验证

严格按这个顺序执行：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - `runtime-observability`
   - `system-prompt-contract`
   - `runtime-lightweight-context`
   - `runtime-checkpoint-resume`
3. `npm.cmd run test:core`

如果这轮触及区域有失败，必须继续修到通过为止。

## 如果 spec 需要同步

只做最小必要同步：

- `spec/modules/runtime-metrics.md`
- `spec/modules/lightweight-context-runtime.md`
- `spec/implementation/目录结构到代码文件映射表.md`

如果文档里还在暗示“兼容旧 session / 旧结构”是目标，也要顺手去掉。

## 最终回复必须包含

最终只回答这些：

- 新增或加强了哪些 observability 能力
- 什么是 durable truth，什么只是 derived diagnostics
- runtime 现在能解释什么，之前解释不了什么
- 你删掉或改写了哪些旧的兼容/历史包袱
- 跑了哪些测试，结果如何
- 残余风险是什么
