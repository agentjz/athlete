# P13 session 是任务现场

## 原则

session 不是聊天记录附件，而是任务现场。

## 为什么

Deadmouse 的核心价值之一是长任务不中断。

如果 session 只是普通历史消息：

- 续跑价值会很弱
- 压缩后容易丢失关键状态
- 长任务恢复会越来越不可靠

## 在 Deadmouse 里的含义

session 里应该能承接：

- 消息历史
- todo 状态
- verification 状态
- task state
- checkpoint
- runtimeStats
- sessionDiff
- 外部化工具结果引用

session 是可查询现场，不是默认注入给下一轮模型的历史正文。

## 恢复事实

恢复时不应该靠模型“记得上次做到哪”。

当前恢复事实由 session、checkpoint、runtimeStats、execution ledger 和 trace session 派生为低噪声摘要。摘要只告诉 Lead 当前现场事实，例如 objective、checkpoint phase、已完成步骤、证据数量、trace event 数和 active execution 数。

这个摘要不是新真相源，也不替 Lead 选择下一步。

## 当前对应

- `src/agent/session/`
- `src/agent/checkpoint/`
- `src/doctor/recoveryFacts.ts`
- `session_list` / `session_read` / `session_search` / `session_final_output`
