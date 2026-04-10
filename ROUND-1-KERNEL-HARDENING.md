# 第 1 轮：内核硬化

这一轮**不是天然并行安全**的。  
请在最新主线基础上执行。如果你打算和其他轮次并行推进，务必使用独立分支或独立 worktree。

## 你的角色

你不是功能实现者，而是一个冷静、抽象能力强、强调系统边界与机器真相源的高级架构师兼落地工程师。  
你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

把 Athlete 的核心运行时决策做成**机器显式、fail-closed、可追踪**的系统，而不是很多隐含逻辑的拼接。

这轮要让系统自己清楚知道：

- 为什么继续跑
- 为什么 yield
- 为什么 retry / recovery
- 为什么 pause
- 为什么可以 finalize
- 为什么不能 finalize

目标不是做一层“解释性文案”，而是真正把运行时决策模型做硬。

## 核心原则

1. prompt 只承载高层 operating contract，不承载运行时真相。
2. 跨 turn 的一致性必须继续放在 session、checkpoint、verification、guards、store 等机器层。
3. 不允许新建平行 JSON 真相源。
4. 不要做一个只是给人看的“日志系统”，而是真正的 runtime 决策结构。
5. 不要做无关重构。

## 必须先读

先读这些，再动代码：

- `spec/architecture/运行时循环.md`
- `spec/modules/runtime-rules.md`
- `spec/modules/session-resume-compact.md`
- `spec/modules/lightweight-context-runtime.md`
- `spec/architecture/状态与真相源.md`
- `src/agent/runTurn.ts`
- `src/agent/finalize.ts`
- `src/agent/closeout.ts`
- `src/agent/toollessTurn.ts`
- `src/agent/retryPolicy.ts`
- `src/agent/turnPersistence.ts`
- `src/agent/checkpoint/state.ts`
- `src/agent/verificationState.ts`
- 所有与 closeout / runtime / checkpoint / verification 相关测试

## 本轮必须参考的本地 REF

这轮必须参考下面这些本地资料，但**只能提炼结构、分层方式、fail-closed 思想、状态机组织方式**，不能照抄原文，也不能让运行时依赖 `REF` 目录：

- `C:\Users\Administrator\Desktop\athlete\REF\txt\顶级开发团队设计的Harness工程项目源码什么样.txt`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\QueryEngine.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\query.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\query\config.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\query\deps.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\query\stopHooks.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\constants\prompts.ts`

重点看：

- 顶级 harness 如何表达 continue / retry / recovery / stop
- 核心 loop 如何减少隐含分支
- “为什么继续下一轮”如何变成机器可判定的 transition
- 如何避免把关键控制逻辑留在 prompt 文案里

## 必须交付的东西

你必须完成下面这些：

1. 引入统一的**运行时转移模型**，能表达 turn 的关键结果和关键继续原因。
2. 把以下决策收敛成更统一的机器逻辑：
   - continue
   - recover / retry
   - yield
   - pause for user
   - finalize
3. 移除现在散落在多个模块里的部分重复、部分重叠、部分隐含的决策逻辑。
4. 确保重构后仍兼容：
   - checkpoint
   - compact
   - verification
   - skill loading
   - closeout gating
5. 让系统能暴露清晰的 reason code 或结构化 reason，而不是只有零散字符串。

## 推荐实现方式

推荐方向：

- 新增一个小而明确的 runtime transition 模块，不要继续把 `runTurn.ts` 写胖。
- 尽量用 typed reason code / discriminated union，不要到处拼字符串。
- 除非测试证明旧行为是错的，否则尽量保持外部行为稳定。
- 如果需要给用户展示文本，请从结构化 reason 推导，而不是反过来让文本成为真相。

优先考虑这些区域：

- `src/agent/runTurn.ts`
- `src/agent/finalize.ts`
- `src/agent/toollessTurn.ts`
- `src/agent/closeout.ts`
- `src/agent/turnPersistence.ts`
- `src/agent/checkpoint/*`
- `src/agent/` 下新增的小模块

## 不要做的事

- 不要引入巨大的抽象层。
- 不要重写整个 agent loop。
- 不要把运行时真相重新塞进 prompt。
- 不要加“聪明但不可测”的启发式魔法。
- 不要做只有展示价值、没有真实约束价值的日志系统。

## 必须补的测试

至少覆盖这些：

1. finalize 和 continue 的原因在机器层面可区分
2. retry / recovery 的原因在机器层面可区分
3. continuation 能保留正确的 runtime reason
4. verification 阻止 finalize 时，能给出正确的结构化原因
5. closeout gating 在重构后仍然正确

## 必须执行的验证

按这个顺序跑：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - runtime
   - closeout
   - finalize
   - checkpoint
   - verification
3. `npm.cmd run test:core`

如果这轮改动触及的区域有失败，必须继续修到通过为止。

## 如果 spec 需要同步

如果运行时决策契约发生了真实变化，只做最小必要同步：

- `spec/architecture/运行时循环.md`
- `spec/modules/runtime-rules.md`
- `spec/modules/session-resume-compact.md`
- `spec/implementation/目录结构到代码文件映射表.md`

## 最终回复必须包含

只回答这些：

- 实际改了什么
- 现在的 runtime 决策模型是什么
- 去掉了哪些旧的歧义和双写逻辑
- 跑了哪些测试，结果如何
- 残余风险是什么
