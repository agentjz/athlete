# Prompt 01: 真正总指挥化

## 状态

已完成。

本窗口已经完成的落点:

- `lead` 先经过正式 orchestration loop, 不再默认直接落入普通 turn
- `wait` 已经成为正式机器状态, 不再靠模糊文案或继续偷跑 lead turn
- `merge` 已经成为 lead 的显式阶段输入, 不再是隐式收口
- Windows 下 teammate / background worker 的可见 CMD 窗口已关闭, 不再作为派工可见语义

后续窗口不要重做本 Prompt 的主目标, 只把它当成 Prompt 02/03/04 的当前前置事实

你正在改造 Athlete。你这次只负责一件事:

把 `lead` 从“会亲自下场干活的主 Agent”升级为“真正的总指挥”。

## 项目总目标

把 Athlete 从“工业级雏形”推进成“真正的总指挥型智能体平台”。

这个项目不是:

- 终端聊天壳
- 玩具型 swarm 演示器
- 自我演化和做梦机制实验场
- 靠堆 prompt 撑出来的伪架构

这个项目要成为:

- 能长期耐跑的主 Agent 系统
- 能拆任务、派任务、等待、合流、验证的总指挥系统
- 有统一控制面、统一宿主边界、统一扩展口的工业级平台内核

## 你本窗口的唯一目标

让 `lead` 真正承担“总指挥”职责, 而不是继续做“最强单兵”。

你要抓根因, 不要打补丁。不要停留在“加点判断”“补几句 prompt”“多写几个 if”。

## 责任边界

你优先负责这些目录和文档:

- `src/orchestrator/`
- `src/agent/turn/managed.ts`
- `src/agent/runTurn.ts`
- `spec/技术实现/主循环与调度.md`
- `spec/技术实现/关键模块/多智能体调度.md`
- 与 orchestration 直接相关的测试

尽量不要在这个窗口里重做这些方向:

- 执行者统一化
- 扩展平台化
- 真相源与存储迁移

如果需要新的边界, 优先在你负责的目录内拆出新模块, 不要把别的窗口的活抢过来。

## 必读文档

先按这个顺序读, 再动手:

1. `spec/README.md`
2. `spec/用户审阅/产品定位.md`
3. `spec/用户审阅/系统全景.md`
4. `spec/技术实现/README.md`
5. `spec/技术实现/总体架构.md`
6. `spec/技术实现/主循环与调度.md`
7. `spec/技术实现/关键模块/多智能体调度.md`
8. `spec/用户审阅/宪法原则/03-先计划再动手.md`
9. `spec/用户审阅/宪法原则/07-任务图要落盘.md`
10. `spec/用户审阅/宪法原则/09-任务太大就分给队友.md`
11. `spec/用户审阅/宪法原则/19-先写失败测试再写实现.md`
12. `spec/用户审阅/宪法原则/22-阶段推进必须有机器状态.md`
13. `spec/用户审阅/宪法原则/25-新项目不为旧残余保活.md`
14. `spec/技术实现/仓库约束/测试策略.md`
15. `spec/技术实现/仓库约束/开发规则.md`

## 必须参考的外部材料

你必须参考这些材料, 但不要抄大文件:

- `REF/learn-claude-code-main/docs/zh/s12-task-system.md`
- `REF/learn-claude-code-main/docs/zh/s15-agent-teams.md`
- `REF/learn-claude-code-main/docs/zh/s16-team-protocols.md`
- `REF/learn-claude-code-main/docs/zh/s17-autonomous-agents.md`
- `REF/learn-claude-code-main/docs/zh/s18-worktree-task-isolation.md`
- `REF/Claude Code/coordinator/coordinatorMode.ts`
- `REF/Claude Code/QueryEngine.ts`
- `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`

提炼设计原则, 不要照抄 Claude Code 的体量和历史包袱。

## 强约束

1. 先写失败测试, 再写实现。测试必须先红后绿。
2. 这是新项目, 不做兼容性保活。错误旧逻辑、旧旁路、旧壳子可以直接删。
3. 不要搞锦上添花。不要做 UI 润色、彩蛋、做梦、自我演化、安全加固。
4. 一个文件只做一件主要事情。禁止制造胖文件。能拆文件就拆文件。
5. 调度判断必须来自机器状态, 不允许靠 prompt 暗示和自由发挥。
6. `lead` 是总指挥。凡是应该拆、派、等、合的工作, 不要继续让 `lead` 假装自己全干。
7. merge 必须是正式阶段, 不是“别人干完了, lead 顺手看一眼”。
8. wait 必须有正式状态和正式理由, 不能靠模糊文案糊弄过去。
9. 文档、测试、实现必须一起改, 不能只改一层。
10. 最终结果必须一次性收口, 不要留 TODO、占位接口、半接通链路。

## 你必须完成的改造结果

- 明确 `lead` 的职责边界: 组织、决策、派发、等待、合流、收口。
- 清理 `lead` 身上不该存在的“亲自执行者”行为。
- 让 orchestration 成为正式主路径, 而不是 run turn 前的一层薄壳。
- 让 split / dispatch / wait / merge 变成机器可验证的状态推进。
- 让 `lead` 对 delegated work 的处理更像调度器, 不像多线程版单兵。
- 清理会让 `lead` 回退成“自己闷头做”的旧分支。

## 你必须先写出来的失败测试

至少覆盖这些方向:

- `lead` 在适合拆分时不会继续自己硬做到底。
- `lead` 在已有 delegated work 进行中时会正式等待, 而不是重复派工或重复执行。
- merge 是正式阶段, 不是隐式收口。
- route 决策基于机器状态, 不是基于脆弱文案。
- orchestration 相关旧快捷路径被清理后, 主路径仍然正确。

## 完成标准

- 新增失败测试先红后绿。
- 相关测试全绿。
- 相关 spec 已同步到真实实现。
- 目录和文件职责比现在更清楚, 不是更乱。
- `lead` 的角色已经明显更像总指挥, 而不是最强单兵。

## 最终回复格式

最后只汇报这些内容:

1. 你删掉了哪些旧逻辑
2. 你新增了哪些失败测试并让它们转绿
3. 现在 `lead` 的职责边界变成了什么
4. 剩余风险是什么, 如果没有就明确说“没有刻意留尾巴”
