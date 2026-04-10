# tool registry

## 作用

Tool registry 负责向模型公开动作集合，并统一管理本地工具与 MCP 动态工具。

## 当前组成

- 本地内建工具
- mode 过滤后的工具集
- MCP 动态收集到的工具
- 统一治理后的 `entries / blocked` 结果

## 当前规则

1. 新工具先注册，再暴露给模型。
2. tool handler 只做动作，不做控制面真相发明。
3. skill 不是工具替代品；skill 提供 workflow，tool 提供动作。
4. MCP 工具也必须经过统一 registry，不走旁路。
5. 工具暴露顺序、workflow fallback、change / verification signal 约束都由机器治理 metadata 决定，而不是靠 prompt 复述。
6. metadata 缺失或不兼容时默认 fail-closed：
   - 内建 / 本地 includeTools 直接报错
   - MCP 工具进入 `blocked`，不暴露给模型

## 工具层职责

`src/tools/` 当前负责：

- 参数解析
- 权限和状态校验
- 调用下层 store / worker / utils
- 把结果序列化返回给模型

不负责：

- provider 请求
- session 存储
- 发明新的持久化真相

## 当前分组

- `src/tools/files/`
- `src/tools/documents/`
- `src/tools/tasks/`
- `src/tools/team/`
- `src/tools/worktrees/`
- `src/tools/background/`
- `src/tools/shell/`
- `src/tools/skills/`

共享层仍在 `src/tools/` 根目录：

- `registry.ts`
- `runtimeRegistry.ts`
- `governance.ts`
- `routing.ts`
- `shared.ts`
- `types.ts`
- `changeTracking.ts`

## Playwright MCP 当前事实

当前 Playwright 浏览器工具通过 runtime registry 暴露为：

- `mcp_playwright_browser_navigate`
- `mcp_playwright_browser_snapshot`
- `mcp_playwright_browser_click`
- `mcp_playwright_browser_type`
- `mcp_playwright_browser_take_screenshot`
- 以及其他 `mcp_playwright_browser_*`

当前优先级策略：

- runtime registry 先用治理 metadata 做 fail-closed 过滤，再按机器排序暴露工具
- Playwright 浏览器工具会通过治理 metadata 稳定排到本地文件工具和 shell 工具前面
- request 级 tool priority 会消费同一套 metadata，在 web research / browser automation 场景继续把浏览器工具前置
- `run_shell` 与本地文件 detour 在 browser workflow 下只作为 fallback

## 当前治理模型

当前 registry 暴露给机器的不只是 tool schema，还包括：

- `entries`: 每个已暴露工具的统一 governance metadata
- `blocked`: 因 metadata 缺失、MCP 缺少可信只读提示、或治理不兼容而被 fail-closed 的工具

当前 governance metadata 至少回答：

- 是否只读 / 会不会修改状态
- 是否高风险 / destructive
- 是否要求 change signal / verification signal
- 是否 browser-first
- 是否在特定 workflow 下只能 fallback
- 是否并发安全

## 当前约束

如果某个动作：

- 需要明确输入输出
- 不适合塞进 prompt
- 不该让模型自己拼 shell

就应该做成工具，而不是继续加提示词。
