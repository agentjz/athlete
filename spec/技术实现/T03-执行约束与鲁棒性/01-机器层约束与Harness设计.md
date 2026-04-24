# 机器层约束与 Harness 设计

## 文档目的

本文描述 Deadmouse 当前的机器层约束，说明这些约束落在什么代码边界上、由哪些状态承载、如何进入主路径，以及如何被测试保护。

## 模块目标与当前状态

当前机器层已经形成六类正式约束：

1. 稳定编辑语义
2. 工具调用协议
3. 错路拦截与回退路径
4. 完成门、验证门与验收门
5. 中断恢复与续跑
6. 上下文治理与压缩后恢复

当前实现目标是执行正确性，不是审批式安全。仓库仍只保留 `agent` 与 `read-only` 两种正式模式。

## 正式边界

当前主要代码边界如下：

- `src/tools/files/editIdentity.ts`
- `src/tools/files/readFileAnchors.ts`
- `src/tools/files/editAnchor.ts`
- `src/tools/files/editAnchorMatch.ts`
- `src/tools/files/writeExistingFileGuard.ts`
- `src/tools/files/writeDiagnostics.ts`
- `src/tools/shell/runShellTool.ts`
- `src/tools/toolArgumentContract.ts`
- `src/tools/shell/outputCapture.ts`
- `src/tools/background/backgroundTerminateTool.ts`
- `src/utils/commandRunner/run.ts`
- `src/execution/processProtocol.ts`
- `src/agent/turn/toolBatch.ts`
- `src/agent/turn/pendingToolCalls.ts`
- `src/agent/turn/compactionRecovery.ts`
- `src/agent/runtimeTransition/`
- `src/agent/session/snapshot.ts`

这些模块都挂在现有 `src/agent/` 与 `src/tools/` 边界内，没有另造额外的 harness 超级目录。

## 术语

- `稳定编辑语义`：读取、定位、修改、写回之间存在正式 identity 与锚点。
- `工具协议`：一次工具调用分为 `prepare -> execute -> finalize` 三个阶段。
- `错路拦截`：对明显错误的工具路径做机器层阻断，并给出回退方向。
- `完成门`：只有满足状态、验证和验收条件时，任务才允许收口。
- `恢复路径`：压缩、中断或异常后，沿正式状态继续推进而不是从头开始。

## 真相源与状态归属

机器层状态当前归属如下：

- `checkpoint.flow.pendingToolCalls`
- `checkpoint.flow.runState`
- `checkpoint.flow.compactionRecovery`
- `verificationState`
- `acceptanceState`
- `runtimeStats`
- `sessionDiff`

这些状态都持久化在 session snapshot 中，由 `src/agent/session/snapshot.ts` 统一读写和校验。

当前没有单独的审批状态文件、独立 closeout 真相源或宿主级恢复状态。

## 主路径

### 1. 稳定编辑语义

当前主路径为：

1. `read_file` 返回 `identity`、`anchors` 和 continuation 信息。
2. `edit_file` 要求 `expected_identity` 与 `edits[].anchor`。
3. 当前文件与读取时不一致时，直接以 stale identity 失败。
4. `apply_patch` 继续保留 patch 语义，不作为平行写工具体系扩张。

### 2. 工具协议与错路拦截

当前主路径为：

1. 工具先进入 registry 的 `prepare`。
2. `prepare` 统一完成参数 contract 校验和 guard；schema 不匹配时在 prepare fail closed，并带正式 blocked protocol。
3. 允许执行的调用进入 `execute`。
4. 结果经过 `finalize` 收口协议元数据。
5. 多工具批次由 `toolBatch.ts` 统一维护 `pendingToolCalls`、并行策略和结果顺序。

`run_shell` 在 execute 阶段继续走共享协议，但执行结果已扩展为正式 runtime 结构：状态、超时/中断标记、截断标记和输出落盘路径；长输出在执行中就被预览上界和落盘链路接管，而不是结束后再一次性裁切。

`run_shell / background_run / background_check / background_terminate` 现在共享 `deadmouse.exec.v1` 的轻量 process protocol 元数据，正式表达前后台的 start/read/terminate/exited/closed 等价语义。

### 3. 完成门与恢复路径

当前主路径为：

1. 共享 turn 执行推进 checkpoint、verification 和 acceptance。
2. 空 assistant 可见结果不会被当成完成，而是进入 continue transition。
3. 压缩后连续 no-text/空响应会记录到 `compactionRecovery`。
4. 超出恢复阈值后进入正式 recovery 或 pause，而不是假装成功。

## 模块职责与非职责

### 机器层负责

- 保证编辑、写回和工具执行的形式正确
- 把关键运行状态落到正式真相源
- 在异常时给出正式失败、继续或恢复路径

### 机器层不负责

- 宿主产品面
- provider 产品策略
- 审批式安全流
- 平行真相源的维护

## 失败路径与异常路径

当前明确处理以下失败路径：

- stale identity、缺失锚点、重叠 edits、模糊定位
- `write_file` 覆盖已有文件被阻断并回退到 `edit_file`
- `run_shell` 直接读取文件内容被阻断并回退到 `read_file`
- `run_shell` 长输出在执行中自动控上界并落盘，避免把超长原文直接挤入上下文或在本地执行层无限堆积
- `run_shell` 或其他工具参数不满足 schema 时，在 prepare 阶段稳定 fail closed，并且 execute 不会被触发
- `background_terminate` 通过统一 closeout contract 把后台执行收口为 `aborted`，不再依赖旁路状态
- 空 assistant 结果进入 continue，而不是完成
- 压缩后连续 no-text 响应进入恢复或 pause

## 测试与验证

当前主要由以下测试保护：

- `tests/machine-harness.test.ts`
- `tests/edit-anchors-and-feedback.test.ts`
- `tests/tool-batch-protocol.test.ts`
- `tests/compaction-recovery.test.ts`
- `tests/agent-recovery.test.ts`
- `tests/team-and-policy.test.ts`

## 当前落地决定

当前机器层的正式决定如下：

- 文件编辑统一采用“文件级 identity + 行级锚点”。
- 写工具统一返回 `changedPaths`、diff、diagnostics 与 session diff 摘要。
- `pendingToolCalls`、`runState` 与 `compactionRecovery` 都进入正式 session 状态。
- `runState` 在活跃 turn 中默认继承 busy，只在 yield、pause、completed 或异常收口时正式回到 idle。
- `run_shell` 统一返回结构化 runtime 结果，并在长输出场景提供落盘路径。
- tool 参数 contract 统一在 prepare 阶段校验，并以 blocked protocol 稳定收口。
- `run_shell / background_*` 统一返回 `deadmouse.exec.v1` process contract 元数据。
- `background_terminate` 成为正式 terminate surface，并把后台执行收口到统一 execution lifecycle。
- `read-only` 继续只禁止 mutation，不引入审批式安全流。
- completion gate 继续绑定现有 verification、acceptance 与 checkpoint 主路径。

