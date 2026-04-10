# 第 4 轮：任务编排成熟化

下面这份文本不是“阶段总结”，而是给**新开对话**直接使用的强约束任务提示词。  
目标是让新的对话窗口一次性完整完成 round4，不留尾巴，不停在分析，不把控制面风险留到下一轮。

---

# 第 4 轮：任务编排成熟化

这一轮默认建立在**第 1 轮到第 3 轮都已完成**的基础上。  
round1 已经把 runtime transition 做成机器显式。  
round2 已经把 runtime observability 做成 durable truth + derived diagnostics。  
round3 已经把 tool plane 做成统一治理、fail-closed、machine-consumable 的执行平面。

这一轮不是“再加几个 orchestrator feature”，也不是“把 swarm 玩得更花”。  
这一轮的唯一目标，是把 Athlete 的控制面做成**真正成熟、可恢复、可解释、不会 silently 漏状态**的任务编排系统。

这是一项**一次性完整交付**任务。  
不要停在分析、方案、半成品 patch、或只补几条 routing heuristic。  
必须把失败测试、实现、验证、最小 spec 同步一起做完。

## 执行前提

1. 把 Athlete 当成**快速演进的新项目**。
2. **不要为旧的含糊 lifecycle、旧的旁路 handoff、旧的偶然行为投入兼容成本。**
3. 如果某个旧测试只是保护历史偶然性，而不是保护当前机器真相，应当删除或改写。
4. 但不能借“新项目”之名破坏当前已成立的机器边界：
   - `SessionRecord`
   - `checkpoint`
   - `verificationState`
   - `runtimeStats`
   - 已完成的 tool governance
   - continuation / compact / closeout
   - 现有 task / team / background / worktree store

## 你的角色

你不是做 swarm demo 的人。  
你是一个强调控制面真相、系统边界、恢复能力、状态转移、上下文隔离、机器可解释性的高级架构师兼落地工程师。

你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

把 Athlete 的任务编排系统升级成真正受治理的工业级控制面，让系统自己知道：

- 一个任务现在处于什么生命周期阶段
- 为什么它是 ready / blocked / in_progress / completed
- 归属是谁，谁能接，谁不能接
- 什么时候应该 lead 自己做，什么时候应该派 teammate / subagent / background
- worktree 与 task 的绑定关系何时生效、何时解除、何时完成
- background job 与 task / protocol / lead 之间如何对齐
- interruption / yield / recovery 之后，为什么 orchestration reality 仍然一致
- 如果控制面事实缺失或矛盾，系统为什么会 fail-closed，而不是继续默许推进

重点是：

- agent 更稳，是因为控制面更硬
- 不是因为 prompt 更长
- 不是因为又写了一份调度说明书

## 宪法原则

### P18 主循环和文件都不能长胖

- 不要把 `managedTurn.ts`、`runTurn.ts`、`prepareLeadTurn.ts`、`dispatch.ts`、`route.ts` 写胖。
- 超过 300 行先怀疑职责耦合，不要先堆代码。
- 只要出现“一个文件里有两件以上主要事情”，优先拆小模块。

### P13 session 是任务现场

- orchestration 不能新增 session 平行真相源。
- 如果某个编排事实要跨 turn 一致，只能扩在既有 truth source 或现有记录结构里，不能额外造 JSON。

### P06 上下文要能压缩

- 调度真相不能靠 prompt 维护完整任务图。
- lifecycle、ownership、readiness、handoff 必须由机器逻辑驱动，不能破坏 compact / continuation。

### P07 任务图要落盘

- 任务编排不是“本轮脑内计划”。
- 任务图、依赖、归属、handoff 需要落在既有 task / team / background / worktree 真相源里。

### P12 工作区和任务要隔离

- worktree 不是装饰物，必须继续作为隔离执行单元。
- 不允许用 prompt 约定代替 worktree / task 的真实绑定。

### 状态与真相源

- 不允许新建平行 orchestrator 真相源 JSON。
- orchestration truth 优先落在：
  - `TaskStore`
  - `TeamStore`
  - `ProtocolRequestStore`
  - `CoordinationPolicyStore`
  - `BackgroundJobStore`
  - `WorktreeStore`
  - `SessionRecord.checkpoint`
- 任何跨 turn 一致性都不能只放在 prompt 文案里。

## 核心原则

1. 编排政策属于机器层，不属于 prompt 叙述。
2. prompt 只能保留高层原则，不能继续膨胀成完整调度表。
3. lifecycle、ownership、readiness、handoff 应该驱动 route / dispatch / reconcile / recovery 等机器决策。
4. fail-closed 比 best-effort 更重要。
5. 不要推翻现有 orchestrator / task / team / background / worktree 框架，优先增强既有控制面。
6. 不要做第二套 task system，不要发明平行 orchestration plane。
7. 现有 continuation / checkpoint / verification / closeout / tool governance 都必须保住。

## 第一步必须先做什么

### 第一步必须是：先写失败测试

不要先改实现。  
先把这一轮真正要保护的任务编排行为写成失败测试，再开始实现。

如果现有测试表达的是“维持旧排序 / 旧偶然行为 / 旧旁路 handoff”，而不是保护当前 machine truth：

- 删除它，或
- 改写成保护当前 truth source 的测试

但不要两者并存。

## 必须先读

先读这些，再动代码：

- `ROUND-1-KERNEL-HARDENING.md`
- `ROUND-2-OBSERVABILITY.md`
- `ROUND-3-TOOL-GOVERNANCE.md`
- `spec/architecture/总体架构.md`
- `spec/architecture/状态与真相源.md`
- `spec/architecture/运行时循环.md`
- `spec/overview/产品定义.md`
- `spec/overview/v0范围.md`
- `spec/principles/P18-主循环和文件都不能长胖.md`
- `spec/principles/P13-session是任务现场.md`
- `spec/principles/P12-工作区和任务要隔离.md`
- `spec/principles/P07-任务图要落盘.md`
- `spec/principles/P06-上下文要能压缩.md`
- `src/tasks/types.ts`
- `src/tasks/store.ts`
- `src/team/types.ts`
- `src/team/store.ts`
- `src/team/policyStore.ts`
- `src/team/requestStore.ts`
- `src/team/messageBus.ts`
- `src/team/worker.ts`
- `src/background/types.ts`
- `src/background/store.ts`
- `src/background/reconcile.ts`
- `src/background/spawn.ts`
- `src/worktrees/types.ts`
- `src/worktrees/store.ts`
- `src/orchestrator/analyze.ts`
- `src/orchestrator/taskPlanning.ts`
- `src/orchestrator/route.ts`
- `src/orchestrator/dispatch.ts`
- `src/orchestrator/progress.ts`
- `src/orchestrator/prepareLeadTurn.ts`
- `src/orchestrator/metadata.ts`
- `src/orchestrator/types.ts`
- `src/agent/managedTurn.ts`
- `src/agent/runTurn.ts`
- `src/agent/runtimeState.ts`
- 所有与 orchestrator / teammate / background / worktree / task lifecycle 相关测试

## 本轮必须参考的本地 REF

这轮必须参考下面这些本地资料，但**只能提炼控制面、任务系统、多 agent 编排、上下文隔离与协调方式**，不能照抄实现，也不能把 Athlete 做成另一个项目的翻版：

- `C:\Users\Administrator\Desktop\athlete\REF\txt\顶级开发团队设计的Harness工程项目源码什么样.txt`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\coordinator\coordinatorMode.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\tasks.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\Task.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\assistant\sessionHistory.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\AgentSummary\agentSummary.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\remote\RemoteSessionManager.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\remote\sdkMessageAdapter.ts`

重点看：

- 顶级 harness 如何做控制面 / 数据面分离
- 任务归属、切换、隔离、恢复如何组织
- 多 agent 协作时如何避免上下文污染
- 编排层如何协调，而不是自己下场做所有事

## 你真正要做成什么样

这一轮完成后，系统至少要能机器化回答：

- 为什么某个任务现在 ready
- 为什么某个任务仍然 blocked
- 为什么这个任务归 lead / teammate / background / subagent
- 为什么这个 handoff 现在合法
- 为什么这个 worktree 仍然绑定这个任务
- 为什么 interruption / recovery 之后没有丢 orchestration truth
- 如果状态缺失或冲突，系统为什么会阻断而不是继续默许推进

## 推荐实现方向

优先按下面方向收敛：

### 1. 先把任务生命周期做硬

优先收敛或强化：

- readiness
- ownership
- assignment
- dependency satisfaction
- blocked / runnable / active / terminal 的机器边界

不要只加更多 heuristics。  
先让状态转移更明确，再增加行为。

### 2. ownership / handoff 必须被真实执行层消费

ownership 不能只是展示文案。  
至少要让它被下面这些机器决策真实消费：

- route
- dispatch
- teammate claim / worker pickup
- background handoff
- worktree bind / unbind
- recovery / reconciliation
- fail-closed blocking

### 3. 收紧现有控制面之间的协同

重点收敛这些已存在但仍偏散的逻辑：

- task readiness / dependency transition
- task 与 worktree 的真实生命周期联动
- teammate 与 background 的 handoff 语义
- orchestrator progress / reconcile
- continuation / yield / recovery 的 orchestration reality 保持

要求：

- 不破坏现有外部行为
- 但尽量减少“这个文件里手写一点、那个文件里再写一点”的 ad hoc 规则

### 4. prompt 保持 principle-level

不要把任务编排重新写回 prompt。  
这一轮结束后，prompt 仍然只能保留高层原则，例如：

- 遵循 task board / ownership / worktree binding
- lead 负责协调，worker 负责执行
- 依据 machine truth 做 delegation / recovery

不能退回成完整的调度说明书。

## 优先考虑的代码区域

- `src/tasks/types.ts`
- `src/tasks/store.ts`
- `src/team/*`
- `src/background/*`
- `src/worktrees/store.ts`
- `src/orchestrator/*`
- `src/agent/managedTurn.ts`
- `src/agent/runtimeState.ts`

如需新增模块：

- 可以新增小模块
- 不要新增“大一统 orchestrator 管理器”
- 不要新增第二套 task / orchestration registry

## 不要做的事

- 不要做一个庞大的 swarm 框架。
- 不要添加系统根本管不住的新角色。
- 不要把调度真相塞进 prompt、runtime summary、或新的临时 JSON。
- 不要把 lead/orchestrator 重新做成“自己下场做所有实现”的执行者。
- 不要做无关 UX 工程。
- 不要顺手回退 round3 已成立的 tool governance 边界。

## 必须先写的失败测试

至少先补下面这些失败测试，再开始实现：

1. task readiness / ownership / dependency transition 是 machine-enforced 的，而不是软启发式。
2. task 与 worktree 的生命周期联动来自真实 store 状态，而不是 prompt 约定。
3. teammate 与 background 的 handoff 经过统一控制面，而不是各走各的旁路。
4. recovery / continuation / yield 后，orchestration truth 仍然一致。
5. lead path 的 orchestration 没继续写胖主循环。
6. prompt 仍然保持 principle-level，不重新膨胀成调度说明书。
7. 不新增平行 orchestrator 真相源。

如果现有测试是为了保护旧 shape、旧偶然行为、旧旁路 handoff：

- 直接删掉，或
- 重写成保护当前 truth source

## 最低验收标准

你只有在下面全部满足时，才能认为本轮完成：

1. lifecycle / readiness / ownership 至少有两类以上机器决策真正开始消费。
2. task / teammate / background / worktree 的联动边界更明确，没有继续依赖 prompt 记忆。
3. continuation / recovery / checkpoint 没被打坏，并且 orchestration truth 更稳定。
4. 状态缺失、冲突或非法 handoff 时，行为是 fail-closed，不是默许推进。
5. prompt 仍然只保留 principle-level，不回退成调度手册。
6. 没有新增平行真相源。
7. 文件职责仍然清晰，没有明显违反 P18。

## 必须执行的验证

严格按这个顺序执行：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - `orchestrator-routing`
   - `orchestrator-dispatch`
   - `orchestrator-task-board`
   - `orchestrator-truth-sources`
   - `orchestrator-managed-turn`
   - `task-and-background`
   - `worktree-isolation`
   - `protocol-and-runtime`
   - `managed-turn`
   - 任何新增的 orchestration targeted tests
3. `npm.cmd run test:core`

如果这轮触及区域有失败，必须继续修到通过为止。

## 如果 spec 需要同步

只做最小必要同步：

- `spec/architecture/总体架构.md`
- `spec/architecture/状态与真相源.md`
- `spec/architecture/运行时循环.md`
- `spec/overview/产品定义.md`
- `spec/overview/v0范围.md`
- `spec/modules/task-state.md`
- `spec/implementation/目录结构到代码文件映射表.md`

如果文档里还在把调度写成 prompt-ish 描述，也要顺手收敛成机器策略导向。

## 最终回复必须包含

最终只回答这些：

- 现在的 orchestration lifecycle 模型是什么
- 哪些控制面规则从 prompt-ish 逻辑下沉到了机器逻辑
- 哪些 fail-closed 行为变强了
- 你删掉或改写了哪些旧的 ad hoc / 历史包袱
- 跑了哪些测试，结果如何
- 残余风险是什么

---

这是一项**完整交付任务**。  
不要留下一句“后续可以继续细化 lifecycle”就结束。  
如果你发现风险点没有收口，那就继续做，直到收口为止。
