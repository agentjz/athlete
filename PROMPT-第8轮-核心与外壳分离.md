# 第 8 轮强约束提示词：核心与外壳分离（做实版）

你是 `GPT-5.4 Codex`，正在 `athlete` 仓库中执行“第 8 轮：核心与外壳分离”。

这是给新窗口直接开工用的实做版提示词，不是方向讨论稿。

---

## 第 7 轮已完成前提

以下内容视为已经完成，并且是当前主干事实：

1. 第 7 轮产品工程已经完成并通过 `npm.cmd run check` 与 `npm.cmd test`。
2. CLI 已经完成第一轮启动链拆分：
   - `src/cli.ts` 是薄入口
   - `src/cli/program.ts` 负责 commander 装配
   - `src/cli/commands/` 承担命令细节
3. CLI 已经具备 fast path：
   - `athlete --version`
   - `athlete version`
   - `athlete config path`
4. 配置已经具备 `schemaVersion=1`，并且旧版无版本字段配置只允许一次性升级。
5. `doctor`、CLI 顶层错误、`/runtime` 已经完成一轮产品化收口。
6. 当前产品工程契约已经写入：
   - `spec/modules/cli-product-surface.md`
   - `spec/modules/config-system.md`
   - `spec/testing/测试策略.md`
   - `README.md`

本轮禁止回退到第 7 轮之前的状态。

如果你发现第 7 轮还有零星缺口，只允许做最小修补，不允许把本轮退化成“再做一轮 CLI 产品工程”。

---

## 这一轮到底要解决什么

第 7 轮已经把 CLI 做得更像产品，但 Athlete 还没有形成**正式的 host/runtime 边界**。

现在的问题不是“CLI 不好用”，而是：

1. CLI one-shot、CLI interactive、Telegram、Weixin 仍然在多处直接拼装 runtime 执行链。
2. 不同宿主还在重复处理：
   - session create/load
   - `runManagedAgentTurn(...)`
   - `createRuntimeToolRegistry(...)`
   - pause/error/abort 收口
   - host-specific extra tool 接线
3. `src/ui/interactive.ts`、`src/interaction/sessionDriver.ts`、`src/cli/oneShot.ts`、`src/telegram/turnRunner.ts`、`src/weixin/turnRunner.ts` 之间还缺一个正式共享的“宿主调用内核”边界。
4. 如果下一步要接 VS Code / web，现在还没有一个明确的宿主接入点；继续往现有宿主里加，只会让重复 glue 继续增长。

这一轮要做的不是“抽象优雅”，也不是“拆成 monorepo”。

这一轮要做的是：

把 Athlete 从“多个宿主各自拼 runtime”推进成“一个正式宿主运行边界 + 多个宿主薄适配层”。

---

## 本轮唯一目标

完成 **宿主边界（host boundary）与共享运行入口（host-facing runtime facade）** 的正式落地，让 CLI、Telegram、Weixin 和未来 VS Code / web 都走同一条宿主接线主路径。

---

## 本轮完成后必须成立

1. 明确哪些模块属于“核心执行系统”，哪些属于“宿主层”。
2. 引入正式的宿主运行边界模块，宿主不再直接散连 `agent/turn`、tool registry、session glue。
3. CLI one-shot、CLI interactive、Telegram、Weixin 至少共享同一套核心 turn/session 执行入口。
4. 宿主层不允许发明平行真相源，也不允许各自偷偷长一套 runtime 规则。
5. 第 7 轮已经完成的 fast path、配置治理、错误提示、runtime summary 不被打坏。
6. 文档、失败测试、实现、验证必须全部完成。

---

## 当前主问题

以下问题视为本轮优先处理对象：

1. `src/interaction/sessionDriver.ts` 仍然直接依赖 `runManagedAgentTurn(...)`，CLI interactive 还没有通过正式宿主 runtime 边界调用核心。
2. `src/cli/oneShot.ts` 仍然自己拼 one-shot turn 执行逻辑。
3. `src/telegram/turnRunner.ts` 与 `src/weixin/turnRunner.ts` 各自直接依赖：
   - `runManagedAgentTurn(...)`
   - `createRuntimeToolRegistry(...)`
   - host-specific extra tool 接线
   - error / abort / pause 收口
4. Telegram / Weixin turn runner 存在大量重复结构，未来再加新宿主时会继续复制。
5. 现在没有一个正式目录告诉维护者：“宿主应该从哪里接核心，而不是直接钻进内部模块。”

---

## 开工前必须先读

### 仓库内原则与规格

1. `spec/principles/README.md`
2. `spec/principles/P13-session是任务现场.md`
3. `spec/principles/P16-配置只能有一个入口.md`
4. `spec/principles/P17-扩展靠事件生长.md`
5. `spec/principles/P18-主循环和文件都不能长胖.md`
6. `spec/principles/P19-先写失败测试再写实现.md`
7. `spec/principles/P21-没验过就不能收口.md`
8. `spec/principles/P24-错误兼容不能高于正确性.md`
9. `spec/principles/P25-新项目不为旧残余保活.md`
10. `spec/repo/开发规则.md`
11. `spec/architecture/总体架构.md`
12. `spec/modules/扩展机制.md`
13. `spec/modules/interactive-terminal.md`
14. `spec/modules/cli-product-surface.md`
15. `spec/modules/config-system.md`
16. `REF/vscode-extension-redesign-research.md`

### 当前实现

1. `src/cli.ts`
2. `src/cli/program.ts`
3. `src/cli/runtime.ts`
4. `src/cli/oneShot.ts`
5. `src/cli/commands/session.ts`
6. `src/ui/interactive.ts`
7. `src/interaction/sessionDriver.ts`
8. `src/interaction/shell.ts`
9. `src/shell/cli/`
10. `src/telegram/cli.ts`
11. `src/telegram/turnRunner.ts`
12. `src/weixin/cli.ts`
13. `src/weixin/turnRunner.ts`
14. `src/tools/runtimeRegistry.ts`
15. `src/agent/turn.ts`
16. `src/agent/session.ts`
17. `src/tasks/`
18. `src/team/`
19. `src/background/`
20. `src/worktrees/`
21. `src/control/`

### 当前相关测试

1. `tests/one-shot-cli-result-contract.test.ts`
2. `tests/interaction-shell.test.ts`
3. `tests/runtime-observability.test.ts`
4. `tests/telegram-cli.test.ts`
5. `tests/weixin-cli.test.ts`
6. `tests/telegram-visible-events-service.test.ts`
7. `tests/weixin-visible-events-service.test.ts`
8. `tests/structure-slimming.test.ts`
9. 其余与 CLI / interactive / Telegram / Weixin / session / runtime 相关测试

### 参考目录

1. `REF/pi-mono/README.md`
2. `REF/dyad/README.md`
3. `REF/Claude Code/main.tsx`
4. `REF/Claude Code/bridge/`
5. `REF/Claude Code/remote/`
6. `REF/vscode-extension-redesign-research.md`

---

## 宪法铁律

1. 先改文档，再写失败测试，再写实现。
2. 这一轮做的是“宿主边界落地”，不是“起一个新目录名然后继续散耦合”。
3. 宿主层只能负责输入、输出、transport、展示、宿主特有 stop/typing/file-delivery 语义。
4. 控制面真相源仍然只有现有 session / checkpoint / SQLite ledger / runtime state。
5. 配置入口仍然只能有一个，还是 `src/config/store.ts`。
6. 核心层不允许依赖 CLI、Telegram、Weixin 的 UI/transport 细节。
7. 不能把仓库拆成一堆空包或平台化过度。
8. 单文件超过 300 行必须检查并拆分。
9. 如果旧宿主接线方式阻碍正式边界，直接删、直接收口、直接重写，不保留长期兼容。

---

## 固定执行顺序

1. 先读文档与参考。
2. 先更新架构文档，明确“核心执行系统 / 宿主边界 / 宿主适配层”的正式定义。
3. 先补失败测试。
4. 再抽出正式宿主运行边界模块。
5. 再让 CLI one-shot、CLI interactive、Telegram、Weixin 改走共享宿主运行边界。
6. 再清理旧重复 glue 与错误接线路径。
7. 再跑完整验证。
8. 最后复核文档与实现一致性。

---

## 文档阶段必须完成的事

至少更新这些文档，必要时新增模块文档或 ADR：

1. `spec/architecture/总体架构.md`
2. `spec/modules/扩展机制.md`
3. `spec/modules/interactive-terminal.md`
4. 新增一个专门描述宿主运行边界的文档，例如：
   - `spec/modules/host-runtime.md`
   - 或等价 ADR
5. 如有必要，更新 `README.md` 中对产品结构的说明

文档里必须明确：

1. 哪些目录是核心执行系统。
2. 哪些目录是宿主层。
3. 本轮是否新增正式 `src/host/` 边界。
4. 宿主运行边界对外暴露哪些能力。
5. CLI、Telegram、Weixin 哪些逻辑继续留在宿主层，哪些必须下沉到共享边界。
6. 未来 VS Code / web 应该从哪里接，不再允许从哪些内部模块直接起步。
7. 哪些旧接线方式不再保留。

---

## 失败测试必须先覆盖

至少覆盖这些场景：

1. CLI one-shot 不再直接拼 raw runtime，而是通过正式宿主运行边界调用。
2. CLI interactive driver 不再直接依赖 raw `runManagedAgentTurn(...)`。
3. Telegram 与 Weixin turn runner 不再各自直接装配：
   - `runManagedAgentTurn(...)`
   - `createRuntimeToolRegistry(...)`
   - 重复的 pause/error/abort turn 收口
4. Telegram 与 Weixin 仍然可以注入自己的 host-specific extra tool（例如 send file），但接法必须通过正式宿主边界，而不是宿主自己拼完整 runtime。
5. 配置仍然通过统一入口解析。
6. 重构后现有 one-shot / interactive / telegram / weixin 行为不被破坏。
7. 现有 session / checkpoint / task / background / team / worktree / control-plane 真相仍保持统一。
8. 旧重复宿主 glue 不再继续与新主路径并存。

如果需要，可以新增例如：

- `tests/host-runtime-boundary.test.ts`
- `tests/host-runtime-adapters.test.ts`
- 针对 `tests/structure-slimming.test.ts` 的结构预算断言

---

## 实现阶段硬要求

### 一、必须建立正式宿主运行边界

本轮必须引入一个**正式共享的宿主运行边界模块**。

建议使用：

- `src/host/`

至少应包含等价能力：

1. 共享 turn 执行入口
2. 共享 session create/load/start/resume 入口
3. 共享 runtime tool registry 装配入口
4. 共享 pause / abort / error / closeout 收口入口
5. 宿主可注入 extra tools / visible callbacks / host identity 的扩展点

### 二、不要做“假分层”

以下做法不算完成：

- 只是加一个 wrapper，但 CLI / Telegram / Weixin 仍然直接 import `runManagedAgentTurn(...)`
- 只是把重复代码复制到 `src/host/`，宿主旧路径继续并存
- 只是写文档说有边界，代码仍然到处散连核心模块

### 三、这轮允许保留在宿主层的内容

这些内容可以继续留在宿主层：

- CLI 的 commander 参数解析
- CLI shell input / output / intro / turn display
- Telegram / Weixin 的 transport client
- Telegram / Weixin 的 typing、visible enqueue、delivery queue、attachment download
- Telegram / Weixin 的 session binding / peer routing / stop semantics

但这些宿主模块在真正执行 turn 时，必须走共享宿主运行边界，而不是自己重拼核心链路。

### 四、这轮明确不要求做的事

1. 不要求把所有现有 core 目录大搬家到 `src/core/`。
2. 不要求做完整 VS Code 扩展。
3. 不要求做完整 web 宿主。
4. 不要求把仓库改成 monorepo。

本轮的正确做法是：

在当前仓库内建立**清晰、可工作的正式边界**，而不是做大迁移秀。

### 五、建议优先拔掉的直接耦合点

这些点优先级很高，不是可选项：

1. `src/interaction/sessionDriver.ts` 对 raw turn 执行的直接依赖
2. `src/cli/oneShot.ts` 对 raw turn 执行的直接依赖
3. `src/telegram/turnRunner.ts` 内部自己装配 runtime tool registry
4. `src/weixin/turnRunner.ts` 内部自己装配 runtime tool registry
5. Telegram / Weixin turn runner 里重复的 turn lifecycle glue

### 六、结构要求

1. `src/cli.ts` 不能重新长胖。
2. 新加的宿主边界文件如果超过 300 行，要继续拆。
3. `src/telegram/turnRunner.ts`、`src/weixin/turnRunner.ts` 如果重构后仍明显重复，应继续下沉共享部分，而不是接受重复。

---

## 本轮明确禁止

1. 禁止顺手加新通道、新工具、新 agent 角色。
2. 禁止顺手做完整 VS Code / web 产品壳。
3. 禁止把“核心与外壳分离”做成只有 README 的名词工程。
4. 禁止让宿主层继续偷偷保存自己的平行状态。
5. 禁止为了抽象优雅把当前可运行路径打碎。
6. 禁止为了照顾旧错误接线长期保留双轨宿主结构。
7. 禁止把第 8 轮混成“重写全部 runtime 核心”。

---

## 验收标准

只有同时满足以下条件，才能算本轮完成：

1. 文档已经正式定义：
   - 核心执行系统边界
   - 宿主层边界
   - 共享宿主运行入口
   - 旧重复接线路径清理边界
2. 失败测试先补过，并且能证明旧结构里宿主耦合过重。
3. 已经存在真实的共享宿主运行边界实现，而不是口头抽象。
4. CLI one-shot、CLI interactive、Telegram、Weixin 已改走新边界。
5. `npm.cmd run check` 和 `npm.cmd test` 通过。
6. 第 7 轮的 fast path、配置治理、错误呈现、runtime summary 没有回退。
7. 未来做 VS Code / web 时，不需要再从 `agent/turn`、tool registry、session glue 的散装内部模块直接起步。

---

## 最终汇报格式

最终汇报必须包含：

1. 哪些模块被认定为核心执行系统。
2. 哪些模块被认定为宿主层。
3. 新增的共享宿主运行边界是什么，文件落点在哪里。
4. 哪些 raw 宿主耦合点被拔掉了。
5. 先补了哪些失败测试。
6. CLI、Telegram、Weixin 如何验证仍然正常。
7. 哪些旧重复 glue / 错误接线方式被删除、收口或重写。
8. 未来 VS Code / web 会从哪里接入。
9. 哪些内容明确留到后续，没有混进本轮。
