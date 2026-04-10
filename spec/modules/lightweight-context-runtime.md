# lightweight context runtime

## 目标

这一层负责让 Athlete 在长任务里继续跑，但不要把 prompt 和 session 越跑越重。

## 运行时约定

1. system prompt 按两层正式组装：
   - `Static operating layer`
   - `Dynamic runtime layer`
2. 静态层只放高层 operating contract：
   - identity / role contract
   - work loop contract
   - tool-use contract
   - communication / output contract
   - external content boundary
   - project instructions
3. 动态层放 cwd / root / date / taskState / todo / verification / checkpoint / task board / team / worktree / protocol / background / skill runtime 的紧凑摘要。
4. 动态层应省略空状态和低价值 `No ...` 噪音，但要保留 checkpoint、verification pending paths、externalized tool refs 这些恢复锚点。
5. 压缩后的会话总结不再直接拼回静态层，而是追加为 `Compressed conversation memory`。
6. request context 构建可以派生 prompt diagnostics，用于诊断但不落盘：
   - static / dynamic / memory chars
   - static / dynamic / memory block counts
   - block hotspot
   - total prompt chars
   - initial / final estimated request chars
   - 当前这次 compression 是否由 prompt 膨胀触发
   这些都只是派生观测，不是新的持久化真相源。

## 大 tool result 外置化

1. 当 tool output 超过约 `12,000` chars 或 `16 KB` 时，进入外置化路径。
2. 原始 output 落盘到项目 state root 下：
   - `.athlete/tool-results/<sessionId>/<timestamp>-<tool>-<hash>.json|txt`
3. session 里保留的 tool message 只存轻量引用：
   - `externalized: true`
   - `storagePath`
   - `summary`
   - `preview`
   - `byteLength`
   - `charLength`
4. 小结果继续走原来的 inline message 路径，不做无差别外置化。
5. 当 agent 读取 `.athlete/tool-results/...` 中的 artifact 文件时，`read_file` 默认返回紧凑摘要视图；只有显式 line range 读取才继续走原始逐行查看路径。

## 闭环要求

1. continuation 继续使用 session 中的轻量 tool message，而不是重新塞回原始大正文。
2. contextBuilder 在压缩历史时继续保留 `storagePath` 和预览信息。
3. contextBuilder 产出的 prompt diagnostics 必须只存在于当次 request 构建结果里，不能写回 session。
4. recovery 的 context shrink 也要保住结构化引用，不能把它打回不可追踪的大字符串。
5. session 保存和加载后，外置化引用仍然可以恢复到落盘文件。
6. 已通过 streaming delta 发出的 assistant 文本不会在 finalize 阶段再次整段重放。

## 验证方式

1. fail-first 测试：
   - `tests/runtime-lightweight-context.test.ts`
2. 核心回归：
   - `npm run test:build`
   - `npm run test:core`
3. 真实 API：
   - `npm run verify:runtime-context-api`
## Checkpoint Runtime Contract

- `SessionRecord` now persists a structured `checkpoint` inside the existing session truth source.
- `checkpoint` is a runtime summary, not a transcript dump. It carries:
  - objective
  - completedSteps
  - currentStep
  - nextStep
  - recentToolBatch
  - flow phase (`active / continuation / resume / recovery`)
  - priorityArtifacts (externalized tool-result refs, previews, pending paths)
- continuation, reload/resume, and dynamic prompt rendering must all consume the same checkpoint instead of inventing separate recovery hints.
- objective changes reset checkpoint progress so old work does not pollute the new task.
- externalized tool results remain the preferred recoverable context, and checkpoint keeps the references lightweight.
- verification 文案必须与 runtime 能力一致：targeted verification、lightweight readback、auto-readback 都是合法路径，不把所有改动都描述成必须全量 build/test。
- fail-first test for this layer: `tests/runtime-checkpoint-resume.test.ts`
- real API verification entry for this layer: `npm run verify:runtime-checkpoint-api`
