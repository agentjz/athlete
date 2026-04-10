# 第 3 轮：工具治理

## 当前状态

状态：已完成  
结论：这一轮要求的工具治理已经落到当前项目中，并且与代码、spec、测试同步收口。

这一轮最终交付的不是“补了几条工具说明”，而是把 Athlete 的工具层做成了受治理、fail-closed、可被机器决策消费的执行平面。

## 已落地的核心结果

### 1. 统一工具治理模型已经存在

当前代码：

- `src/tools/types.ts`
- `src/tools/governance.ts`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`

当前模型已经把工具治理收敛成统一 metadata，至少覆盖：

- `source`
- `specialty`
- `mutation`
- `risk`
- `destructive`
- `concurrencySafe`
- `changeSignal`
- `verificationSignal`
- `preferredWorkflows`
- `fallbackOnlyInWorkflows`
- `browserStep`

这些字段不是展示文案，而是 registry / priority / guard / recovery / routing / validation 共同消费的机器事实。

### 2. registry 现在暴露的不只是 tool schema，而是 governance-aware 的 `entries / blocked`

当前代码：

- `src/tools/registry.ts`
- `src/tools/order.ts`

当前行为已经做到：

- `createToolRegistry` 先对工具做治理归一化，再决定是否暴露
- 可暴露工具进入 `entries`
- metadata 缺失或不兼容的工具会被 fail-closed
- MCP 工具如果缺少足够安全信息，会进入 `blocked`，不会暴露给模型

这意味着系统现在可以机器化回答：

- 为什么某个工具能暴露
- 为什么某个工具被挡住
- 为什么某个工具排在前面

### 3. browser-first 与 MinerU 文档路由已从 ad hoc 逻辑下沉到机器策略

当前代码：

- `src/tools/order.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/tools/routing.ts`
- `src/tools/fileIntrospection.ts`
- `src/agent/toolExecutor.ts`

当前行为已经做到：

- Playwright 浏览器工具通过同一套 governance metadata 获得 browser-first 暴露顺序
- request 级 tool priority 继续维持 browser-first，但优先级来源于机器治理而不是 prompt 路由表
- Playwright workflow guard 不再维护一份零散的 detour 名单，而是消费工具的 workflow fallback metadata
- MinerU / spreadsheet 文档路由通过统一 routing 模块产出机器 hint
- recovery hint 与 file introspection 不再各自手写一套文档工具判断

### 4. 工具结果信号现在受治理约束，默认更严格

当前代码：

- `src/tools/governance.ts`
- `src/tools/registry.ts`

当前行为已经做到：

- 声明 `changeSignal: required` 的工具如果没有返回 `changedPaths`，会直接失败
- 声明 `verificationSignal: required` 的工具如果没有返回 verification metadata，会直接失败
- 声明不应产生 change / verification signal 的工具如果乱产信号，也会被挡住

这使得 change / verification 不再只是 best-effort，而是受统一治理模型约束。

### 5. prompt 仍然保持 principle-level，没有退回工具说明书

当前代码：

- `src/agent/prompt/static.ts`
- `tests/system-prompt-contract.test.ts`
- `tests/mineru-skills-and-surface.test.ts`

当前 prompt 只保留：

- 优先专用工具
- 遵循 runtime / workflow guard
- specialized tools first

当前 prompt 不再承担：

- 完整工具路由表
- 文档工具 capability catalog
- browser / MinerU 的逐条操作说明书

### 6. round3 风险已经收口

本轮要求的关键风险点已经关闭：

- 没有新增平行工具真相源 JSON
- 没有新增第二套 registry 或平行 tool plane
- MCP 没有绕开统一治理路径
- browser-first / MinerU / skill-gated 行为没有回退成 prompt 提醒
- `runTurn.ts`、`toolExecutor.ts`、`toolPriority.ts`、`registry.ts`、`runtimeRegistry.ts` 没有明显违反 P18

## 当前 truth source 边界

这一轮完成后，工具治理相关的机器事实主要落在：

- `ToolRegistry.entries`
- `ToolRegistry.blocked`
- tool governance metadata
- machine policy / routing / validation 逻辑

这一轮没有把工具真相重新塞回 prompt，也没有新增 session 平行真相源。

## 当前关键文件

本轮最终落点主要在：

- `src/tools/types.ts`
- `src/tools/governance.ts`
- `src/tools/routing.ts`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`
- `src/tools/order.ts`
- `src/tools/fileIntrospection.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/agent/toolExecutor.ts`
- `src/mcp/toolAdapter.ts`

## 当前测试与验证状态

本轮要求的验证已经按顺序跑完并通过：

1. `npm.cmd run test:build`
2. targeted tests
   - `playwright-mcp`
   - `playwright-workflow-guard`
   - `mineru-document-tools`
   - `mineru-skills-and-surface`
   - 新增 `tool-governance`
3. `npm.cmd run test:core`

当前与 round3 直接相关的关键测试包括：

- `tests/playwright-mcp.test.ts`
- `tests/playwright-workflow-guard.test.ts`
- `tests/mineru-document-tools.test.ts`
- `tests/mineru-skills-and-surface.test.ts`
- `tests/tool-governance.test.ts`
- `tests/browser-tool-priority.test.ts`
- `tests/system-prompt-contract.test.ts`

## 当前结论

如果后续轮次要继续演进 orchestrator、task system 或 runtime，必须把 round3 视为既成机器边界，而不是可以重新退回 prompt 叙述或 ad hoc 名字判断的“软约定”。
