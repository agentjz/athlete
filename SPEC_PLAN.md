# Kitty Spec 模式规划

## 1. 核心判断

Spec 模式不是普通 todo，也不是简单的 plan mode。

它的核心是：**用文档驱动开发，把大模型的执行力锁定在当前目标上。**

大模型写代码的能力通常不是最大问题。真正容易出问题的是目标漂移、上下文压缩后方向变形、验收标准遗失、任务拆解不稳定，以及写完代码后 spec、测试、实现无法收敛。

Spec 模式要解决的就是这个问题：先把用户意图变成稳定文档，再让模型沿着文档推进。

## 2. Kitty 的哲学边界

Kitty 当前有三组关键辩证关系：

1. **历史与当下**
   - 历史不应该自动进入当前目标。
   - 历史任务、历史对话、final output、artifact、event、change record、trace、ledger 都应该保留。
   - 但它们只通过查询工具进入当下，由领导者主动取证。

2. **生态与领导者**
   - 工具、skill、MCP、后台任务、task、subagent、teammate、workflow 和外部 agent 都只是可用能力。
   - 能力存在不等于行动意图。
   - 只有领导者显式选择，能力才进入执行。

3. **模型与机器**
   - 模型负责判断路线。
   - 机器负责执行、记录、保存证据、维护账本、等待变化和校验硬边界。
   - 机器不能成为第二个大脑。

Spec 模式必须遵守这三条边界。

## 3. Kiro 的参考价值

参考项目：`ref/Kiro-main`

Kiro 最值得借鉴的是它的 **Specs** 体验。

它不是让模型直接开写代码，而是把开发过程拆成结构化文档：

```text
requirements.md -> design.md -> tasks.md
```

用户进入 Spec 类模式后，先输入需求，系统围绕需求生成规格文档、设计文档和任务文档。之后模型按任务推进，每完成一项，就更新 markdown checklist。

这个体验的价值在于：**文档本身就是进度面板。**

用户不需要理解内部 ledger，也不需要翻一堆工具调用，只看文档就能知道：

- 当前做到了哪一步。
- 哪些阶段完成了。
- 哪些任务还没完成。
- 哪些地方需要继续验证。

这个设计非常适合 Kitty，但不能照搬成机器自动决策。Kitty 应该让领导者通过模型判断任务是否完成，再由工具把文档状态更新为完成。

## 4. Spec Kit 的参考价值

参考项目：`ref/spec-kit-main`

Spec Kit 的价值比 Kiro 更偏方法论。它强调 Spec-Driven Development：

```text
specify -> plan -> tasks -> implement
```

它的核心思想是：spec 不是代码的附属文档，而是开发的源头。代码应该服务 spec，测试应该验证 spec，实现应该和 spec 持续收敛。

Kitty 可以借鉴它的几个点：

- 用模板约束模型输出，避免模型过早跳到实现细节。
- 先写需求，再写设计，再拆任务。
- 任务从文档派生，而不是模型临时拍脑袋。
- 每个阶段都产生可审阅 artifact。
- 最后要求 spec、code、test 收敛。

但 Kitty 不应该照搬 Spec Kit 的 slash command 体系。Kitty 更适合把它变成正式 workflow 能力。

## 5. Agent 模式与 Spec 模式

Kitty 应该明确分成两种启动模式：

```bash
kitty
kitty agent
kitty spec
```

对应本地直接运行产物：

```bash
node dist/cli.js
node dist/cli.js agent
node dist/cli.js spec
```

模式含义：

| 模式 | 用户意图 |
| --- | --- |
| Agent 模式 | 直接执行任务 |
| Spec 模式 | 先写清楚，再按文档开发 |

这个选择应该由用户在启动时显式决定，不应该让模型临时猜。

原因：

- 用户想快速修一个小问题时，不应该被强制进入重流程。
- 用户想做长期功能时，不应该让模型直接开写代码。
- 这是用户工作方式选择，不是机器策略决策。

## 6. Spec 模式的运行体验

Spec 模式进入后，理想体验是：

1. 用户输入需求。
2. 模型生成或更新规格文档。
3. 模型生成设计文档。
4. 模型生成任务文档。
5. 模型按任务执行。
6. 每完成一步，就更新 markdown checklist。
7. 验证结果写回文档。
8. 最后 spec、code、test 收敛。

建议目录结构：

```text
.kitty/specs/<timestamp>-<slug>/
  requirements.md
  design.md
  tasks.md
  verification.md
  status.json
```

其中 `tasks.md` 应该是用户最常看的进度面板：

```md
# Tasks

## Requirements
- [x] 明确用户目标
- [x] 写出验收标准

## Design
- [x] 写出技术设计
- [ ] 明确影响范围

## Implementation
- [ ] 修改实现
- [ ] 增加或更新测试

## Verification
- [ ] 跑检查
- [ ] 同步 spec
```

模型完成一项后，用工具更新 `[ ]` 到 `[x]`。这不是机器自动判断完成，而是领导者判断后写回文档。

## 7. 与 todo / task 的关系

Spec 模式不能替代 todo 和 task。

它们的关系应该是：

| 层级 | 作用 |
| --- | --- |
| Spec | 定义目标、需求、设计、验收标准 |
| Task | 从 spec 派生出来的持久执行任务 |
| Todo | 当前这一轮模型正在做的临时步骤 |

也就是说：

- `requirements.md` 和 `design.md` 决定方向。
- `tasks.md` 决定可执行拆解。
- `task ledger` 负责持久任务状态。
- `todo_write` 只负责当前轮可见进度。

## 8. 建议的能力设计

Spec 模式应该作为 workflow 能力进入 Kitty：

```text
workflow.spec-development
```

建议工具：

```text
spec_create
spec_read
spec_update_stage
spec_task_update
spec_sync_tasks
spec_status
```

机器层只负责：

- 创建 spec 工作区。
- 保存文档。
- 维护阶段状态。
- 更新 checklist。
- 同步任务到 task ledger。
- 暴露证据和状态。

领导者负责：

- 判断需求是否足够清楚。
- 判断设计是否可行。
- 判断任务是否完成。
- 判断是否需要执行下一阶段。
- 判断是否收口。

## 9. 关键原则

Spec 模式必须保持 Kitty 的模型/机器边界：

- `tasks.md` 有任务，不代表机器自动执行任务。
- checklist 未完成，不代表机器强迫模型继续。
- checklist 已完成，不代表机器替模型判断项目完成。
- spec 是事实锚点，不是自动意图。
- 机器可以维护状态，但不能决定路线。

最核心的一句话：

**Spec 是目标契约，Harness 是执行协议，领导者仍然是决策者。**

## 10. 推荐落地顺序

第一阶段先做最小但完整的体验：

1. 增加 `kitty spec` 启动入口。
2. 增加 spec 工作区目录。
3. 增加 `requirements.md / design.md / tasks.md / verification.md / status.json`。
4. 增加 spec workflow capability package。
5. 增加 spec 工具：创建、读取、更新阶段、更新任务、同步 task。
6. 让 Spec 模式系统提示明确要求模型按文档推进。
7. 增加测试保护：Spec 模式不自动执行任务，不让机器替模型决策。

第二阶段再增强：

- 从 `tasks.md` 自动同步到 task ledger。
- 支持子代理按 spec task 执行。
- 支持 Dreaming 对 spec/design 做隔离探索。
- 支持 spec/code/test 收敛检查。
- 支持 spec 文档状态在终端里低噪音展示。

## 11. Spec 模式下属阶段工作流

这里需要区分清楚：

**Spec 模式是顶层开发模式，阶段 workflow 是 Spec 模式内部的执行方法。**

也就是说，不是把 `spec-brainstorm`、`spec-design`、`spec-tasking` 做成和 Spec 模式并列的能力，而是让它们成为 Spec 模式下属的阶段工作流。

核心链路可以是：

```text
Spec 模式
  -> Requirements 阶段
  -> Design 阶段
  -> Tasks 阶段
  -> Implementation 阶段
  -> Verification 阶段
```

Kiro 的关键启发就在这里：Spec 模式本身不是一份静态文档，而是一套阶段化开发体验。它先把需求写清楚，再写设计，再拆任务，最后才开始实现。

这些阶段都可以拥有自己的专属 workflow。

### Requirements 阶段：需求逼近工作流

`requirements.md` 不是简单记录用户第一句话。这个阶段可以内置一个 **头脑风暴 / 苏格拉底式追问 workflow**：

```text
workflow.spec-brainstorm
```

它专门服务 Requirements 阶段，目标是逼近用户真实需求：

- 用户到底想解决什么问题？
- 这个功能真正服务谁？
- 什么结果才算成功？
- 哪些约束不能碰？
- 哪些方案只是用户的初始想象？
- 有没有更简单、更直接的实现路径？
- 如果只能做一半，最重要的一半是什么？

这个阶段的产物可以是：

```text
brainstorm.md
decision-notes.md
open-questions.md
requirements.md
```

最后沉淀为 `requirements.md`。  
如果需求已经足够清楚，领导者也可以跳过头脑风暴，直接生成 requirements。

### Design 阶段：设计收敛工作流

`design.md` 也可以有自己的阶段 workflow：

```text
workflow.spec-design
```

它专门把需求翻译成技术设计：

- 影响哪些模块？
- 需要新增哪些协议、工具、状态或文档？
- 哪些部分属于机器层？
- 哪些判断必须留给领导者？
- 需要哪些测试保护？
- 有哪些旧逻辑要删除？

产物可以是：

```text
design.md
architecture-notes.md
risk-notes.md
```

### Tasks 阶段：任务拆解工作流

`tasks.md` 是 Spec 模式的进度面板，也可以有自己的阶段 workflow：

```text
workflow.spec-tasking
```

它专门把设计拆成可执行任务：

- 每个任务必须能独立验证。
- 每个任务应该对应明确文件、行为或测试。
- 可以标记依赖关系。
- 可以标记是否适合子代理、队友、后台任务或 Dreaming。
- 完成后用 markdown checklist 打勾。

产物是：

```text
tasks.md
task-sync-report.md
```

### Implementation 与 Verification 阶段

| Workflow | 作用 |
| --- | --- |
| `workflow.spec-implementation` | 按 `tasks.md` 推进实现，并实时更新 checklist |
| `workflow.spec-verification` | 把测试、证据、验收结果写回 `verification.md` |
| `workflow.spec-retrospective` | 完成后复盘 spec、代码和测试是否收敛 |

这些 workflow 仍然专属于 Spec 模式。普通 Agent 模式不需要暴露这一整套阶段流程，否则会让轻量任务变重。

### 阶段 workflow 的边界

Spec 模式下属 workflow 必须遵守同一原则：

- 它们只是能力，不是自动意图。
- 领导者决定是否进入某个阶段 workflow。
- 机器只维护文档、状态、证据和任务同步。
- 每个 workflow 都应该产出可审阅 artifact。
- 阶段完成由领导者判断，再通过工具更新文档状态。

这样 Spec 模式就不是一个单一命令，而是一个顶层开发模式；它下面有一组专门为文档驱动开发服务的阶段 workflow。

## 12. 最终目标

Kitty 的 Spec 模式不应该只是“写计划”。

它应该成为一种正式开发驾驶模式：

```text
用户意图 -> 规格文档 -> 技术设计 -> 任务文档 -> 执行 -> 验证 -> 收敛
```

这样模型再强也有轨道，模型再弱也不容易跑偏。

这正是 Kiro 和 Spec Kit 最值得借鉴的地方，也是 Kitty 可以做得更强的地方。
