# Prompt 04: 状态统一化

你正在改造 Athlete。你这次只负责一件事:

把状态系统和真相源做成真正统一、可恢复、可升级的工业级底座。

## 项目总目标

把 Athlete 从“能跑起来的系统”推进成“重启后还能接着跑、升级后还能继续演进、状态不打架”的工业级平台。

这个项目要的是:

- 真相源统一
- 状态边界清楚
- 宿主不发明平行状态
- 新旧脏结构不保活

## 你本窗口的唯一目标

把 `session / checkpoint / runtime state / control plane / config` 之间的关系做实。

当前项目已经有控制面 SQLite, 但还有 JSON session 等状态分散问题。

你这次要做的是根基性统一, 不是再补一层适配胶水。

## 责任边界

你优先负责这些目录和文档:

- `src/control/ledger/`
- `src/agent/session/`
- `src/agent/checkpoint/`
- `src/config/`
- `src/host/session.ts`
- `spec/技术实现/状态与真相源.md`
- `spec/技术实现/关键模块/控制面账本.md`
- `spec/技术实现/关键模块/配置系统.md`
- 与状态真相源直接相关的测试

尽量不要在这个窗口里重做这些方向:

- 总指挥策略
- 执行者统一化
- 扩展平台化

如果某些 JSON 真相已经妨碍主干, 可以直接清理。这个项目不需要为旧残余保活。

## 必读文档

1. `spec/README.md`
2. `spec/用户审阅/产品定位.md`
3. `spec/技术实现/README.md`
4. `spec/技术实现/总体架构.md`
5. `spec/技术实现/状态与真相源.md`
6. `spec/技术实现/关键模块/控制面账本.md`
7. `spec/技术实现/关键模块/宿主运行边界.md`
8. `spec/技术实现/关键模块/配置系统.md`
9. `spec/用户审阅/宪法原则/07-任务图要落盘.md`
10. `spec/用户审阅/宪法原则/13-session是任务现场.md`
11. `spec/用户审阅/宪法原则/16-配置只能有一个入口.md`
12. `spec/用户审阅/宪法原则/19-先写失败测试再写实现.md`
13. `spec/用户审阅/宪法原则/22-阶段推进必须有机器状态.md`
14. `spec/用户审阅/宪法原则/24-错误兼容不能高于正确性.md`
15. `spec/用户审阅/宪法原则/25-新项目不为旧残余保活.md`
16. `spec/技术实现/仓库约束/测试策略.md`

## 必须参考的外部材料

- `REF/learn-claude-code-main/docs/zh/s11-error-recovery.md`
- `REF/learn-claude-code-main/docs/zh/s12-task-system.md`
- `REF/learn-claude-code-main/docs/zh/s13-background-tasks.md`
- `REF/learn-claude-code-main/docs/zh/s00a-query-control-plane.md`
- `REF/learn-claude-code-main/docs/zh/s00b-one-request-lifecycle.md`
- `REF/Claude Code/entrypoints/cli.tsx`
- `REF/Claude Code/QueryEngine.ts`
- `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`

## 强约束

1. 先写失败测试, 再写实现。
2. 真相源只能更统一, 不能更分散。
3. 新项目不做脏兼容。错误旧 JSON 真相、旧旁路、旧影子状态可以直接删。
4. 宿主状态只能做宿主绑定, 不能抢控制面裁决权。
5. 配置入口只能有一个。
6. 阶段状态、checkpoint、verification、acceptance、task state 必须有正式机器语义。
7. 一个文件只做一件主要事情。不要把存储、迁移、归一化、派生逻辑继续揉成大文件。
8. 不要做 UI、彩蛋、dream、体验润色。
9. 不要为了“以后可能还要兼容老数据”留下长期脏分支。

## 你必须完成的改造结果

- 明确当前正式真相源有哪些, 非正式真相源有哪些。
- 把关键状态尽量收敛到正式存储和正式 API。
- 如果 `session` 继续用 JSON 已经明显阻碍工业化, 可以直接迁移到更正式的存储方案。
- 清掉会制造平行真相的旧状态路径。
- 让宿主绑定状态和控制面状态的边界更硬。
- 让配置、session、control plane、checkpoint 的关系更清楚。

## 你必须先写出来的失败测试

至少覆盖这些方向:

- 真相源不会再被 JSON 影子文件或宿主缓存偷偷覆盖。
- 关键状态在重启、恢复、重新加载后仍保持一致。
- 配置入口仍然唯一。
- checkpoint / verification / acceptance / task state 的正式状态不会丢。
- 旧旁路清理后, 主路径仍然可恢复、可验证。

## 完成标准

- 真相源结构比现在更统一、更少歧义。
- 相关旧残余被删掉了, 不是继续叠补丁。
- 相关测试先红后绿。
- 相关文档已同步为真实结构。
- 项目状态底座更像工业级系统, 而不是一堆能跑的状态文件。

## 最终回复格式

最后只汇报这些内容:

1. 你统一了哪些真相源
2. 你删掉了哪些旧状态残余
3. 哪些失败测试证明状态统一已经成立
4. 是否还存在平行真相源, 如果没有就明确写“没有刻意留尾巴”
