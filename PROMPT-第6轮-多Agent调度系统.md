# 第 6 轮已完成归档：多 Agent 调度系统

这不是待开发提示词。

这是第 6 轮已经完成后的归档版本，供第 7 轮及之后的窗口直接引用。

## 第 6 轮已经完成并视为当前主干事实

### 1. 控制面正式真相源没有回退

以下事实已经成立，并且后续轮次不得回退：

1. 控制面正式真相源已经进入 SQLite，本地账本文件是 `.athlete/control-plane.sqlite`。
2. `TaskStore / TeamStore / ProtocolRequestStore / CoordinationPolicyStore / BackgroundJobStore / WorktreeStore` 已经切到账本。
3. 旧 JSON 真相源已经退出正式裁决。
4. `JSONL` 只保留为审计流 / 事件流：
   - `.athlete/team/messages.jsonl`
   - `.athlete/team/inbox/*.jsonl`
   - `.athlete/worktrees/events.jsonl`

### 2. 多 Agent 调度模型已经正式落地

当前主干已经不是“会派一点工”的半成品。

已经成立的调度事实：

1. `lead / subagent / teammate / background` 的路由规则已经集中到 orchestrator / control plane。
2. 调度已经覆盖 `split / dispatch / wait / merge` 四件事。
3. 复杂 objective 会被落成机器可识别的任务图，而不是只剩 prompt 记忆。
4. 必要时会生成正式 `merge` 节点，不允许只派出去、不合回来。
5. readiness、ownership、handoff legality、worktree legality 从正式真相源推导，不靠自由文本记住。
6. reload / continue / reconcile 后，调度器会从账本恢复“谁在做什么、接下来等什么、何时回到 merge”。

### 3. 任务图与恢复语义已经升级

以下行为已经是当前正确主干：

1. task graph 仍落在 `tasks + task_dependencies` 上，不新造平行 orchestration plane。
2. blocker 完成后，dependency edge 不再被粗暴删除；历史图边会保留，用于恢复和 merge 语义。
3. readiness 只看“未完成 blocker”，而不是简单看有没有历史依赖边。
4. background task 只要已有正式 `jobId`，route 就不能再次把同一 task 当成新的 background candidate。

### 4. 第 6 轮新增或强化的关键文档

以下文档已经更新并应视为当前规范：

1. `spec/architecture/总体架构.md`
2. `spec/architecture/状态与真相源.md`
3. `spec/implementation/模块级开发任务单.md`
4. `spec/testing/测试策略.md`
5. `spec/modules/multi-agent-scheduling.md`

### 5. 第 6 轮新增或强化的关键测试

以下测试已经证明当前调度主干成立：

1. `tests/control-plane-ledger.test.ts`
2. `tests/orchestrator-scheduling.test.ts`
3. `tests/orchestrator-dispatch.test.ts`
4. `tests/orchestrator-task-board.test.ts`
5. 以及相关 orchestrator / task board / team / background / worktree 回归测试

这些测试已经覆盖的重点包括：

1. 复杂任务会被拆成最小可恢复任务图。
2. lead 不会重复派发已经在跑的工作。
3. teammate 不会重复 claim 已被占用任务。
4. background child 完成后，主流程会推进到 merge / 下一步 lead work。
5. reload 后调度系统仍能恢复 wait / merge 现场。
6. 旧 JSON 残影不会回到正式裁决链路。

### 6. 第 6 轮已经通过的验证

以下验证已经通过：

```powershell
npm.cmd run check
npm.cmd test
```

## 后续轮次必须遵守的边界

### 不允许回退

后续轮次不允许做这些事：

1. 把正式裁决拉回 JSON / 双写 / prompt 记忆。
2. 删除或绕开第 6 轮的 `merge` 语义。
3. 重新允许 background / teammate / worktree 的旧错误路径并存裁决。
4. 把旧 prompt 型协调重新抬回主干。

### 可以继续向上建设，但要建立在第 6 轮之上

第 7 轮及之后可以继续做：

1. 产品工程
2. 核心与外壳分离
3. 对外壳、CLI、错误提示、配置处理、运行透明度的硬化
4. 更细的 closeout / observability / operator experience

但这些都必须建立在“第 6 轮调度器已经是正式主干”的前提上。

## 第 6 轮刻意没做的事

这些内容不是第 6 轮目标，不应误判为缺失：

1. 没重做第 5 轮 SQLite 账本迁移。
2. 没把 session / checkpoint / runtime stats 一起迁到 SQLite。
3. 没新增 UI、通道或新 agent 角色体系。
4. 没把产品工程、CLI 产品感、配置版本治理混进第 6 轮。

## 给下一窗口的使用方式

如果新窗口要继续开发，请把下面这句视为当前主干前提：

> 第 6 轮已完成；当前系统已经具备正式的多 Agent 调度器，后续工作必须建立在 SQLite 控制面和 `split / dispatch / wait / merge` 机器生命周期之上。
