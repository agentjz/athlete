# Prompt 03: 扩展平台化

你正在改造 Athlete。你这次只负责一件事:

把现有扩展口做成真正的平台底座, 而不是继续做“项目作者自己接功能”的接线板。

## 项目总目标

把 Athlete 从“有很多能力的 Agent”推进成“可持续生长的总指挥型平台内核”。

这个项目未来的关键不是再多加几个功能, 而是:

- 新能力怎样以统一方式进入系统
- 新工具怎样不污染主循环
- 新宿主怎样不绕开核心边界
- 新 workflow 怎样不继续塞回 prompt

## 你本窗口的唯一目标

把 `tools / skills / MCP / host extra tools` 从“能接上”升级为“平台级正式扩展机制”。

注意:

这不是做插件商店。
这不是做 IDE 花活。
这不是做远程控制表演。
这不是做市场页面。

你只做平台内核。

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
- 执行者统一化
- 状态存储迁移

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

## 强约束

1. 先写失败测试, 再写实现。
2. 不做功能堆砌。只做扩展机制底座。
3. 不做插件市场、远程炫技、IDE 联动花活。那不是这次目标。
4. `tool` 负责动作, `skill` 负责 workflow, `MCP` 负责外部能力源, `host` 负责宿主注入点。不要再混。
5. 不要把扩展继续塞回 system prompt。
6. 新扩展必须经过正式注册、正式描述、正式暴露边界。
7. 一个文件只做一件主要事情。不要把 registry、schema、loading、routing、governance 全塞进一个大文件。
8. 这是新项目, 错误旧结构可以直接删, 不做长期兼容。
9. 不要为“以后也许会有一百种插件”写空架子。只做现在真需要的平台骨架。

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
- MCP 和内建能力都必须经过统一 registry / governance 路径。
- 旧的旁路接入方式被清理后, 主路径仍然可用。

## 完成标准

- 扩展机制明显更平台化。
- 新增能力的接入路径更短、更清楚。
- 旧的临时接线被删掉。
- 相关测试先红后绿。
- 相关文档同步为当前真实结构。

## 最终回复格式

最后只汇报这些内容:

1. 你删掉了哪些临时扩展接线
2. 现在正式扩展口怎么分层
3. 哪些测试证明它已经从接线板变成平台底座
4. 是否还有明显旁路残余, 如果没有就明确写“没有刻意留尾巴”
