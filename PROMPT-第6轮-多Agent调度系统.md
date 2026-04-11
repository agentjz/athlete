# 第 6 轮强约束提示词：多 Agent 调度系统（建立在第 5 轮已完成的 SQLite 账本之上）

你是 `GPT-5.4 Codex`，正在 `athlete` 仓库中执行“第 6 轮：多 Agent 调度系统”。

## 第 5 轮已完成前提

以下内容视为已完成并且是当前主干事实：

1. 控制面正式真相源已经进入 SQLite，本地账本文件是 `.athlete/control-plane.sqlite`。
2. `TaskStore / TeamStore / ProtocolRequestStore / CoordinationPolicyStore / BackgroundJobStore / WorktreeStore` 已经切到账本。
3. 旧 JSON 真相源已经退出正式裁决。
4. `JSONL` 只保留为审计流 / 事件流：
   - `.athlete/team/messages.jsonl`
   - `.athlete/team/inbox/*.jsonl`
   - `.athlete/worktrees/events.jsonl`
5. `tests/control-plane-ledger.test.ts` 已经证明：
   - 干净初始化不依赖旧 JSON
   - 同一任务不能双 claim
   - orchestrator 不应吃到 legacy JSON 残影

本轮禁止回退到第 5 轮之前的状态。

如果你发现第 5 轮还有零星缺口，只允许做最小修补，不允许：

- 重新引入旧 JSON 真相源
- 重新引入双写
- 把本轮重新做成“存储替换工程”

## 这轮到底要做什么

这轮不是“多开几个 agent”。
这轮要做的是一个完整的多 Agent 调度系统，让系统真正知道：

1. 什么时候应该拆任务。
2. 拆出来之后应该给谁做。
3. 哪些必须等待，哪些可以并行。
4. 子结果回来后怎么合并，并推动主任务继续走。

## 本轮唯一目标

在“正式账本已经存在”的前提下，把 `lead / subagent / teammate / background` 这四类执行者的调度规则，收口成一个明确、可恢复、可验证、靠机器状态推进的调度系统。

目标不是加新角色名。
目标不是扩更多 prompt。
目标是让系统从“会派一点工”升级为“会 split / dispatch / wait / merge 的正式调度器”。

## 本轮完成后必须成立

1. `lead / subagent / teammate / background` 的路由规则清晰、集中、机器化。
2. 任务拆分、依赖、等待、完成、合流有明确生命周期。
3. readiness、ownership、handoff legality 从正式真相源推导，不靠 prompt 记忆。
4. 系统在 reload / continue / 中断后仍能恢复调度现场。
5. 旧错误调度残余不会继续和新调度模型并存裁决。
6. 文档、失败测试、实现、验证必须全部完成。

## 开工前必须先读

### 仓库内原则与规格

1. `spec/principles/README.md`
2. `spec/principles/P03-先计划再动手.md`
3. `spec/principles/P04-大任务拆给子智能体.md`
4. `spec/principles/P07-任务图要落盘.md`
5. `spec/principles/P08-慢操作放后台.md`
6. `spec/principles/P09-任务太大就分给队友.md`
7. `spec/principles/P10-队友之间要有统一协议.md`
8. `spec/principles/P11-队友自己认领任务.md`
9. `spec/principles/P12-工作区和任务要隔离.md`
10. `spec/principles/P19-先写失败测试再写实现.md`
11. `spec/principles/P21-没验过就不能收口.md`
12. `spec/principles/P22-阶段推进必须有机器状态.md`
13. `spec/principles/P24-错误兼容不能高于正确性.md`
14. `spec/principles/P25-新项目不为旧残余保活.md`
15. `spec/repo/开发规则.md`
16. `spec/architecture/总体架构.md`
17. `spec/architecture/状态与真相源.md`
18. `spec/modules/sqlite-ledger.md`
19. `spec/modules/workspace-isolation.md`
20. `spec/testing/测试策略.md`

### 当前实现

1. `src/orchestrator/`
2. `src/control/ledger/`
3. `src/tasks/`
4. `src/team/`
5. `src/background/`
6. `src/worktrees/`
7. `src/subagent/`
8. `src/agent/turn/managed.ts`
9. `src/agent/runTurn.ts`
10. `tests/control-plane-ledger.test.ts`
11. 与 orchestrator / task board / teammate / background / worktree 相关测试

### 参考目录

1. `REF/Claude Code/tasks/`
2. `REF/Claude Code/tools/AgentTool/`
3. `REF/Claude Code/tools/TaskCreateTool/`
4. `REF/Claude Code/tools/TaskUpdateTool/`
5. `REF/Claude Code/tools/shared/spawnMultiAgent.ts`
6. `REF/claw0/README.md`
7. `REF/learn-claude-code-main/agents/s04_subagent.py`
8. `REF/learn-claude-code-main/agents/s12_task_system.py`
9. `REF/learn-claude-code-main/agents/s13_background_tasks.py`
10. `REF/learn-claude-code-main/agents/s15_agent_teams.py`
11. `REF/learn-claude-code-main/agents/s16_team_protocols.py`
12. `REF/learn-claude-code-main/agents/s17_autonomous_agents.py`
13. `REF/learn-claude-code-main/agents/s18_worktree_task_isolation.py`

## 宪法铁律

1. 先改文档，再写失败测试，再写实现。
2. 这轮做的是“调度系统”，不是“再写一套 prompt 文案”。
3. 任务状态必须由机器推导，不能靠自由文本记住。
4. 一个文件只做一件主要事情。
5. orchestrator 不能越权直接干执行面细活。
6. 调度规则不能散落到多个不透明位置。
7. 不允许只会派工，不会等待和合流。
8. 不允许只补正常路径，不补恢复路径。
9. 不允许为了旧调度错误保留长期双轨。
10. 旧残余如阻碍主干，直接删除或重写。

## 固定执行顺序

1. 先读文档与参考。
2. 先更新 `spec/`，明确调度模型。
3. 先补失败测试。
4. 再实现调度生命周期。
5. 再清理旧残余调度路径。
6. 再做恢复与验证。
7. 最后做文档复核与实现复核。

## 文档阶段必须完成的事

至少更新这些文档，必要时新增模块文档或 ADR：

1. `spec/architecture/总体架构.md`
2. `spec/architecture/状态与真相源.md`
3. `spec/implementation/模块级开发任务单.md`
4. `spec/testing/测试策略.md`
5. 新增一个专门描述多 Agent 调度生命周期的模块文档

文档里必须明确：

1. lead 什么时候自己做，什么时候派 subagent，什么时候派 teammate，什么时候丢 background。
2. 任务拆分后，父任务与子任务的关系是什么。
3. readiness 是怎么推导的。
4. wait 条件是什么。
5. merge / join 条件是什么。
6. worktree 在调度里什么时候必须使用。
7. 中断后如何恢复调度现场。
8. 哪些旧调度残余不再保留，为什么不做长期兼容。
9. 本轮哪些状态是持久化的，哪些是由账本派生出来的。

## 失败测试必须先覆盖

至少覆盖这些场景：

1. 复杂任务会被拆成机器可识别的最小任务图。
2. lead 不会重复派发已经在跑的工作。
3. teammate 不会重复 claim 已被占用任务。
4. background 任务完成后，主流程能继续推进。
5. 需要等待时，系统会等待，而不是乱跑。
6. 子任务完成后，父任务会正确进入合流或完成状态。
7. worktree 绑定与任务归属不会漂移。
8. 重启后，调度系统仍能恢复“谁在做什么、接下来等什么”。
9. reviewer / verifier 之类边界如果存在，不能越权篡改派工结果。
10. 旧残余调度路径不会继续与新模型并存裁决。

## 实现阶段硬要求

1. 路由规则必须落在 orchestrator / control plane，不要塞进 prompt。
2. readiness、ownership、handoff legality 必须从正式真相源推导。
3. 调度必须覆盖四件事：`split / dispatch / wait / merge`。
4. 必须有最小但明确的机器生命周期；可以是持久化字段，也可以是从账本派生的稳定生命周期，但不能只剩 `pending / done` 两档粗粒度语义。
5. subagent、teammate、background 的边界要更清楚，不能互相混用。
6. 必须给恢复逻辑留出真实机器状态，而不是靠续跑提示词猜。
7. 如果现有目录已经能承载，就优先扩现有模块；不要新造一套平行 orchestrator。
8. 如果第 5 轮账本信息已经足够，优先在现有账本事实之上派生调度生命周期，不轻易新增重复状态。
9. 如旧调度残余与新模型冲突，允许直接删除或重写，不保留长期兼容。

## 本轮明确禁止

1. 禁止重做第 5 轮。
2. 禁止重新引入 JSON 真相源或双写。
3. 禁止只增加更多 agent 角色名，不做调度语义。
4. 禁止只做“派出去”，不做“等回来”和“合起来”。
5. 禁止把调度规则藏进 system prompt 长文案里。
6. 禁止让 lead、subagent、teammate、background 的职责再次混乱。
7. 禁止无边界扩写单文件。
8. 禁止顺手做 UI 或通道扩展。
9. 禁止为了旧错误路径长期保留双轨调度。

## 验收标准

只有同时满足以下条件，才能算本轮完成：

1. 文档已经定义清楚调度生命周期与旧残余清理边界。
2. 失败测试先补过，并且能证明旧实现不满足新要求。
3. 路由、等待、合流、恢复都有机器层实现。
4. `npm.cmd run check` 和 `npm.cmd test` 通过。
5. 最终系统已经不像“多个 agent 各自乱跑”，而像“一个会派工和收工的调度系统”。
6. 不存在把第 5 轮账本重新拉回 JSON / 双写 / prompt 记忆裁决的回退行为。

## 最终汇报格式

最终汇报必须包含：

1. 调度模型改了什么。
2. 先补了哪些失败测试。
3. `split / dispatch / wait / merge` 分别落在哪里。
4. 哪些旧的 prompt 型协调被机器状态替代了。
5. 哪些旧残余调度路径被删除、收口或重写。
6. 如何验证恢复与一致性。
7. 本轮刻意没做什么。
