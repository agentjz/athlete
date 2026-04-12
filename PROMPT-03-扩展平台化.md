# Prompt 03: 扩展平台化

## 状态

已完成。

如果你在新窗口看到这份 Prompt:

- 不要重做这一轮
- 当前结果已经并入主干
- 后续窗口只需要把它当成真实基线继续往下推进

这份 Prompt 是给新窗口直接开工用的。
Prompt 01 和 Prompt 02 都已经完成, 你不要回头重做:

- `lead` 真正总指挥化
- execution lane 统一化

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

你这次只负责一件事:

把 `tools / skills / MCP / host extra tools` 从“能接上”推进成“真正的平台扩展底座”。

## 项目总目标

把 Athlete 从“有很多能力的 Agent”推进成“可持续生长的总指挥型平台内核”。

这个项目未来最重要的不是再多堆几个能力, 而是:

- 新能力如何以统一注册方式进入系统
- 新工具如何不污染主循环
- 新 skill 如何不继续退化成 prompt 拼接
- 新 MCP 能力如何不绕开治理和 registry
- 新 host 注入如何不偷开旁路

## 你本窗口的唯一目标

把扩展口做成正式平台机制, 而不是继续维持“作者手工接线板”。

注意:

- 这不是做插件市场
- 这不是做 IDE 花活
- 这不是做远程控制表演
- 这不是做 UI 润色
- 这不是做自我演化系统

你只做平台内核。

## 当前代码现实

在你动手前, 先接受这个现实:

- `src/tools/registry.ts`
  已经能注册内建 tool, 但平台边界和治理边界仍然耦得偏紧
- `src/tools/runtimeRegistry.ts`
  已经会拼接 runtime tools, 但它仍然像实现汇合点, 不够像正式平台入口
- `src/skills/`
  已经有发现、匹配、加载、prompt/runtime state, 但 skill 与 tool/workflow 边界还需要更硬
- `src/mcp/`
  已经能接 MCP client / discovery / adapter, 但和内建能力在平台层面的统一暴露方式还不够干净
- `src/host/toolRegistry.ts`
  已经有宿主注入点, 但 host extra tools 仍然要证明自己不会旁路核心治理
- `src/tools/governance.ts`
  已经有风险和治理语义, 但 registry / governance / exposure / injection 的层次还不够清楚

换句话说:

现在不是“没有扩展机制”, 而是“已经有一套能用的扩展雏形, 但平台边界还没有彻底做实”。

## 责任边界

你优先负责这些目录和文档:

- `src/tools/`
- `src/skills/`
- `src/mcp/`
- `src/host/toolRegistry.ts`
- `src/tools/runtimeRegistry.ts`
- `spec/技术实现/关键模块/扩展机制.md`
- `spec/技术实现/关键模块/宿主运行边界.md`
- 与扩展口直接相关的测试

尽量不要在这个窗口里重做这些方向:

- 总指挥策略
- execution lane 统一化
- 真相源大迁移
- CLI / host 产品面重构

## 必读文档

1. `spec/README.md`
2. `spec/用户审阅/产品定位.md`
3. `spec/技术实现/总体架构.md`
4. `spec/技术实现/关键模块/扩展机制.md`
5. `spec/技术实现/关键模块/宿主运行边界.md`
6. `spec/技术实现/关键模块/配置系统.md`
7. `spec/用户审阅/宪法原则/02-加一个工具只加一个处理器.md`
8. `spec/用户审阅/宪法原则/05-知识按需加载.md`
9. `spec/用户审阅/宪法原则/15-provider必须可替换.md`
10. `spec/用户审阅/宪法原则/17-扩展靠事件生长.md`
11. `spec/用户审阅/宪法原则/18-主循环和文件都不能长胖.md`
12. `spec/用户审阅/宪法原则/19-先写失败测试再写实现.md`
13. `spec/用户审阅/宪法原则/25-新项目不为旧残余保活.md`
14. `spec/技术实现/仓库约束/测试策略.md`
15. `spec/技术实现/仓库约束/开发规则.md`

## 必须参考的外部材料

- `REF/learn-claude-code-main/docs/zh/s05-skill-loading.md`
- `REF/learn-claude-code-main/docs/zh/s19-mcp-plugin.md`
- `REF/learn-claude-code-main/docs/zh/s19a-mcp-capability-layers.md`
- `REF/Claude Code/tools.ts`
- `REF/Claude Code/entrypoints/sdk/coreSchemas.ts`
- `REF/Claude Code/entrypoints/sdk/controlSchemas.ts`
- `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`

提炼结构原则, 不要照抄 Claude Code 的体量和历史包袱。

## 你必须先想清楚的问题

在写代码前, 你必须先把这些问题在心里讲清楚:

1. Athlete 现在到底有哪些正式扩展口?
2. `tool / skill / MCP / host injection` 各自负责什么, 不负责什么?
3. 一个新能力要进入系统, 最短的正式路径应该长什么样?
4. registry / governance / runtime exposure / host injection 哪些是平台共享边界, 哪些只是具体实现细节?
5. 哪些旧接线只是历史包袱, 应该直接删?

如果你回答不清这些问题, 说明你还在做接线板, 不是平台底座。

## 强约束

1. 先写失败测试, 再写实现。
2. 不做功能堆砌, 只做扩展机制底座。
3. 不做插件市场、远程炫技、IDE 花活。
4. `tool` 负责动作。
5. `skill` 负责 workflow / 组织已有能力。
6. `MCP` 负责外部能力源。
7. `host` 负责宿主注入点。
8. 不要再把这些职责混回一起。
9. 新扩展必须经过正式注册、正式描述、正式暴露边界。
10. 不要把扩展继续塞回 system prompt 做隐式接线。
11. 一个文件只做一件主要事情, 不要把 registry、schema、loading、routing、governance 再塞回大文件。
12. 这是新项目, 错误旧接线和旁路可以直接删, 不做长期兼容。

## 你必须完成的改造结果

- 明确正式扩展口的边界和接入路径。
- 让工具、技能、MCP、宿主注入不再互相串职责。
- 让扩展注册和暴露机制更统一。
- 清掉临时性、旁路式、半手工式扩展接线。
- 让未来新增能力时, 改动集中在扩展边界, 而不是污染主循环。

## 你必须先写出来的失败测试

至少覆盖这些方向:

- 新增 tool 不需要改一堆无关地方。
- skill / tool / MCP / host extra tool 不会互相越权串职责。
- 宿主扩展能力必须经过正式 host 边界注入。
- MCP 和内建能力都必须经过统一 registry / governance / exposure 路径。
- 旧旁路接入方式被清理后, 主路径仍然可用。
- 新能力接入时, 失败会暴露在正式注册或治理边界, 而不是静默掉。

## 建议优先排查的结构裂缝

- `src/tools/registry.ts` 和 `src/tools/runtimeRegistry.ts` 的职责有没有重叠
- `src/host/toolRegistry.ts` 是否仍让宿主以半旁路方式注入能力
- `src/mcp/toolAdapter.ts` 与内建 tool 的暴露边界是否真的统一
- `src/skills/state.ts` / `src/skills/prompt.ts` 是否仍把 workflow 逻辑偷偷塞回 prompt
- `src/tools/governance.ts` 是否承担了过多 registry 以外的职责

## 允许你做的重构方向

如果需要, 你可以在自己负责的目录内新增更清晰的边界, 例如:

- 统一扩展 descriptor / registration model
- 统一 runtime exposure pipeline
- 统一 host injection contract
- 统一 MCP / builtin tool adapter bridge
- skill workflow 与 tool action 的显式分层

但注意:

不要为了“平台化”再造一层空壳抽象。
要让真实代码路径真的变短、变清楚、变统一。

## 完成标准

- 扩展机制明显更平台化, 不是更像接线板。
- 新增能力的接入路径更短、更清楚。
- 旧的临时接线被删掉。
- 相关测试先红后绿。
- 相关文档同步为当前真实结构。
- 新窗口接手时, 不需要先猜“加一个能力到底该改哪五个地方”。

## 最终回复格式

最后只汇报这些内容:

1. 你删掉了哪些临时扩展接线
2. 现在正式扩展口怎么分层
3. 哪些测试证明它已经从接线板变成平台底座
4. 是否还有明显旁路残余, 如果没有就明确写“没有刻意留尾巴”
