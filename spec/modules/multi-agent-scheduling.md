# multi-agent scheduling

## 目标

把 `lead / subagent / teammate / background` 这四类执行者，收口成一个明确、可恢复、可验证的正式调度系统。

本模块不解决“怎么写代码”。

本模块只解决：

- 什么时候拆任务
- 拆成什么图
- 谁来做
- 什么时候必须等
- 子结果回来后怎么合
- reload / continue 后怎么恢复现场

## 正式真相源

多 Agent 调度不新建平行 JSON。

正式事实仍来自 SQLite 账本里的：

1. `tasks`
2. `task_dependencies`
3. `team_members`
4. `protocol_requests`
5. `background_jobs`
6. `worktrees`

其中：

- 调度持久化事实
  - task record 本体
  - task dependency graph
  - orchestrated task 的 scheduler metadata
  - teammate / background / worktree / protocol 的正式状态
- 调度派生事实
  - readiness
  - owner legality
  - handoff legality
  - wait reason
  - merge readiness
  - 当前应该 dispatch 给谁

## 调度最小单位

调度器操作的是“一个 executor 负责的一段工作”，不是一整段自由文本目标。

每个 orchestrated task 必须至少回答 4 个问题：

1. 这是哪个 objective 的一部分
2. 它属于什么 kind
3. 它预期由谁执行
4. 它要等什么才能开始

## task kind

当前最小 kind：

1. `survey`
   - 获取实现前必须知道的事实
   - 默认适合 `subagent` 或 `lead`
2. `implementation`
   - 真正的改动工作
   - 可由 `lead` 或 `teammate` 执行
3. `validation`
   - 运行验证、构建、测试、探活等
   - 可由 `lead` 或 `background` 执行
4. `merge`
   - 子任务完成后的 lead 合流点
   - 负责汇总结果、继续推进或收口

`merge` 不是新角色，也不是新 prompt。

它是正式 task graph 里的 lead join 节点。

## executor 路由规则

### lead

lead 自己做：

- 简单任务
- 最终集成
- merge / join
- 失败后的重新裁决
- 需要直接使用当前主上下文的工作

lead 不做：

- 已明确切成 teammate lane 的实现细活
- 已明确切成 background lane 的慢命令等待
- 已明确切成 subagent lane 的窄范围调查

### subagent

subagent 适合：

- 窄范围探索
- 只读调查
- 短时同步 child work

subagent 不适合：

- 长时间等待
- 跨 turn 持续 ownership
- 长期 team coordination

subagent 是同步 child executor：

- dispatch 时由 lead 发起
- 返回结果后立刻让 task 完成或推进下一节点
- 不占用长期 teammate / background 恢复槽位

### teammate

teammate 适合：

- 中长时实现工作
- 并行改动
- 需要独立 worktree 的执行 lane

teammate lane 的机器要求：

1. task 对该 teammate 合法保留或已被其 claim
2. owner / assignee 不冲突
3. 需要并行改动时必须有有效 worktree
4. teammate 失活后必须通过 reconcile 回到账本事实，再决定是否重派

### background

background 适合：

- 慢命令
- 可异步等待的验证
- 不需要主循环一直占着的 shell 工作

background lane 的机器要求：

1. 必须存在正式 background job record
2. job 的状态机必须持久化
3. 成功完成后只能推进绑定 task 或其后续 merge，不允许靠消息文本直接收口

## split 规则

### 简单目标

如果 objective 足够简单，且不需要：

- 调查
- 并行 teammate
- 后台等待

则不强制落新的调度图，lead 可以直接执行。

### 复杂目标

复杂目标必须落盘成最小任务图。

默认拆分顺序：

1. 需要调查时先有 `survey`
2. 主改动是 `implementation`
3. 慢验证是 `validation`
4. 只要前面出现非 lead child executor，并且后续仍需要 lead 继续推进，就必须有 `merge`

调度器拆图优先遵循“一个节点只绑定一个主要 executor”。

## dependency / readiness 规则

### dependency graph

graph 由 `task_dependencies` 表示。

依赖边要保留为正式任务图事实，不因为 blocker 完成就把整条图语义永久抹掉。

### readiness

一个 task 只有同时满足以下条件，才是 `ready`：

1. 没有未完成 blocker
2. executor 对应 lane 当前合法
3. owner / assignee / background job / worktree 没有冲突
4. 不存在 fail-closed legality 问题

### wait condition

lead 应等待，而不是继续乱跑，当且仅当：

1. 当前没有 lead-runnable ready task
2. 但存在 active child work
   - teammate 正在做
   - background job 正在跑
3. 且不存在需要 lead 立即处理的 illegal conflict

这时调度动作是 `wait_for_existing_work`。

## merge / join 规则

`merge` 节点的作用：

- 吃回 child result
- 汇总子任务完成状态
- 推进后续 lead / validation / closeout

`merge` 节点 ready 的条件：

1. 它依赖的 child task 都已完成
2. 相关 background job 已有正式结论
3. 相关 teammate ownership / worktree 没有漂移

如果 child 完成后没有显式 `merge` 节点：

- 则必须直接把下一个 lead step 变成 ready
- 或 objective 进入 completed

不允许 child 做完后仍停在“没人接”的悬空状态。

## worktree 规则

worktree 在调度里不是默认必需，但以下情况必须使用：

1. teammate 要进行并行实现改动
2. task 已经绑定到独立 lane 并要求目录隔离
3. 恢复后 owner 仍是 teammate，需要验证该 lane 仍真实存在

background 默认复用 task 已绑定的 cwd：

- 有 worktree 就在 worktree 里跑
- 没有就退回项目根

## 恢复规则

reload / continue / 中断恢复时，调度器必须重新做这几件事：

1. reconcile teammate state
2. reconcile background job state
3. reconcile worktree reality
4. 从账本重新派生 task lifecycle
5. 重新判断下一个 dispatch / wait / merge 动作

恢复不读 prompt 历史来猜“刚才谁在做什么”。

恢复只认：

- task owner / assignee / dependency
- background job status
- teammate status
- worktree status
- scheduler metadata

## 本轮明确废弃的旧残余

以下旧行为不再保留为长期裁决路径：

1. 靠 prompt 或 session note 记住“谁应该接着做”
2. 只会派工，不会等待与合流
3. background 成功后没有正式 join 点，直接让主流程靠文本自觉继续
4. 让旧调度路径和新 lifecycle 同时裁决
5. 让失效 worktree / 缺失 teammate / 缺失 background job 继续默许推进

原因：

- 它们违反 `P22`
- 它们会破坏 reload / continue 的可恢复性
- 它们会让错误兼容高于正确性

## 当前持久化状态与派生状态

### 持久化

- task 本体
- dependency edge
- scheduler metadata
- teammate state
- protocol request state
- background job state
- worktree state

### 派生

- task lifecycle
- runnableBy
- handoff legality
- wait reason
- merge readiness
- 下一步 dispatch 动作
