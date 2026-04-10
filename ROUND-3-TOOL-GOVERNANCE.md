# 第 3 轮：工具治理

下面这份文本不是“阶段总结”，而是给**新开对话**直接使用的强约束任务提示词。  
目标是让新的对话窗口一次性完整完成 round3，不留尾巴，不停在分析，不把风险留到下一轮。

---

# 第 3 轮：工具治理

这一轮默认建立在**第 1 轮和第 2 轮已完成**的基础上。  
round1 已经把 runtime transition 做成机器显式。  
round2 已经把 runtime observability 做成 durable truth + derived diagnostics。  

这一轮不是“加更多工具”，也不是“顺手整理 registry”。  
这一轮的唯一目标，是把 Athlete 的工具层做成**真正受治理、fail-closed、可被机器决策消费**的执行平面。

这是一项**一次性完整交付**任务。  
不要停在分析、方案描述、半成品 patch、或只补几个 metadata。  
必须把测试、实现、验证、最小 spec 同步一起做完。

## 执行前提

1. 把 Athlete 当成**快速演进的新项目**。
2. **不要为旧工具 shape、旧暴露顺序、旧兼容路径投入实现成本。**
3. 如果某个旧测试、旧约束、旧分支只是为了兼容历史形态，而不是为了保护当前机器真相，应当删除或改写。
4. 但不能借“新项目”之名破坏当前已成立的机器边界：
   - `SessionRecord`
   - `checkpoint`
   - `verificationState`
   - `runtimeStats`
   - `continuation / compact / closeout`
   - 现有 browser-first / MinerU / skill workflow 行为

## 你的角色

你不是做 prompt polish 的人。  
你是一个强调系统边界、fail-closed 约束、机器真相源、统一元数据模型、可验证工程设计的高级架构师兼落地工程师。

你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

把 Athlete 的工具系统升级成真正被治理的工业级能力层，让系统自己知道：

- 哪些工具是只读
- 哪些工具会修改状态
- 哪些工具会产生 change / verification 信号
- 哪些工具是高风险
- 哪些工具可以并发，哪些不能
- 哪些工具在特定 workflow 下必须前置
- 哪些工具在 metadata 缺失或不兼容时必须 fail-closed
- 哪些工具暴露给模型时应该优先，哪些只能作为 fallback

重点是：

- agent 更强，是因为机器层更聪明
- 不是因为 prompt 更长
- 不是因为又写了一份工具说明书

## 宪法原则

### P18 主循环和文件都不能长胖

- 不要把 `runTurn.ts`、`toolExecutor.ts`、`toolPriority.ts`、`runtimeRegistry.ts`、`registry.ts` 写胖。
- 超过 300 行先怀疑职责耦合，不要先堆代码。
- 只要出现“一个文件里有两件以上主要事情”，优先拆子模块。

### P13 session 是任务现场

- 工具治理不新增 session 平行真相源。
- 如果某个工具事实需要跨 turn 一致，只能扩在既有 truth source 或工具元数据里，不能额外造 JSON。

### P06 上下文要能压缩

- 工具治理不能靠 prompt 维护完整路由表。
- 工具路由、优先级、workflow blocking 必须由机器逻辑驱动，不能破坏 compact / continuation。

### 状态与真相源

- 不允许新建平行工具真相源 JSON。
- 工具能力真相优先放在 registry / metadata / machine policy。
- 任何跨 turn 一致性都不能只放在 prompt 文案里。

## 核心原则

1. 工具政策属于机器层，不属于 prompt 叙述。
2. prompt 只能保留高层原则，不能继续写成长长的工具路由表。
3. 工具元数据应该驱动 registry、guard、priority、validation、fallback 等决策。
4. fail-closed 比 best-effort 更重要。
5. 不要推翻现有工具框架，优先增强现有工具平面。
6. 不要做第二套 registry，不要发明平行 tool plane。
7. 现有 browser-first、MinerU routing、skill gating、closeout compatibility 都必须保住。

## 第一步必须先做什么

### 第一步必须是：先写失败测试

不要先改实现。  
先把这一轮真正要保护的工具治理行为写成失败测试，再开始实现。

如果现有测试表达的是“维持旧排序 / 旧结构 / 旧偶然行为”，而不是保护当前 machine truth：

- 删除它，或
- 改写成保护当前 truth source 的测试

但不要两者并存。

## 必须先读

先读这些，再动代码：

- `ROUND-1-KERNEL-HARDENING.md`
- `ROUND-2-OBSERVABILITY.md`
- `spec/modules/tool-registry.md`
- `spec/modules/扩展机制.md`
- `spec/architecture/总体架构.md`
- `spec/principles/P18-主循环和文件都不能长胖.md`
- `spec/principles/P13-session是任务现场.md`
- `spec/principles/P06-上下文要能压缩.md`
- `spec/architecture/状态与真相源.md`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`
- `src/tools/types.ts`
- `src/tools/shared.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/agent/toolExecutor.ts`
- `src/tools/fileIntrospection.ts`
- `tests/playwright-mcp.test.ts`
- `tests/playwright-workflow-guard.test.ts`
- `tests/mineru-document-tools.test.ts`
- `tests/mineru-skills-and-surface.test.ts`
- 与 registry / tool exposure / workflow guard / MinerU / browser priority 相关的现有测试

## 本轮必须参考的本地 REF

这轮必须参考下面这些本地资料，但**只能提炼工具治理、权限默认值、fail-closed 原则、条件加载与能力分层方式**，不能照抄，也不能引入平行工具体系：

- `C:\Users\Administrator\Desktop\athlete\REF\txt\顶级开发团队设计的Harness工程项目源码什么样.txt`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\Tool.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\tools.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\constants\tools.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\constants\toolLimits.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\tools\toolExecution.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\tools\toolHooks.ts`
- `C:\Users\Administrator\Desktop\athlete\REF\Claude Code\services\tools\toolOrchestration.ts`

重点看：

- 工具元数据如何驱动策略
- 默认值如何 fail-closed
- 工具能力如何按机器规则分层，而不是靠 prompt 记忆
- 条件启用 / 条件暴露 / 条件限制如何组织

## 你真正要做成什么样

这一轮完成后，系统至少要能机器化回答：

- 为什么这个工具能暴露给模型
- 为什么这个工具在当前 mode / workflow / skill 状态下被挡住
- 为什么这个工具排在前面
- 为什么这个工具只能作为 fallback
- 为什么这个工具调用会自动带出 verification / recovery / routing hint
- 如果 metadata 缺失，系统为什么会 fail-closed，而不是默认放行

## 推荐实现方向

优先按下面方向收敛：

### 1. 统一工具能力模型

优先在既有工具平面里引入或强化 capability metadata，例如：

- `readOnly`
- `mutating`
- `destructive`
- `producesVerificationSignal`
- `producesChangeSignal`
- `preferredWorkflow`
- `fallbackOnly`
- `concurrencySafe`
- `surface`

不要机械照抄上面字段名。  
你可以按当前仓库更合适的命名设计，但必须做到“一次定义，多处消费”。

### 2. 元数据必须被真实执行层消费

元数据不能只是挂在那里好看。  
至少要让它被下面这些机器决策真实消费：

- registry 暴露
- runtime registry 合并 MCP 工具
- tool priority
- workflow guards
- recovery hint / routing hint
- fail-closed blocking

### 3. 保持现有能力，但把 ad hoc 逻辑往中心收

重点收敛这些已存在但还偏散的逻辑：

- browser-first priority
- Playwright workflow blocking
- MinerU 文档路由 hint
- mode 过滤
- MCP 工具接入

要求：

- 不破坏现有外部行为
- 但要尽量减少“这个文件里手写一点、那个文件里再手写一点”的 ad hoc 判断

### 4. prompt 保持 principle-level

不要把工具治理重新写回 prompt。  
这一轮结束后，prompt 仍然只能保留高层原则，例如：

- 优先专用工具
- 遵循 runtime / workflow guard
- specialized tools first

不能重新变成完整工具路由表或 capability catalog。

## 优先考虑的代码区域

- `src/tools/types.ts`
- `src/tools/shared.ts`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/agent/toolExecutor.ts`
- `src/tools/fileIntrospection.ts`

如需新增模块：

- 可以新增小模块
- 不要新增“大一统工具治理管理器”
- 不要新增第二套 registry

## 不要做的事

- 不要造第二套工具框架。
- 不要新建平行工具真相源 JSON。
- 不要把工具真相重新塞回 prompt。
- 不要破坏现有 `createToolRegistry` / `createRuntimeToolRegistry` 入口。
- 不要顺手做无关清理。
- 不要把 browser-first / MinerU / skill-gated 行为回退成 prompt 提醒。

## 必须先写的失败测试

至少先补下面这些失败测试，再开始实现：

1. 关键工具 capability metadata 可被暴露，并且被真实执行层消费，而不是死字段。
2. browser-first policy 仍然是 machine-enforced 的，并且优先级来源于机器策略，不是 prompt。
3. 文档路由行为来自机器 hint / metadata / introspection，而不是 prompt 重复说明。
4. metadata 缺失、不兼容或高风险组合下，系统会 fail-closed。
5. MCP 工具接入后，仍然经过统一治理路径，而不是绕过 registry。
6. prompt 仍然保持 principle-level，不重新膨胀成工具说明书。
7. 不打坏 closeout / verification / continuation / compact。

如果现有测试是为了保护旧排序、旧 shape、旧旁路行为：

- 直接删掉，或
- 重写成保护当前 truth source

## 最低验收标准

你只有在下面全部满足时，才能认为本轮完成：

1. 已存在或新增的工具能力模型，真实驱动了至少两类以上机器决策。
2. browser-first / Playwright workflow guard 没被打坏。
3. MinerU 文档路由没被打坏，并且 routing hint 更机器化。
4. metadata 缺失或高风险时，行为是 fail-closed，不是默许放行。
5. prompt 仍然只保留 principle-level，不回退成工具说明书。
6. 没有新增平行工具真相源。
7. 文件职责仍然清晰，没有明显违反 P18。

## 必须执行的验证

严格按这个顺序执行：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - `playwright-mcp`
   - `playwright-workflow-guard`
   - `mineru-document-tools`
   - `mineru-skills-and-surface`
   - 任何新增的 tool-governance targeted tests
3. `npm.cmd run test:core`

如果这轮触及区域有失败，必须继续修到通过为止。

## 如果 spec 需要同步

只做最小必要同步：

- `spec/modules/tool-registry.md`
- `spec/modules/扩展机制.md`
- `spec/architecture/总体架构.md`
- `spec/implementation/目录结构到代码文件映射表.md`

如果文档里还在把工具路由写成 prompt-ish 描述，也要顺手收敛成机器策略导向。

## 最终回复必须包含

最终只回答这些：

- 现在的工具治理模型是什么
- 哪些策略从 prompt-ish 逻辑下沉到了机器逻辑
- 哪些 fail-closed 行为变强了
- 你删掉或改写了哪些旧的 ad hoc / 历史包袱
- 跑了哪些测试，结果如何
- 残余风险是什么

---

这是一项**完整交付任务**。  
不要留下一句“后续可以继续补 metadata”就结束。  
如果你发现风险点没有收口，那就继续做，直到收口为止。
