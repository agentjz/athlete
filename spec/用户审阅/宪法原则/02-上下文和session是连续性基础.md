# 上下文和 session 是连续性基础

Kitty 的长期价值是任务能继续。

Context 决定模型当前看到什么。Session 保存任务现场。Checkpoint、working memory、session brief 和压缩摘要都服务这个连续性。

这些结构提供事实，不替模型规划路线。

当前落点：

- `src/context/`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/checkpoint/`
