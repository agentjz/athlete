# Harness主干四条强化路线

## 文档目的

本文单独说明当前 Harness 主干的四条已落地能力，以及它们对应的代码边界、状态归属和验证方式。

## 当前状态

当前四条主干能力已经全部落地：

1. 细粒度编辑锚点
2. 写后 diagnostics 与 session diff
3. continuation / compaction / degradation recovery
4. 完整工具批次执行制度

这些内容已经是现状说明，不再是实施顺序或未来路线图。

## 正式边界

### 1. 编辑锚点

主要文件：

- `src/tools/files/editAnchor.ts`
- `src/tools/files/editAnchorMatch.ts`
- `src/tools/files/readFileAnchors.ts`
- `src/tools/files/readFileTool.ts`
- `src/tools/files/editFileTool.ts`

### 2. 写后反馈

主要文件：

- `src/tools/files/writeDiagnostics.ts`
- `src/tools/files/toolChangeFeedback.ts`
- `src/agent/session/sessionDiff.ts`
- `src/changes/`

当前写工具共享输出包含：`changedPaths`、diff、diagnostics、session diff。

### 3. 退化恢复

主要文件：

- `src/agent/turn/compactionRecovery.ts`
- `src/agent/runTurn.ts`
- `src/agent/runtimeTransition/`

### 4. 工具批次执行制度

主要文件：

- `src/agent/turn/toolBatch.ts`
- `src/agent/turn/pendingToolCalls.ts`
- `src/agent/turn/toolHooks.ts`
- `src/tools/registry.ts`
- `src/tools/runtimeRegistry.ts`

## 状态与真相源

这四条主干使用的正式状态包括：

- `identity`
- `anchors`
- `sessionDiff`
- `checkpoint.flow.pendingToolCalls`
- `checkpoint.flow.runState`
- `checkpoint.flow.compactionRecovery`

这些状态都进入现有会话现场，不单独创建平行状态文件。

## 主路径

### 1. 编辑锚点主路径

`read_file` 先返回 identity 和 anchors，`edit_file` 再基于它们执行精修；过期 identity、过期锚点和重叠 edits 都会失败。

### 2. 写后反馈主路径

`write_file`、`edit_file` 和 `apply_patch` 在写入后统一返回 diff、diagnostics 和 session diff 摘要。

### 3. 退化恢复主路径

压缩或恢复后出现连续 no-text/空响应时，系统记录 recovery 状态并进入恢复或 pause，而不是从头开始任务。

### 4. 工具批次制度主路径

一条 assistant 消息中的多工具调用先统一 `prepare`，再按批次策略执行，并在 finalize 后清空 `pendingToolCalls`。
批次执行期间 `checkpoint.flow.runState` 会显式标记 busy；如果 turn 仍在继续下一轮模型请求，则保持 busy，只在 yield、pause、completed 或异常收口时回到 idle。

## 失败路径与异常路径

当前明确处理：

- 陈过期锚点、缺失锚点、重叠 edits
- 写后 diagnostics 失败不视为静默成功
- 压缩后连续空响应触发恢复
- 并行批次中任一工具不满足并发条件时，整批回到 sequential
- hook 抛错或阻断时，结果进入正式错误收口

## 测试与验证

当前主要由以下测试保护：

- `tests/edit-anchors-and-feedback.test.ts`
- `tests/tools-convergence.test.ts`
- `tests/compaction-recovery.test.ts`
- `tests/tool-batch-protocol.test.ts`
- `tests/runtime-checkpoint-resume.test.ts`

## 当前落地决定

当前四条主干的正式决定如下：

- 编辑锚点采用 Deadmouse 自己的“文件级 identity + 行级锚点”方案。
- 写后反馈先覆盖变更文件本身，并把会话级变化摘要落到 session snapshot。
- 退化恢复走共享 `runTurn` 主路径，Lead、teammate、subagent 使用同一套恢复判断。
- 工具批次制度统一走 shared tool batch protocol，不再各自拼接临时执行路径。
- run-state 显式落在 `checkpoint.flow`，busy/idle 与 turn 生命周期保持一致，并在工具批次之间继续维持正确归属。

