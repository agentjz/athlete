# 第 5 轮强约束提示词：状态底座升级到 SQLite 本地账本（已完成）

> 状态：已完成
> 完成日期：2026-04-11
> 验证结果：`npm.cmd run check` 与 `npm.cmd test` 已通过

## 本轮完成摘要

1. `task / team / protocol request / background / worktree` 的正式真相源已收口到 SQLite。
2. 正式账本文件已固定为 `.athlete/control-plane.sqlite`。
3. 旧 JSON 真相源已退出正式状态裁决。
4. `JSONL` 仅保留为审计流 / 事件流：
   - `.athlete/team/messages.jsonl`
   - `.athlete/team/inbox/*.jsonl`
   - `.athlete/worktrees/events.jsonl`
5. 已新增账本实现与文档：
   - `src/control/ledger/`
   - `spec/modules/sqlite-ledger.md`
   - `tests/control-plane-ledger.test.ts`
6. 已明确清理或停用的旧控制面真相路径：
   - `.athlete/tasks/`
   - `.athlete/team/config.json`
   - `.athlete/team/policy.json`
   - `.athlete/team/requests/`
   - `.athlete/team/background/`
   - `.athlete/worktrees/index.json`

## 归档说明

本文件保留为第 5 轮任务归档。

后续轮次默认以“SQLite 本地账本已完成并生效”为前提，不得重新引入：

- 旧 JSON 真相源
- 双写
- 平行裁决路径
- 为旧状态保活的长期兼容层

---

# 第 5 轮原始强约束提示词

你是 `GPT-5.4 Codex`，正在 `athlete` 仓库中执行“第 5 轮：状态底座升级”。

这是一个新项目，不需要为错误旧结构、旧状态、旧残余写长期兼容。
如果旧控制面 JSON、旧状态文件、旧双写路径会拖累新架构，直接删除、停用、清理。
不要为了“平滑一点”继续背历史包袱。

本轮不是讨论题，不是方案草稿，不是半成品重构。
本轮必须完整收口。

## 本轮唯一目标

把 `task / team / protocol request / background / worktree` 这些控制面真相源，从“多个 JSON 文件分别记事”升级为“一个正式的 SQLite 本地账本”。

目标不是加新功能。
目标是让系统从“很多文件各自记状态”进化为“一个明确记录谁在做什么、谁先谁后、冲突怎么处理的正式账本”。

## 本轮完成后必须成立

1. `task / team / protocol request / background / worktree` 的正式真相源进入 SQLite。
2. 旧 JSON 不再作为正式状态裁决真相。
3. 如需保留 JSONL，只能作为审计流、事件流、导出物，不能再参与机器裁决。
4. 不写长期兼容层，不保留双写，不保留平行真相源。
5. 如果旧状态结构阻碍新账本，允许直接清理，不要求保活。
6. 文档、失败测试、实现、验证必须全部完成。

## 开工前必须先读

### 仓库内原则与规格

1. `spec/principles/README.md`
2. `spec/principles/P07-任务图要落盘.md`
3. `spec/principles/P13-session是任务现场.md`
4. `spec/principles/P18-主循环和文件都不能长胖.md`
5. `spec/principles/P19-先写失败测试再写实现.md`
6. `spec/principles/P21-没验过就不能收口.md`
7. `spec/principles/P22-阶段推进必须有机器状态.md`
8. `spec/principles/P24-错误兼容不能高于正确性.md`
9. `spec/principles/P25-新项目不为旧残余保活.md`
10. `spec/repo/开发规则.md`
11. `spec/architecture/总体架构.md`
12. `spec/architecture/状态与真相源.md`
13. `spec/testing/测试策略.md`

### 当前实现

1. `src/tasks/store.ts`
2. `src/team/store.ts`
3. `src/team/requestStore.ts`
4. `src/team/policyStore.ts`
5. `src/background/store.ts`
6. `src/worktrees/store.ts`
7. `src/agent/session/store.ts`
8. `src/project/statePaths.ts`
9. `src/orchestrator/`
10. `tests/` 下与 task / team / background / worktree / orchestrator 相关测试

### 参考目录

1. `REF/Claude Code/tasks/`
2. `REF/Claude Code/tools/TaskCreateTool/`
3. `REF/Claude Code/tools/TaskUpdateTool/`
4. `REF/Claude Code/tools/TeamCreateTool/`
5. `REF/claw0/README.md`
6. `REF/learn-claude-code-main/agents/s12_task_system.py`
7. `REF/learn-claude-code-main/agents/s13_background_tasks.py`
8. `REF/learn-claude-code-main/agents/s15_agent_teams.py`
9. `REF/learn-claude-code-main/agents/s16_team_protocols.py`
10. `REF/learn-claude-code-main/agents/s18_worktree_task_isolation.py`

## 宪法铁律

1. 先改文档，再写失败测试，再写实现。
2. 必须先写失败测试，不能先偷写实现。
3. 文档和代码必须同步，不能只改一边。
4. 单文件默认不超过 300 行；超过就主动拆。
5. 一个文件只做一件主要事情。
6. 不允许为了旧状态保留长期兼容层。
7. 不允许继续保留双写、平行真相源、影子路径。
8. 不允许只做存储替换，不补状态语义和冲突裁决。
9. 不允许把控制面判断偷偷塞进工具细节里。
10. 遇到错误旧残余，需要删就删，需要清就清。

## 固定执行顺序

1. 先读文档和参考。
2. 先更新 `spec/`，把 SQLite 单一本地账本的目标、边界、清理策略写清楚。
3. 先补失败测试。
4. 再做实现。
5. 再清理旧残余。
6. 再跑验证。
7. 最后做一次文档与实现一致性复查。

## 文档阶段必须完成的事

至少更新这些文档，必要时新增模块文档或 ADR：

1. `spec/architecture/状态与真相源.md`
2. `spec/architecture/总体架构.md`
3. `spec/implementation/模块级开发任务单.md`
4. `spec/testing/测试策略.md`
5. 如有必要，新增一个专门描述 SQLite 账本的模块文档或 ADR

文档里必须明确：

1. SQLite 数据库文件放在哪里。
2. 哪些实体进入账本。
3. 哪些 JSON / JSONL 只保留为审计，不再是真相源。
4. 哪些旧控制面文件直接废弃或清理。
5. 为什么本轮不做长期兼容。
6. 并发写入时由谁裁决。
7. 为什么这轮是为多 Agent 打地基，而不是单纯换存储。

## 失败测试必须先覆盖

至少覆盖这些场景：

1. 新账本可以在干净状态下完成正式初始化，不依赖旧 JSON。
2. 重载后 task / team / background / worktree 的状态保持一致。
3. 同一任务不会被两个主体同时成功 claim。
4. worktree 绑定不会因为重载或并发写入而失真。
5. 协议请求的 pending / approved / rejected 状态可持久化且一致。
6. 背景任务的 running / completed / failed / timed_out 状态不会丢失。
7. orchestrator 读取到的仍然是统一真相，而不是并行文件残影。
8. 旧 JSON 不再被当作正式真相源继续写入或双写。
9. 如果实现了清理旧残余的路径，要证明清理后不会影响新账本主干。

## 实现阶段硬要求

1. 允许新增 SQLite 依赖，但必须选稳定、简单、适合本地单机账本的方案。
2. 必须建立清晰的数据访问层，不要把 SQL 散落到业务模块里。
3. 必须把“实体结构”“建表/迁移”“查询/写入”“领域语义”拆开，不要塞进巨型文件。
4. 保持 `TaskStore / TeamStore / ProtocolRequestStore / BackgroundJobStore / WorktreeStore` 的上层语义稳定，但底层改为 SQLite。
5. 旧 JSON 真相源必须下线，不得继续裁决。
6. 不能破坏现有 session / checkpoint / runtime stats 行为。
7. 如果旧控制面结构阻碍新架构，允许直接停用、删除、重建，不保留长期兼容。

## 本轮明确禁止

1. 禁止顺手加无关新功能。
2. 禁止借机重写整个 runtime。
3. 禁止把控制面全都塞进一个 `database.ts` 巨型文件。
4. 禁止为了旧状态保留长期兼容层。
5. 禁止继续双写。
6. 禁止“测试先绿、文档后补”。
7. 禁止留 `TODO: later migrate` 作为阶段收口。

## 验收标准

只有同时满足以下条件，才能算本轮完成：

1. `spec/` 已更新，且准确描述新真相源与旧残余清理策略。
2. 失败测试先写过，并能证明旧实现不满足新要求。
3. 所有相关测试通过。
4. `npm.cmd run check` 和 `npm.cmd test` 通过。
5. 旧 JSON 真相源已经退出正式状态裁决。
6. 本轮结束后，别人只看文档就能理解账本结构与清理边界。

## 最终汇报格式

最终汇报必须包含：

1. 文档改了什么。
2. 失败测试先补了哪些。
3. SQLite 账本最终覆盖了哪些实体。
4. 哪些旧 JSON / 残余路径被淘汰、清理或降级为审计。
5. 如何验证一致性与冲突裁决。
6. 还剩哪些明确不在本轮范围内的问题。
