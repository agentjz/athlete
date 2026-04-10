# 第 4 轮：任务编排成熟化

## 当前状态

状态：已完成

结论：这一轮要求的任务编排成熟化已经落到当前仓库实现、spec 和测试里，交付的不是“更长的 orchestrator prompt”，而是一个真正由控制面真相驱动、可恢复、可解释、缺状态时会 fail-closed 的任务编排层。

这一轮完成后，Athlete 不再只靠：

- `task.status`
- 零散的 `owner / assignee`
- prompt 里的调度提醒
- route / dispatch 里的局部 heuristics

来猜一个任务现在是不是该跑、该谁跑、能不能派工。

相反，系统现在会先从既有真相源派生一个 machine lifecycle snapshot，再让 route / dispatch / claim / recovery 等路径消费它。

## 已落地的核心结果

### 1. 统一的 orchestration lifecycle 模型已经存在

当前代码：

- `src/orchestrator/taskLifecycle.ts`
- `src/orchestrator/taskLifecycleShared.ts`
- `src/orchestrator/types.ts`

当前模型不新建平行 JSON，而是从既有控制面真相派生：

- `TaskStore`
- `TeamStore`
- `BackgroundJobStore`
- `WorktreeStore`
- orchestrator task metadata

每个 orchestrated task 现在都可以被机器化描述为：

- `stage`: `blocked | ready | active | completed`
- `runnableBy`: `lead | teammate | none`
- `owner`
- `handoff`
- `worktree`
- `reasonCode`
- `reason`
- `illegal`

也就是说，系统现在能直接回答：

- 为什么这个任务是 ready
- 为什么它仍然 blocked
- 为什么它归 lead / teammate / background
- 为什么它现在不能继续派工

### 2. lead-ready 不再是软启发式，而是 lifecycle 派生结果

当前代码：

- `src/orchestrator/progress.ts`
- `src/orchestrator/route.ts`

当前行为已经做到：

- `loadOrchestratorProgress` 先派生 lifecycle，再给 lead 可消费的 `readyTasks`
- lead-ready 现在严格要求 `stage === "ready"` 且 `runnableBy.kind === "lead"`
- 预留给 teammate 的任务，不再继续出现在 lead-ready 里
- 已有 background handoff 的任务，不再被 lead 当成普通 ready task 重复推进
- 缺失或冲突的 handoff 会直接标记为 `illegal`

这意味着 route 不再只是“看起来像 ready 就继续派”，而是消费统一 lifecycle。

### 3. ownership / handoff 开始被真实执行层消费

当前代码：

- `src/orchestrator/dispatch.ts`
- `src/tools/tasks/claimTaskTool.ts`
- `src/worktrees/store.ts`

当前行为已经做到：

- subagent / teammate / background dispatch 前会先检查 lifecycle legality
- 非法 handoff 不再 best-effort，直接阻断
- duplicate background dispatch 会被挡住
- `claim_task` 现在必须拿到真实 worktree，否则回滚 claim
- teammate 拿到任务后的 worktree 绑定继续来自真实 store，而不是 prompt 约定

也就是说，ownership 和 handoff 已经不只是展示文案，而是执行前置条件。

### 4. continuation / recovery 后的 orchestration reality 更稳定

当前代码：

- `src/orchestrator/prepareLeadTurn.ts`
- `src/orchestrator/progress.ts`
- `src/agent/managedTurn.ts`

当前行为已经做到：

- continuation 后重新读取 durable truth，再派生 task lifecycle
- 已在运行的 background job 不会在 continuation/reload 后被静默重复创建
- lead orchestration 仍然挂在 `prepareLeadTurn -> runManagedAgentTurn -> runTurn` 的既有路径上
- 没有新增 session 平行 orchestration JSON

这保证了 recovery / continuation 不需要靠 prompt 记住完整任务图。

### 5. prompt 仍然保持 principle-level

当前代码：

- `src/agent/prompt/static.ts`
- `tests/system-prompt-contract.test.ts`

当前 prompt 仍然只保留高层原则，例如：

- 使用 task board / coordination policy / background / worktrees
- 依据 machine truth 协调长任务
- lead 负责协调，worker 负责执行

当前 prompt 没有回退成：

- `delegate_subagent / delegate_teammate / run_in_background` 的调度表
- readiness / handoff reason code 列表
- 完整任务生命周期手册

## 当前变强的 fail-closed 行为

这一轮收口的关键 fail-closed 点包括：

### 1. background handoff 缺状态时阻断

如果 orchestrator task metadata 里指向一个不存在的 `jobId`：

- task lifecycle 会变成 `blocked`
- `illegal = true`
- lead-ready 过滤会把它挡掉
- dispatch 不会继续默许推进

### 2. teammate handoff 缺状态时阻断

如果任务保留了 teammate reservation / ownership，但：

- teammate 不存在
- teammate 已 shutdown
- teammate ownership 与 assignment 冲突

系统会把它视为控制面冲突，而不是继续当成可运行任务。

### 3. worktree 失效时阻断

如果任务仍绑定 worktree，但 worktree 已 removed / 缺失：

- lifecycle 会进入 blocked / illegal
- teammate active 状态不会继续被默许
- `claim_task` 现在在创建 worktree 失败时会回滚 claim，而不是留下半绑定状态

### 4. duplicate background dispatch 被阻断

如果 validation/background work 已经有真实 running job：

- continuation / reload 后不会再次 silently spawn 第二个 job

## 这一轮删掉或改写的 ad hoc / 历史包袱

### 1. 删掉了旧的 ready heuristic 中心

旧逻辑的核心是：

- 不是 completed
- `blockedBy.length === 0`
- `owner` 为空或是 lead

这不足以表达：

- teammate reservation
- background handoff
- 缺失 job
- 缺失 worktree
- ownership 冲突

现在这一层被 lifecycle 派生替代。

### 2. 改掉了 `claim_task` 的 best-effort 旁路

旧行为里，claim 后即使 worktree 没建出来，也可能继续留下 task 已 claim 的状态。

现在：

- 没有 worktree 就直接报错
- 并把 task 回滚到 `pending`
- 不允许留下半绑定任务

### 3. 收紧了 dispatch 的宽松行为

旧 dispatch 更接近“给了 decision 就尽量执行”。

现在 dispatch 会先检查：

- task 是否真的 ready
- runnableBy 是否真的是 lead
- handoff 是否非法
- background handoff 是否已存在

### 4. 没有新增平行 orchestrator 真相源

这一轮没有新增：

- `.athlete/orchestrator/*.json`
- 第二套 orchestration registry
- prompt-only 调度状态

新增长的只是派生模块，不是新的 durable truth source。

## 当前 truth source 边界

这一轮完成后，orchestration 相关 durable truth 仍然主要落在：

- `TaskStore`
- `TeamStore`
- `ProtocolRequestStore`
- `CoordinationPolicyStore`
- `BackgroundJobStore`
- `WorktreeStore`
- `SessionRecord.checkpoint`

task lifecycle 本身是机器派生层，不是额外落盘的新真相源。

## 当前关键文件

本轮最终落点主要在：

- `src/orchestrator/taskLifecycle.ts`
- `src/orchestrator/taskLifecycleShared.ts`
- `src/orchestrator/progress.ts`
- `src/orchestrator/route.ts`
- `src/orchestrator/dispatch.ts`
- `src/orchestrator/types.ts`
- `src/tools/tasks/claimTaskTool.ts`

最小 spec 同步在：

- `spec/architecture/总体架构.md`
- `spec/architecture/状态与真相源.md`
- `spec/architecture/运行时循环.md`
- `spec/overview/产品定义.md`
- `spec/overview/v0范围.md`
- `spec/modules/task-state.md`
- `spec/implementation/目录结构到代码文件映射表.md`

## 当前测试与验证状态

本轮按要求执行并通过：

1. `npm.cmd run test:build`
2. targeted tests
   - `orchestrator-routing`
   - `orchestrator-dispatch`
   - `orchestrator-task-board`
   - `orchestrator-truth-sources`
   - `orchestrator-managed-turn`
   - `task-and-background`
   - `worktree-isolation`
   - `protocol-and-runtime`
   - `managed-turn`
   - `system-prompt-contract`
   - `structure-slimming`
3. `npm.cmd run test:core`

本轮新增并保护的关键 round4 测试包括：

- `tests/orchestrator-task-board.test.ts`
  - teammate-reserved task 不再进入 lead-ready
  - missing background job 会 fail-closed
- `tests/orchestrator-dispatch.test.ts`
  - continuation/reload 后不会重复启动 background job
- `tests/worktree-isolation.test.ts`
  - claim_task 在缺 worktree 时回滚，不留下半状态
- `tests/system-prompt-contract.test.ts`
  - prompt 仍保持 principle-level
- `tests/structure-slimming.test.ts`
  - orchestrator 核心文件继续受 P18 预算约束

当前完整核心测试结果：

- `npm.cmd run test:core` 通过
- 213 个测试中 212 个通过
- 1 个既有 skip
- 0 失败

## 残余风险

这一轮已经收口，但当前仍有几点残余风险需要记住：

1. lifecycle reason 目前主要服务机器决策和 targeted tests，面向人的任务板摘要还没有完整展示全部 reason code。
2. `src/tasks/store.ts` 和 `src/worktrees/store.ts` 仍偏大，这一轮避免继续写胖，但没有彻底拆瘦。
3. subagent 仍然是短生命周期 handoff，不是持久 actor；这不是 round4 的缺口，而是当前范围边界。

## 当前结论

round4 现在已经完成，而且不是“先写了一版调度规则文档”式完成，而是：

- lifecycle 机器化
- ownership / handoff 被执行层消费
- background / teammate / worktree 联动更硬
- continuation / recovery 下 orchestration truth 更稳
- 缺状态或冲突时默认 fail-closed
- prompt 仍保持 principle-level
- 没有新增平行真相源
- P18 没有被明显破坏

后续如果还要继续演进 orchestrator，必须把 round4 视为既成的机器边界，而不是再退回 prompt-ish 调度描述。
