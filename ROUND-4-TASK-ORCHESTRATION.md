# 第 4 轮：任务编排成熟化

这一轮默认建立在**第 1 到第 3 轮都已完成**的基础上。  
不要把它做成“加更多 multi-agent 功能”的玩具扩展。目标是把控制面做成熟。

## 你的角色

你是一个强调控制面真相、系统边界、可恢复执行的高级架构师兼落地工程师。  
你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

让 Athlete 的任务编排能力从“有 task / team / background / worktree 这些零件”，升级成一个更成熟的工业级控制面。

系统应该更清楚地知道：

- 任务处于什么生命周期
- 任务归谁
- 谁能接
- 谁在做
- 依赖谁
- 哪些任务 ready
- 中断后怎么接
- 并行时怎么不踩

重点是：  
把 control plane 做成熟，不是做花哨 swarm。

## 核心原则

1. 任务真相继续放在现有 task/team/background/worktree store 中。
2. prompt 不能成为调度真相源。
3. orchestration 必须继续兼容 continuation / checkpoint / verification / closeout。
4. 少数强生命周期规则，比大量软启发式更重要。
5. 不要把这轮做成一个“会分身但不稳定”的玩具 swarm。

## 必须先读

- `spec/architecture/总体架构.md`
- `spec/architecture/状态与真相源.md`
- `spec/architecture/运行时循环.md`
- `spec/overview/产品定义.md`
- `spec/overview/v0范围.md`
- `src/tasks/*`
- `src/team/*`
- `src/background/*`
- `src/worktrees/*`
- `src/orchestrator/*`
- `src/agent/managedTurn.ts`
- `src/agent/runTurn.ts`
- 所有与 orchestrator / teammate / background / worktree / task lifecycle 相关测试

## 本轮必须参考的本地 REF

这轮必须参考下面这些本地资料，但**只能提炼控制面、任务系统、多 agent 编排、上下文隔离与协调方式**，不能抄实现，也不能把 Athlete 做成另一个项目的翻版：

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

## 必须交付的东西

你必须完成下面这些：

1. 收紧任务生命周期，让状态变化更明确、更少隐含规则。
2. 提升 ownership / assignment / readiness 的语义清晰度。
3. 加强这些对象之间的协同：
   - task board
   - teammate execution
   - background jobs
   - worktrees
4. 让 interruption、yield、recovery 更好地保留 orchestration reality。
5. 补强测试，降低长任务和并行任务 silently regression 的风险。

## 推荐实现方式

推荐方向：

- 先理清生命周期和状态转移，再增加行为
- 优先复用现有 store，不新建平行真相源
- 如有必要，可以抽小模块承载 lifecycle rules
- 保持 lead/orchestrator 聚焦协调，而不是亲自改文件

优先考虑这些区域：

- `src/tasks/store.ts`
- `src/tasks/types.ts`
- `src/team/*`
- `src/background/*`
- `src/worktrees/store.ts`
- `src/orchestrator/*`
- `src/agent/managedTurn.ts`
- `src/agent/runtimeState.ts`

## 不要做的事

- 不要做一个庞大的 swarm 框架。
- 不要添加系统根本管不住的新角色。
- 不要把调度真相塞进 prompt 或 runtime summary。
- 不要做无关 UX 工程。

## 必须补的测试

至少覆盖这些：

1. task readiness / ownership / dependency transition
2. task 与 worktree 的真实生命周期联动
3. teammate 与 background 的 handoff 行为
4. recovery / continuation 是否保持 orchestration truth 一致
5. lead path 的 orchestration 是否没有继续写胖主循环

## 必须执行的验证

按这个顺序跑：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - orchestrator
   - tasks
   - team
   - background
   - worktrees
   - managed turn / continuation
3. `npm.cmd run test:core`

## 如果 spec 需要同步

只做最小必要同步：

- `spec/architecture/总体架构.md`
- `spec/architecture/状态与真相源.md`
- `spec/architecture/运行时循环.md`
- `spec/overview/产品定义.md`
- `spec/overview/v0范围.md`
- `spec/implementation/目录结构到代码文件映射表.md`

## 最终回复必须包含

只回答这些：

- 哪些 orchestration lifecycle 被做硬了
- 去掉了哪些控制面歧义
- 哪些并行 / 恢复行为变得更成熟了
- 跑了哪些测试，结果如何
- 残余风险是什么
