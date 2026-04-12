# Prompt 04: 状态统一化

## 状态

待完成。

这份 Prompt 是给新窗口直接开工用的。
Prompt 01、Prompt 02、Prompt 03 都已经完成, 你不要回头重做:

- `lead` 真正总指挥化
- execution lane 统一化
- 扩展平台化

当前真实基线是:

- `lead` 已经先跑正式 orchestration loop
- `wait` 已经是正式 pause 状态
- `merge` 已经是 lead 的显式阶段
- execution 体系已经统一成:
  - `agent lane`
  - `command lane`
- worker 启动协议已经统一成:
  - `__worker__ run --execution-id <id>`
- `subagent / teammate / background` 已经收敛成 execution profile
- 扩展平台已经正式分层:
  - builtin tool 通过 `src/tools/builtinCatalog.ts`
  - runtime source 通过 `ToolRegistrySource`
  - MCP 通过正式 source 进入 shared registry
  - host extra tool 通过正式 host source 注入
  - skill 仍然停留在 workflow 边界

你这次只负责一件事:

把 `session / checkpoint / runtime state / control plane / config / host binding` 做成真正统一、可恢复、可升级的状态底座。

## 项目总目标

把 Athlete 从“能跑起来的系统”推进成“重启后还能接着跑、升级后还能继续演进、状态不打架”的工业级平台。

这个项目未来最重要的不是再多堆几个状态文件, 而是:

- 哪些状态才是正式真相源
- 哪些状态只是派生缓存或宿主绑定
- 关键状态在重启、恢复、升级后如何不丢
- 宿主如何不偷长平行状态
- 配置如何继续保持唯一入口

## 你本窗口的唯一目标

把 `session / checkpoint / runtime state / control plane / config` 之间的关系做实。

注意:

- 这不是做 UI 润色
- 这不是做 IDE 花活
- 这不是做日志美化
- 这不是做产品交互小优化
- 这不是做“状态可视化大屏”

你只做状态内核。

## 当前代码现实

在你动手前, 先接受这个现实:

- `src/agent/session/store.ts`
  已经是 session 的正式持久化入口, 但它同时承担了 create / save / load / normalize / derive 多种职责
- `src/agent/checkpoint/`
  已经有 checkpoint state / derivation / transition 语义, 但它和 session save/load 的关系仍然偏紧
- `src/agent/session/taskState.ts`
  已经有 task state 派生和归一化, 但 session 内 machine state 与 control plane 边界还不够硬
- `src/agent/verification/`
  已经有 verification machine state, 但它作为正式持久状态的边界还需要更清楚
- `src/agent/acceptance/`
  已经有 acceptance machine state, 但和 checkpoint / verification / finalize 的持久边界还需要更硬
- `src/control/ledger/`
  已经有 SQLite 控制面账本, 但它和 session 现场各自负责什么还不够一眼清楚
- `src/config/store.ts`
  已经是唯一配置入口, 但它同时承担 config file / dotenv / env override / project roots / Telegram / 微信 runtime 归一化, 职责偏多
- `src/host/session.ts`
  已经有宿主绑定和 session 恢复入口, 但仍然要证明 host binding 不会反客为主变成影子真相

换句话说:

现在不是“没有状态系统”, 而是“已经有一套能用的状态雏形, 但真相源边界、恢复边界、升级边界还没有彻底做实”。

## 责任边界

你优先负责这些目录和文档:

- `src/control/ledger/`
- `src/agent/session/`
- `src/agent/checkpoint/`
- `src/agent/verification/`
- `src/agent/acceptance/`
- `src/agent/runtimeMetrics/`
- `src/config/`
- `src/host/session.ts`
- `spec/技术实现/状态与真相源.md`
- `spec/技术实现/关键模块/控制面账本.md`
- `spec/技术实现/关键模块/配置系统.md`
- 与状态真相源直接相关的测试

尽量不要在这个窗口里重做这些方向:

- 总指挥策略
- execution lane 统一化
- 扩展平台化
- CLI / host 产品面重构

如果某些 JSON 真相已经妨碍主干, 可以直接清理。
这是新项目, 不需要为错误旧残余保活。

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
17. `spec/技术实现/仓库约束/开发规则.md`

## 必须参考的外部材料

- `REF/learn-claude-code-main/docs/zh/s11-error-recovery.md`
- `REF/learn-claude-code-main/docs/zh/s12-task-system.md`
- `REF/learn-claude-code-main/docs/zh/s13-background-tasks.md`
- `REF/learn-claude-code-main/docs/zh/s00a-query-control-plane.md`
- `REF/learn-claude-code-main/docs/zh/s00b-one-request-lifecycle.md`
- `REF/Claude Code/entrypoints/cli.tsx`
- `REF/Claude Code/QueryEngine.ts`
- `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`

提炼结构原则, 不要照抄 Claude Code 的体量和历史包袱。

## 你必须先想清楚的问题

在写代码前, 你必须先把这些问题在心里讲清楚:

1. Athlete 现在到底有哪些正式真相源?
2. `session / control plane / config / host binding` 各自负责什么, 不负责什么?
3. 哪些状态是 canonical, 哪些只是派生, 哪些只是宿主运行缓存?
4. 一个状态在“写入 / 读取 / 归一化 / 派生 / 恢复 / 升级”这些环节分别该长在哪一层?
5. 哪些旧 JSON、旧镜像字段、旧恢复路径只是历史包袱, 应该直接删?

如果你回答不清这些问题, 说明你还在补胶水, 不是在做状态底座。

## 强约束

1. 先写失败测试, 再写实现。
2. 真相源只能更统一, 不能更分散。
3. 新项目不做脏兼容。错误旧 JSON 真相、旧旁路、旧影子状态可以直接删。
4. 宿主状态只能做宿主绑定, 不能抢控制面裁决权。
5. 配置入口只能有一个。
6. checkpoint / verification / acceptance / task state / runtime stats 必须有正式机器语义。
7. 一个文件只做一件主要事情。不要把存储、迁移、归一化、派生逻辑继续揉成大文件。
8. 不要做 UI、彩蛋、体验润色。
9. 不要为了“以后可能还要兼容老数据”留下长期脏分支。
10. 如果 session 继续留在 JSON, 你必须让它的职责、归一化边界、升级路径更硬; 如果它已经阻碍主干, 可以直接迁移到更正式的存储。
11. 不要为了“状态统一化”再造一层空壳仓储抽象。要让真实写入路径更短、更清楚、更可验证。

## 你必须完成的改造结果

- 明确当前正式真相源有哪些, 非正式真相源有哪些。
- 把关键状态尽量收敛到正式存储和正式 API。
- 清掉会制造平行真相的旧状态路径。
- 让宿主绑定状态和控制面状态的边界更硬。
- 让配置、session、control plane、checkpoint 的关系更清楚。
- 让状态恢复、重新加载、升级失败都暴露在正式边界, 而不是静默靠运气。

## 你必须先写出来的失败测试

至少覆盖这些方向:

- 真相源不会再被 JSON 影子文件或宿主缓存偷偷覆盖。
- 关键状态在重启、恢复、重新加载后仍保持一致。
- 配置入口仍然唯一。
- checkpoint / verification / acceptance / task state / runtime stats 的正式状态不会丢。
- host binding 只能绑定到正式 session, 不能反向发明 session 真相。
- 旧旁路清理后, 主路径仍然可恢复、可验证。
- 状态写坏时, 失败会暴露在正式读取、归一化、迁移或恢复边界, 而不是静默吞掉。

## 建议优先排查的结构裂缝

- `src/agent/session/store.ts` 是否同时承担了存储、归一化、派生、修复过多职责
- `src/agent/checkpoint/state.ts` 与 `src/agent/session/` 的边界是否仍然偏紧
- `src/agent/verification/`、`src/agent/acceptance/` 是否只是“有状态”, 还是已经是“正式持久 machine state”
- `src/config/store.ts` 是否承担了过多入口以外的职责
- `src/host/session.ts` 是否仍然允许宿主绑定路径间接制造影子真相
- `src/control/ledger/` 和 session JSON 之间是否还有说不清的双裁决区域
- `SessionRecord` 里的字段哪些是 canonical, 哪些应该降级成派生或迁移出去

## 允许你做的重构方向

如果需要, 你可以在自己负责的目录内新增更清晰的边界, 例如:

- 统一 session snapshot schema / normalization / derivation 的分层
- 统一 checkpoint / verification / acceptance / runtime stats 的持久化入口
- 统一 state migration / upgrade 边界
- 统一 host binding contract
- 统一 truth-source matrix 和读取优先级

但注意:

不要为了“工业化”再造一层空仓储和空接口。
要让真实代码路径真的变短、变清楚、变统一。

## 完成标准

- 真相源结构比现在更统一、更少歧义。
- 新窗口接手时, 不需要先猜“这个状态到底应该写 JSON、SQLite 还是 host 文件”。
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
