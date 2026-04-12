# Prompt 02: 统一执行者体系

## 状态

已完成。

本窗口已经完成的落点:

- Athlete 正式执行车道现在只剩两条:
  - `agent lane`
  - `command lane`
- `subagent` / `teammate` 不再是两套生命周期, 它们现在只是 `agent lane` 的两种 profile
- `background` 不再是一套独立 worker 制度, 它现在是 `command lane` 的 profile
- 执行真相源已经进入统一 execution ledger:
  - `src/control/ledger/executionRepo.ts`
  - `src/execution/store.ts`
- worker 启动协议已经收敛成统一入口:
  - `__worker__ run --execution-id <id>`
- 异步执行的结果回报已经统一成 `execution_closeout`
- `subagent` 已经不再是纯 memory-only 特例, 它也留下正式 execution/session/closeout
- task claim / worktree bind / result handoff 已经进入共享执行主路径
- 旧的 `team/background` 私有 worker / spawn 分叉已经下线
- 测试环境已经强制 stub worker, 不会再弹出一堆 Windows CMD 窗口

## 当前真实结构

### 正式执行模型

- execution 统一状态:
  - `queued`
  - `running`
  - `paused`
  - `completed`
  - `failed`
  - `aborted`
- lane 差异只保留在驱动方式, 不再保留为三套制度

### 当前关键目录

- `src/execution/`
  - `types.ts`
  - `store.ts`
  - `launch.ts`
  - `taskBinding.ts`
  - `closeout.ts`
  - `worker.ts`
  - `background.ts`
- `src/control/ledger/executionRepo.ts`
- `src/orchestrator/dispatch.ts`
- `src/orchestrator/progress.ts`
- `src/orchestrator/taskLifecycle.ts`
- `src/cli/commands/worker.ts`

### 当前已删除的旧分叉

- `src/team/worker.ts`
- `src/background/worker.ts`
- `src/background/spawn.ts`
- 原 `__worker__ teammate`
- 原 `__worker__ background`

## 已有保护测试

- `tests/execution-lanes.test.ts`
- `tests/orchestrator-dispatch.test.ts`
- `tests/orchestrator-routing.test.ts`
- `tests/orchestrator-scheduling.test.ts`
- `tests/orchestrator-managed-turn.test.ts`
- `tests/task-and-background.test.ts`
- `tests/team-and-policy.test.ts`
- `tests/worktree-isolation.test.ts`
- `tests/control-plane-ledger.test.ts`

## 后续窗口不要重做的事

- 不要把执行体系拉回三套角色各自活
- 不要恢复 lane 私有 worker 命令
- 不要再让测试真实拉起可见 CMD 窗口
- 不要为了旧残余再保留 background/team 私有真相源

## 交接给 Prompt 03 的当前基线

- execution lane 统一化已经完成
- 当前下一阶段应该把 `tools / skills / MCP / host extra tools` 做成真正的平台扩展底座
- 新窗口可以直接把 Prompt 02 当成已完成前置, 不需要再回头修执行体系
