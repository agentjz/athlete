# Prompt 02: 统一执行者体系

## 状态

待完成。

这份 Prompt 是给新窗口直接开工用的。
Prompt 01 已完成, 你不要回头重做 `lead` 总指挥化本身, 而是在这个新基线之上继续推进:

- `lead` 现在已经先跑正式 orchestration loop
- `wait` 已经有正式 pause 状态
- `merge` 已经是 lead 的显式阶段
- Windows 下 teammate / background worker 的可见 CMD 窗口已经关掉

你要做的是:
把 `subagent / teammate / background` 从“三种成熟度完全不同的执行者”收敛成“一套正式执行车道体系”。

## 项目总目标

把 Athlete 从“工业级雏形”推进成“真正的总指挥型智能体平台”。

这个项目要的不是“有很多名字不同的执行者”, 而是:

- 统一可派发
- 统一可观察
- 统一可恢复
- 统一可收口

的执行车道体系。

## 你本窗口的唯一目标

解决当前最根本的问题:

`subagent`、`teammate`、`background` 现在名字都像“执行者”, 但其实不是同一种制度。

当前现实是:

- `subagent` 更像一次性内存分身
- `teammate` 更像持久工位
- `background` 更像后台命令包装

这会直接导致:

- 总指挥面对三套生命周期
- 状态表达不统一
- 结果回报不统一
- worktree / task claim / inbox / completion 的关系不统一
- 测试很难保护“执行者体系”本身, 只能分别保护三条半私有路径

你要抓根因, 不要做表面统一。
不要停留在“加一个公共类型”“套一个父接口”“写几个 helper”。

## 当前代码现实

在你动手前, 先接受这个现实:

- `src/subagent/run.ts`
  现在是进程内一次性执行, 用 `MemorySessionStore`, 直接 `runAgentTurn`, 干完即回摘要
- `src/team/worker.ts`
  现在是持久 worker, 有 session / inbox / auto-claim / worktree / poll loop
- `src/background/worker.ts`
  现在是 detached worker, 核心是跑命令, 回写 job store, 再通过 `MessageBus` 通知 lead
- `src/cli/commands/worker.ts`
  现在只有 `__worker__ teammate` 和 `__worker__ background`, 没有统一 worker 启动协议
- `src/worktrees/store.ts`
  已经是正式能力, 但现在只和 teammate 路径绑定得更深, 跟 subagent / background 的关系不统一
- `src/orchestrator/dispatch.ts`
  已经是正式总指挥路径, 但它面对的仍然是三种成熟度不同的执行者

换句话说:

现在不是“没有执行者体系”, 而是“已经有三套半成熟体系叠在一起”。

## 责任边界

你优先负责这些目录和文档:

- `src/subagent/`
- `src/team/`
- `src/background/`
- `src/cli/commands/worker.ts`
- `src/worktrees/`
- 必要时新增的执行者统一模块
- `spec/技术实现/关键模块/多智能体调度.md`
- `spec/技术实现/关键模块/工作区与并行隔离.md`
- 与执行者体系直接相关的测试

尽量不要在这个窗口里重做这些方向:

- `lead` 的调度策略本身
- 扩展平台
- session / ledger / config 的大规模存储迁移
- host / CLI 产品面重构

如果现有 `subagent` 路线本质上就是错的, 可以直接砍掉旧设计, 但要给出更干净的新主路径。

## 必读文档

1. `spec/README.md`
2. `spec/用户审阅/产品定位.md`
3. `spec/技术实现/总体架构.md`
4. `spec/技术实现/主循环与调度.md`
5. `spec/技术实现/关键模块/多智能体调度.md`
6. `spec/技术实现/关键模块/工作区与并行隔离.md`
7. `spec/用户审阅/宪法原则/04-大任务拆给子智能体.md`
8. `spec/用户审阅/宪法原则/08-慢操作放后台.md`
9. `spec/用户审阅/宪法原则/09-任务太大就分给队友.md`
10. `spec/用户审阅/宪法原则/10-队友之间要有统一协议.md`
11. `spec/用户审阅/宪法原则/11-队友自己认领任务.md`
12. `spec/用户审阅/宪法原则/12-工作区和任务要隔离.md`
13. `spec/用户审阅/宪法原则/19-先写失败测试再写实现.md`
14. `spec/用户审阅/宪法原则/25-新项目不为旧残余保活.md`
15. `spec/技术实现/仓库约束/测试策略.md`
16. `PROMPT-01-真正总指挥化.md`

## 必须参考的外部材料

- `REF/learn-claude-code-main/docs/zh/s04-subagent.md`
- `REF/learn-claude-code-main/docs/zh/s13-background-tasks.md`
- `REF/learn-claude-code-main/docs/zh/s15-agent-teams.md`
- `REF/learn-claude-code-main/docs/zh/s16-team-protocols.md`
- `REF/learn-claude-code-main/docs/zh/s17-autonomous-agents.md`
- `REF/learn-claude-code-main/docs/zh/s18-worktree-task-isolation.md`
- `REF/Claude Code/coordinator/coordinatorMode.ts`
- `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`

提炼原则, 不要照抄 Claude Code 的体量和历史包袱。

## 你必须先想清楚的问题

在写代码前, 你必须先把这几个问题在心里讲清楚:

1. Athlete 到底有几种正式执行车道?
2. 哪些差异是“角色差异”, 哪些差异只是“历史包袱”?
3. 一个执行者从创建到收口, 最少应该经过哪些统一状态?
4. 一个执行者的结果, 应该怎么被 lead 观察、等待、签收、继续?
5. worktree / task claim / inbox / result handoff 到底哪些是所有执行车道都该共享的制度?

如果你回答不清这些问题, 说明你还在修局部, 不是在做体系。

## 强约束

1. 先写失败测试, 再写实现。
2. 这是新项目, 不需要兼容错误旧结构。旧的半成品执行路线可以直接删。
3. 不要保留“名字很多、活法不同、状态不统一”的执行体系。
4. 一个文件只做一件主要事情。执行者生命周期、协议、状态、进程拉起不要继续混在大文件里。
5. 不要做 UI、彩蛋、梦想系统、技能自我沉淀、体验润色。
6. 任务认领、收件箱、worktree 绑定、后台完成通知必须有正式语义。
7. 如果一个执行角色只是语义别名, 就不要再保留成一套独立的烂结构。
8. 最终要的是统一执行模型, 不是再多发明一个角色。
9. Prompt 01 已经完成, 不要把这个窗口的产出变成对 `lead` 主路径的回退。
10. Windows 可见 CMD 窗口这层已经被关掉, 不要再引入任何新的“靠系统弹窗表达执行状态”的方案。

## 你必须完成的改造结果

- 明确 Athlete 到底有几种正式执行车道。
- 统一这些执行车道的生命周期模型。
- 统一它们的状态表达方式。
- 统一它们的启动协议和收口协议。
- 统一它们的通信和回报方式。
- 统一它们和 worktree / inbox / task claim / completion 的关系。
- 把“临时分身”和“正式队友”之间不必要的制度差异清掉。
- 清理会让总指挥面对三套私有制度的旧分支。

## 你必须先写出来的失败测试

至少覆盖这些方向:

- 不同执行车道不会再走完全不同的半私有生命周期。
- 执行者完成、失败、等待、被中止时, 状态是正式且一致的。
- task claim / worktree bind / inbox / result handoff 走正式主路径。
- `subagent` 不再是完全脱离统一执行模型的 memory-only 特例, 除非你明确证明它只是统一模型里的一个同步 lane。
- `background` 不再只是“跑完发条消息”, 而要能被统一签收和等待。
- `teammate` 不再独占 auto-claim / inbox / worktree 这些制度语义。
- 旧的一次性执行路线如果被替换, 测试要证明新主路径是可恢复、可观察、可继续的。

## 建议优先排查的根因

优先看这些结构性裂缝:

- `src/subagent/run.ts` 和 `src/team/worker.ts` 的生命周期模型完全不同
- `src/background/worker.ts` 的结果语义更像“命令通知”, 不是正式执行者 closeout
- `src/cli/commands/worker.ts` 只承载了部分执行车道, 没有统一 worker lane 入口
- `src/worktrees/store.ts` 已经成熟, 但没有成为所有执行车道的正式共享边界
- `src/orchestrator/dispatch.ts` 现在仍要面向三套不统一执行制度做特殊处理

## 允许你做的重构方向

如果需要, 你可以在自己负责的目录内新增更清晰的边界, 例如:

- 统一执行者 lane model
- 统一 worker launch / lifecycle / closeout 模块
- 统一 result handoff / inbox / completion 协议
- 统一 claim + worktree attach 的执行侧主路径

但注意:
不要为了“统一”再造一层空壳抽象。
要让真实代码路径真的收敛。

## 完成标准

- 执行者体系明显收敛, 不是更发散。
- 旧的错误分叉被删掉了。
- 相关测试先红后绿。
- 相关文档已经更新成真实结构。
- 总指挥面对执行者时, 看到的是统一体系, 不是三种成熟度不同的怪东西。
- 新窗口接手时, 不需要先猜“这三种执行者到底哪个算正式人”。

## 最终回复格式

最后只汇报这些内容:

1. 旧执行体系里你删掉了什么
2. 新执行体系现在怎么分层
3. 哪些失败测试保护了统一模型
4. 是否还留下“双轨制”残余, 如果没有就明确写“没有刻意留尾巴”
