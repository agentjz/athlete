# 第 3 轮：工具治理

这一轮默认建立在**第 1 轮和第 2 轮都已完成**的基础上。  
这轮不是为了“加更多工具”，而是为了把工具层变成一个受治理的执行平面。

## 你的角色

你是一个强调系统边界、fail-closed 约束、可验证工程设计的高级架构师兼落地工程师。  
你现在在本地 `Athlete` 仓库中工作。

## 本轮唯一目标

把 Athlete 的工具系统升级成真正被治理的工业级能力层，让系统自己知道：

- 哪些工具是只读
- 哪些工具会修改状态
- 哪些工具是破坏性的
- 哪些工具可以并发
- 哪些工具会产生 verification 证据
- 哪些工具应该优先
- 哪些工具在某些 workflow 下必须被拦住

重点是：  
让 agent 更强，是因为机器层更聪明，而不是因为 prompt 更长。

## 核心原则

1. 工具政策属于机器层，不属于 prompt 叙述。
2. prompt 只能保留高层原则，不能继续写成长长的工具路由表。
3. 工具元数据应该驱动 registry、guard、validation、priority 等决策。
4. fail-closed 比 best-effort 更重要。
5. 不要推翻现有工具框架，优先增强现有工具平面。

## 必须先读

- `spec/modules/tool-registry.md`
- `spec/modules/扩展机制.md`
- `spec/architecture/总体架构.md`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`
- `src/tools/types.ts`
- `src/tools/shared.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/agent/toolExecutor.ts`
- `src/tools/fileIntrospection.ts`
- 浏览器 / 文档 / skill / routing 相关实现
- browser priority / workflow guard / MinerU / runtime tool exposure 相关测试

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

## 必须交付的东西

你必须完成下面这些：

1. 引入或强化统一的**工具能力模型**。
2. 让重要的工具策略来自中心化元数据和 registry 逻辑，而不是散落的 ad hoc 判断。
3. 尽可能把本来靠 prompt 描述的具体工具路由，下沉到机器策略。
4. 增强模糊或高风险场景下的 fail-closed 行为。
5. 同时保持这些能力不被打坏：
   - browser-first workflow
   - MinerU routing hint
   - skill-gated workflow
   - closeout compatibility

## 推荐实现方式

推荐方向：

- 工具 capability metadata 尽量一次定义，多处消费
- 路由与优先级逻辑尽量集中
- 让 tool priority 和 blocking decision 尽量由机器策略推导
- 如果现有工具缺 metadata，就渐进式补，不要整体推翻

优先考虑这些区域：

- `src/tools/types.ts`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`
- `src/tools/shared.ts`
- `src/agent/toolPriority.ts`
- `src/skills/workflowGuards.ts`
- `src/agent/toolExecutor.ts`
- `src/tools/fileIntrospection.ts`

## 不要做的事

- 不要造第二套工具框架。
- 不要把工具真相重新塞回 prompt。
- 不要破坏现有 registry 入口。
- 不要顺手清理无关代码。

## 必须补的测试

至少覆盖这些：

1. 关键工具元数据可被暴露且会被真正执行层消费
2. browser-first policy 仍然是 machine-enforced 的
3. 文档路由行为来自机器 hint，而不是 prompt 重复
4. 高风险工具在 metadata 缺失或不兼容时 fail-closed
5. prompt 仍然保持 principle-level，而不是重新变成工具说明书

## 必须执行的验证

按这个顺序跑：

1. `npm.cmd run test:build`
2. 跑与以下相关的 targeted tests：
   - tool registry
   - browser tool priority
   - workflow guards
   - skills runtime
   - MinerU / document surface
3. `npm.cmd run test:core`

## 如果 spec 需要同步

只做最小必要同步：

- `spec/modules/tool-registry.md`
- `spec/modules/扩展机制.md`
- `spec/architecture/总体架构.md`
- `spec/implementation/目录结构到代码文件映射表.md`

## 最终回复必须包含

只回答这些：

- 现在的工具治理模型是什么
- 哪些策略从 prompt-ish 逻辑下沉到了机器逻辑
- 哪些 fail-closed 行为变强了
- 跑了哪些测试，结果如何
- 残余风险是什么
