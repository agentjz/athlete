# Kitty 六大核心

Kitty 的核心体验是：

搜得到，看得懂，改得准，跑得通，记得住，能继续。

## Agent

Agent 负责一轮一轮驱动模型工作。

它问模型，执行工具，继续推进，最后收尾。它不替 Context、Session、Provider、Tools、Observability 做事。

## Context

Context 负责模型当前看到什么。

长上下文压缩属于这里，因为它决定哪些信息进入模型视野。

## Session

Session 负责连续性。

它保存对话脉络、工作记忆、checkpoint 和恢复状态。用户要的是任务还能继续，而不是每次从零开始。

## Provider / Config

Provider / Config 负责连接模型。

它处理不同模型 API 的差异，也处理临时失败恢复。网络抖动和 provider 临时失败不能轻易打断编程体验。

## Tools

Tools 是模型的手脚。

默认核心只有 `read`、`edit`、`write`、`bash`。搜索、Git、构建、测试都通过 `bash` 做。

## Extensions

Extensions 是 `super` 模式的扩展入口。

默认 `agent` 不加载扩展。当前真实扩展只有 Socratic workflow，用来围绕学习资料提问、解释、记录卡点和沉淀笔记。

## Observability

Observability 是记录仪。

它记录事件、终端日志和崩溃事实。它服务排查、复盘和恢复，不替模型决策。
